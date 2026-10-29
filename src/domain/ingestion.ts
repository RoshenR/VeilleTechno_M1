import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { RANKING_SIGNATURE, refreshProjectInsights } from "./insights";
import { afterRun, getOpsState, setOpsState } from "./ops";
import { syncAdvisories } from "./security";
import { SOURCE_CATALOG } from "./sources/catalog";
import { fetchReleases, setGithubBlockedUntil } from "./sources/github";
import { FetchError, fetchText } from "./sources/http";
import type { NormalizedItem } from "./sources/normalize";
import { parseFeed } from "./sources/rss";

type Db = SupabaseClient<Database>;
type SourceRow = Database["public"]["Tables"]["sources"]["Row"];

const REFRESH_AFTER_MS = 6 * 3600_000; // a source is re-fetched at most every 6 h by the scheduler
const MANUAL_CACHE_MS = 30 * 60_000; // manual refresh reuses anything fetched in the last 30 min
const STALE_LOCK_MS = 10 * 60_000;
const SOURCE_BATCH = 4;
const PROJECT_BATCH = 5;

export async function syncCatalog(db: Db) {
  const { error } = await db.from("sources").upsert(
    SOURCE_CATALOG.map((s) => ({
      kind: s.kind,
      key: s.key,
      name: s.name,
      site_url: s.siteUrl,
      language: s.language,
      tech_keys: s.techKeys,
      quality: s.quality,
      is_official: s.isOfficial,
      in_catalog: true,
    })),
    { onConflict: "kind,key" },
  );
  if (error) throw new Error(`Synchronisation du catalogue : ${error.message}`);
}

/** Store normalized items idempotently. Returns the number of new items. */
export async function storeItems(db: Db, source: Pick<SourceRow, "id" | "language">, items: NormalizedItem[]): Promise<number> {
  const byUrl = new Map<string, NormalizedItem>();
  for (const it of items) if (!byUrl.has(it.canonicalUrl)) byUrl.set(it.canonicalUrl, it);
  const unique = [...byUrl.values()];
  if (!unique.length) return 0;

  const [{ data: sameSource, error: e1 }, { data: sameUrl, error: e2 }] = await Promise.all([
    db.from("content_items").select("external_id, canonical_url").eq("source_id", source.id).in("external_id", unique.map((i) => i.externalId)),
    db.from("content_items").select("source_id, external_id, canonical_url").in("canonical_url", unique.map((i) => i.canonicalUrl)),
  ]);
  if (e1 || e2) throw new Error((e1 ?? e2)!.message);
  const known = new Map((sameSource ?? []).map((r) => [r.external_id, r.canonical_url]));
  const urlOwner = new Map((sameUrl ?? []).map((r) => [r.canonical_url, `${r.source_id}|${r.external_id}`]));

  const now = new Date().toISOString();
  const rows = unique
    .filter((it) => {
      const owner = urlOwner.get(it.canonicalUrl);
      // Same URL already stored under another identity (other source or changed guid): keep the first one.
      if (owner && owner !== `${source.id}|${it.externalId}`) return false;
      // Same identity but its URL now collides with something else: skip rather than violate uniqueness.
      const prevUrl = known.get(it.externalId);
      return !(prevUrl && prevUrl !== it.canonicalUrl && urlOwner.has(it.canonicalUrl));
    })
    .map((it) => ({
      source_id: source.id,
      external_id: it.externalId,
      canonical_url: it.canonicalUrl,
      title: it.title,
      excerpt: it.excerpt,
      content_kind: it.kind,
      is_prerelease: it.isPrerelease,
      release_tag: it.releaseTag,
      language: source.language,
      published_at: it.publishedAt,
      content_hash: it.contentHash,
      last_seen_at: now,
    }));
  if (!rows.length) return 0;
  const { error } = await db.from("content_items").upsert(rows, { onConflict: "source_id,external_id" });
  if (error) throw new Error(error.message);
  return rows.filter((r) => !known.has(r.external_id)).length;
}

const GITHUB_BLOCK_KEY = "github_block";

/** A quota hit on one repository defers every GitHub source until the reset, persisted for other instances. */
async function deferGithub(db: Db, untilMs: number) {
  const until = new Date(untilMs).toISOString();
  setGithubBlockedUntil(untilMs);
  await setOpsState(db, GITHUB_BLOCK_KEY, { until });
  await db.from("sources").update({ next_fetch_at: until, last_error_kind: "quota" }).eq("kind", "github").lt("next_fetch_at", until);
}

export async function loadGithubBlock(db: Db) {
  const s = await getOpsState<{ until?: string }>(db, GITHUB_BLOCK_KEY);
  if (s?.until) setGithubBlockedUntil(Date.parse(s.until));
}

export type SourceOutcome = { newItems: number; error: string | null; deferred?: boolean };

export async function fetchSource(db: Db, source: SourceRow): Promise<SourceOutcome> {
  const now = Date.now();
  try {
    const cond = { etag: source.etag, lastModified: source.last_modified };
    let result: { status: "not_modified" } | { status: "ok"; items: NormalizedItem[]; etag: string | null; lastModified: string | null };
    if (source.kind === "rss") {
      const r = await fetchText(source.key, cond);
      result = r.status === "ok" ? { status: "ok", items: parseFeed(r.body, source.key), etag: r.etag, lastModified: r.lastModified } : r;
    } else {
      result = await fetchReleases(source.key, cond);
    }
    const newItems = result.status === "ok" ? await storeItems(db, source, result.items) : 0;
    await db
      .from("sources")
      .update({
        last_fetched_at: new Date(now).toISOString(),
        last_success_at: new Date(now).toISOString(),
        last_error: null,
        last_error_kind: null,
        consecutive_failures: 0,
        next_fetch_at: new Date(now + REFRESH_AFTER_MS).toISOString(),
        ...(result.status === "ok" ? { etag: result.etag, last_modified: result.lastModified } : {}),
      })
      .eq("id", source.id);
    return { newItems, error: null };
  } catch (e) {
    const kind = e instanceof FetchError ? e.kind : "invalid";
    const retryAfter = e instanceof FetchError && e.retryAfterSeconds ? e.retryAfterSeconds * 1000 : 0;
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    // A rate limit is not the source's fault: postpone to the documented time, without counting a failure.
    if (kind === "quota" || kind === "secondary_quota") {
      const until = now + Math.max(retryAfter, 60_000);
      if (source.kind === "github") await deferGithub(db, until);
      else await db.from("sources").update({ next_fetch_at: new Date(until).toISOString(), last_error_kind: kind }).eq("id", source.id);
      return { newItems: 0, error: null, deferred: true };
    }
    const failures = source.consecutive_failures + 1;
    const backoff = Math.max(retryAfter, Math.min(24 * 3600_000, 30 * 60_000 * 2 ** (failures - 1)));
    await db
      .from("sources")
      .update({ last_fetched_at: new Date(now).toISOString(), last_error: message, last_error_kind: kind, consecutive_failures: failures, next_fetch_at: new Date(now + backoff).toISOString() })
      .eq("id", source.id);
    return { newItems: 0, error: message };
  }
}

/** Sources worth collecting: the shared catalog plus any source a project subscribed to. */
async function collectableSourceIds(db: Db): Promise<Set<string> | null> {
  // ponytail: loads all subscriptions in memory; switch to an SQL view when there are many thousands.
  const { data } = await db.from("project_sources").select("source_id");
  return new Set((data ?? []).map((r) => r.source_id));
}

type RunResult =
  | { status: "busy" }
  | { status: "completed" | "partial"; runId: string; sourcesDone: number; sourcesFailed: number; sourcesDeferred: number; itemsNew: number; projectsRefreshed: number; advisoriesUpdated: number };

/**
 * One bounded, resumable ingestion pass. Progress lives in the database (sources.next_fetch_at,
 * projects.insights_refreshed_at), so calling it again simply continues where it stopped.
 */
export async function runIngestion(db: Db, opts: { trigger: "cron" | "cli"; budgetMs: number; log?: (m: string) => void }): Promise<RunResult> {
  const log = opts.log ?? (() => {});
  const deadline = Date.now() + opts.budgetMs;
  await syncCatalog(db);

  const runId = await acquireLock(db, opts.trigger);
  if (!runId) return { status: "busy" };

  const stats = { sourcesDone: 0, sourcesFailed: 0, sourcesDeferred: 0, itemsNew: 0, projectsRefreshed: 0, advisoriesUpdated: 0 };
  await loadGithubBlock(db);
  const errors: { source: string; error: string }[] = [];
  let remaining = false;
  try {
    const subscribed = await collectableSourceIds(db);
    const skipped = new Set<string>();
    for (;;) {
      if (Date.now() > deadline) {
        remaining = true;
        break;
      }
      const { data: due, error } = await db.from("sources").select("*").lte("next_fetch_at", new Date().toISOString()).order("next_fetch_at").limit(SOURCE_BATCH + skipped.size);
      if (error) throw new Error(error.message);
      const batch = (due ?? []).filter((s) => !skipped.has(s.id) && (s.in_catalog || subscribed?.has(s.id))).slice(0, SOURCE_BATCH);
      for (const s of due ?? []) if (!s.in_catalog && !subscribed?.has(s.id)) skipped.add(s.id);
      if (!batch.length) break;
      const results = await Promise.all(batch.map((s) => fetchSource(db, s)));
      results.forEach((r, i) => {
        if (r.deferred) {
          stats.sourcesDeferred++;
          log(`↷ ${batch[i].name} : reporté (quota)`);
        } else if (r.error) {
          stats.sourcesFailed++;
          errors.push({ source: batch[i].name, error: r.error });
          log(`✗ ${batch[i].name} : ${r.error}`);
        } else {
          stats.sourcesDone++;
          stats.itemsNew += r.newItems;
          log(`✓ ${batch[i].name} : ${r.newItems} nouveau(x)`);
        }
      });
      await db.from("ingestion_runs").update({ heartbeat_at: new Date().toISOString(), sources_done: stats.sourcesDone, sources_failed: stats.sourcesFailed, sources_deferred: stats.sourcesDeferred, items_new: stats.itemsNew, errors }).eq("id", runId);
    }

    // Recompute insights for active projects whose feed may have changed, or whose analyses were made
    // with older rules / catalogs (signature mismatch): targeted, background, bounded.
    const { data: latest } = await db.from("content_items").select("collected_at").order("collected_at", { ascending: false }).limit(1);
    const latestAt = latest?.[0]?.collected_at ?? new Date(0).toISOString();
    const done = new Set<string>();
    for (;;) {
      if (Date.now() > deadline) {
        remaining = true;
        break;
      }
      const { data: projects, error } = await db
        .from("projects")
        .select("id")
        .is("archived_at", null)
        .neq("stage", "paused")
        .or(`insights_refreshed_at.is.null,insights_refreshed_at.lt.${latestAt},ranking_signature.is.null,ranking_signature.neq.${RANKING_SIGNATURE}`)
        .order("insights_refreshed_at", { ascending: true, nullsFirst: true })
        .limit(PROJECT_BATCH + done.size);
      if (error) throw new Error(error.message);
      const batch = (projects ?? []).filter((p) => !done.has(p.id)).slice(0, PROJECT_BATCH);
      if (!batch.length) break;
      for (const p of batch) {
        done.add(p.id);
        try {
          await refreshProjectInsights(db, p.id);
          stats.projectsRefreshed++;
        } catch (e) {
          errors.push({ source: `projet ${p.id.slice(0, 8)}`, error: (e as Error).message.slice(0, 200) });
        }
      }
    }
    log(`Analyses recalculées : ${stats.projectsRefreshed} projet(s)`);

    // Security advisories: modified / withdrawn advisories for tracked packages, then targeted recomputation.
    if (Date.now() < deadline) {
      try {
        const adv = await syncAdvisories(db, { deadline, log });
        stats.advisoriesUpdated = adv.updated;
        if (adv.incomplete) remaining = true;
      } catch (e) {
        errors.push({ source: "avis de sécurité", error: (e as Error).message.slice(0, 200) });
      }
    } else remaining = true;

    const status = remaining ? "partial" : "completed";
    await db
      .from("ingestion_runs")
      .update({ status, finished_at: new Date().toISOString(), heartbeat_at: new Date().toISOString(), sources_done: stats.sourcesDone, sources_failed: stats.sourcesFailed, sources_deferred: stats.sourcesDeferred, items_new: stats.itemsNew, projects_refreshed: stats.projectsRefreshed, advisories_updated: stats.advisoriesUpdated, errors })
      .eq("id", runId);
    await afterRun(db, status, errors.at(-1)?.error ?? "—").catch(() => {});
    return { status, runId, ...stats };
  } catch (e) {
    await db.from("ingestion_runs").update({ status: "failed", finished_at: new Date().toISOString(), errors: [...errors, { source: "run", error: (e as Error).message }] }).eq("id", runId);
    await afterRun(db, "failed", (e as Error).message).catch(() => {});
    throw e;
  }
}

async function acquireLock(db: Db, trigger: "cron" | "cli"): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await db.from("ingestion_runs").insert({ trigger }).select("id").single();
    if (!error) return data.id;
    if (error.code !== "23505") throw new Error(error.message);
    // Another run holds the lock. Take it over only if its heartbeat is stale (crashed / timed out).
    const staleBefore = new Date(Date.now() - STALE_LOCK_MS).toISOString();
    const { data: stale } = await db
      .from("ingestion_runs")
      .update({ status: "failed", finished_at: new Date().toISOString() })
      .eq("status", "running")
      .neq("trigger", "manual")
      .lt("heartbeat_at", staleBefore)
      .select("id");
    if (!stale?.length) return null;
  }
  return null;
}

/**
 * User-triggered refresh: only the user's subscribed sources, reusing anything fetched recently.
 * Caller must have checked authentication and rate limit. Uses the service role for public writes only.
 */
export async function refreshSourcesForUser(admin: Db, sourceIds: string[]) {
  if (!sourceIds.length) return { fetched: 0, failed: 0, itemsNew: 0 };
  const cacheBefore = new Date(Date.now() - MANUAL_CACHE_MS).toISOString();
  const { data } = await admin.from("sources").select("*").in("id", sourceIds).or(`last_fetched_at.is.null,last_fetched_at.lt.${cacheBefore}`).limit(12);
  await loadGithubBlock(admin);
  const results = await Promise.all((data ?? []).map((s) => fetchSource(admin, s)));
  return { fetched: results.length, failed: results.filter((r) => r.error).length, deferred: results.filter((r) => r.deferred).length, itemsNew: results.reduce((n, r) => n + r.newItems, 0) };
}

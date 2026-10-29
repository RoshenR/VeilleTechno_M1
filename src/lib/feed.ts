import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRIORITY_THRESHOLD, type Priority } from "@/domain/ranking";
import { CONTENT_KINDS, type ContentKind } from "@/domain/sources/normalize";
import type { Database } from "./database.types";

type Db = SupabaseClient<Database>;

export const PAGE_SIZE = 15;
export const HIGHLIGHTS = 3;

export const SECTIONS = ["news", "security", "background"] as const;
export type Section = (typeof SECTIONS)[number];
const SECTION_PARAM: Record<string, Section> = { securite: "security", fond: "background" };

export type FeedFilters = {
  project?: string;
  tech?: string;
  kind?: ContentKind;
  source?: string;
  period?: "7" | "30" | "90" | "365";
  read?: "unread" | "read";
  q?: string;
  sort: "relevance" | "date";
  section: Section;
  /** Opaque keyset cursor (see encodeCursor). */
  after?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseFilters(sp: Record<string, string | string[] | undefined>): FeedFilters {
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const kind = one("type");
  const period = one("periode");
  const read = one("lecture");
  const uuid = (v?: string) => (v && UUID.test(v) ? v : undefined);
  return {
    project: uuid(one("projet")),
    tech: one("techno")?.slice(0, 60),
    kind: CONTENT_KINDS.includes(kind as ContentKind) ? (kind as ContentKind) : undefined,
    source: uuid(one("source")),
    period: ["7", "30", "90", "365"].includes(period ?? "") ? (period as FeedFilters["period"]) : undefined,
    read: read === "unread" || read === "read" ? read : undefined,
    q: one("q")?.trim().slice(0, 100) || undefined,
    sort: one("tri") === "date" ? "date" : "relevance",
    section: SECTION_PARAM[one("section") ?? ""] ?? "news",
    after: one("apres")?.slice(0, 300),
  };
}

export type ProjectInsightView = {
  projectId: string;
  projectName: string;
  score: number;
  priority: Priority;
  why: string;
  matchedTechs: string[];
};

export type FeedEntry = {
  item: {
    id: string;
    title: string;
    url: string;
    excerpt: string | null;
    kind: ContentKind;
    isPrerelease: boolean;
    releaseTag: string | null;
    publishedAt: string | null;
    sourceId: string;
    sourceName: string;
    language?: string | null;
    isDemo?: boolean;
  };
  projects: ProjectInsightView[];
  bestScore: number;
  isRead: boolean;
  isFavorite: boolean;
};

type Cursor = { s: number; d: string; i: string; v: string };
export const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
export function decodeCursor(raw?: string): Cursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof c.s === "number" && typeof c.d === "string" && UUID.test(c.i) && typeof c.v === "string") return c;
  } catch {}
  return null;
}

/** ILIKE pattern characters are escaped: the search is a plain substring match. */
const escapeLike = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

type Row = Database["public"]["Functions"]["feed_page"]["Returns"][number];
const toEntry = (r: Row): FeedEntry => ({
  item: {
    id: r.id,
    title: r.title,
    url: r.canonical_url,
    excerpt: r.excerpt,
    kind: r.content_kind as ContentKind,
    isPrerelease: r.is_prerelease,
    releaseTag: r.release_tag,
    publishedAt: r.published_at,
    sourceId: r.source_id,
    sourceName: r.source_name ?? "Source",
    language: r.language,
  },
  projects: r.projects as unknown as ProjectInsightView[],
  bestScore: r.best_score,
  isRead: r.is_read,
  isFavorite: r.is_favorite,
});

/**
 * Feed page: filters, search and sort run in PostgreSQL (feed_items / feed_page) before pagination.
 * Keyset pagination with id as tie-breaker; the cursor carries a ranking version (latest recomputation)
 * so a page reached after a recomputation is flagged instead of silently mixing two rankings.
 */
export async function loadFeed(db: Db, f: FeedFilters) {
  const base = {
    p_project: f.project,
    p_tech: f.tech,
    p_kind: f.kind,
    p_source: f.source,
    p_since: f.period ? new Date(Date.now() - Number(f.period) * 86_400_000).toISOString() : undefined,
    p_q: f.q ? escapeLike(f.q) : undefined,
  };
  let versionQ = db.from("projects").select("insights_refreshed_at").order("insights_refreshed_at", { ascending: false, nullsFirst: false }).limit(1);
  if (f.project) versionQ = versionQ.eq("id", f.project);
  const cursor = decodeCursor(f.after);

  // Highlights (« À retenir »): unread, relevant enough, stable releases only — never padded.
  const [{ data: top, error: e1 }, { data: ver }] = await Promise.all([
    db
      .rpc("feed_items", { ...base, p_read: "unread" })
      .gte("best_score", PRIORITY_THRESHOLD)
      .eq("is_prerelease", false)
      .order("best_score", { ascending: false })
      .order("sort_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(HIGHLIGHTS),
    versionQ,
  ]);
  if (e1) throw new Error(e1.message);
  const priorities = (top ?? []).map(toEntry);
  const exclude = priorities.map((e) => e.item.id);
  const version = ver?.[0]?.insights_refreshed_at ?? "0";

  const [{ data: rows, error: e2 }, news, security, background] = await Promise.all([
    db.rpc("feed_page", {
      ...base,
      p_read: f.read,
      p_section: f.section,
      p_sort: f.sort,
      p_limit: PAGE_SIZE + 1,
      p_exclude: exclude,
      ...(cursor ? { p_after_score: cursor.s, p_after_date: cursor.d, p_after_id: cursor.i } : {}),
    }),
    countSection(db, { ...base, p_read: f.read }, "news", exclude),
    countSection(db, { ...base, p_read: f.read }, "security", exclude),
    countSection(db, { ...base, p_read: f.read }, "background", exclude),
  ]);
  if (e2) throw new Error(e2.message);
  const page = (rows ?? []).slice(0, PAGE_SIZE);
  const last = page.at(-1);
  const next = (rows ?? []).length > PAGE_SIZE && last ? encodeCursor({ s: last.best_score, d: last.sort_date, i: last.id, v: version }) : null;
  return {
    priorities,
    entries: page.map(toEntry),
    counts: { news, security, background } as Record<Section, number>,
    next,
    isFirstPage: !cursor,
    rankingChanged: Boolean(cursor && cursor.v !== version),
  };
}

async function countSection(db: Db, args: Database["public"]["Functions"]["feed_items"]["Args"], section: Section, exclude: string[]) {
  let q = db.rpc("feed_items", args, { count: "exact", head: true }).eq("section", section);
  if (exclude.length) q = q.not("id", "in", `(${exclude.join(",")})`);
  const { count } = await q;
  return count ?? 0;
}

/** Freshness for the everyday UI: last successful run + subscribed sources currently unavailable. Diagnostics stay in ops tools. */
export async function loadSyncStatus(db: Db) {
  const [{ data: runs }, { data: subs }] = await Promise.all([
    db.from("ingestion_runs").select("status, started_at, finished_at, trigger").neq("trigger", "manual").order("started_at", { ascending: false }).limit(1),
    db.from("project_sources").select("sources(id, name, last_error, last_error_kind, last_success_at, next_fetch_at)"),
  ]);
  const failing = new Map<string, { name: string; lastSuccess: string | null; deferred: boolean; nextAttempt: string }>();
  for (const s of subs ?? []) {
    const src = s.sources;
    if (!src) continue;
    const deferred = src.last_error_kind === "quota" || src.last_error_kind === "secondary_quota";
    if (src.last_error || deferred) failing.set(src.id, { name: src.name, lastSuccess: src.last_success_at, deferred, nextAttempt: src.next_fetch_at });
  }
  return { lastRun: runs?.[0] ?? null, failing: [...failing.values()] };
}

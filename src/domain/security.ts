import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { evaluateInventory } from "./advisory-match";
import { transmittable, type DepEntry, type Inventory } from "./dependencies";
import { getOpsState, setOpsState } from "./ops";
import { fetchAdvisories, type Advisory } from "./sources/github";

// Dependency ↔ advisory analysis. `db` is the caller's client for private tables (user client under RLS,
// or the service role in the scheduler); `admin` (service role) is only used for the public advisory mirror.

type Db = SupabaseClient<Database>;
type AdvisoryRow = Database["public"]["Tables"]["security_advisories"]["Row"];

const RECHECK_AFTER_MS = 24 * 3600_000; // a package looked up today is not queried again on the next import
const SYNC_EVERY_MS = 20 * 3600_000;
const SYNC_KEY = "advisories_sync";

const toRow = (a: Advisory) => ({
  ghsa_id: a.ghsaId,
  cve_id: a.cveId,
  summary: a.summary,
  severity: a.severity,
  html_url: a.htmlUrl,
  packages: [...new Set(a.vulnerabilities.map((v) => v.package))],
  vulnerabilities: a.vulnerabilities as unknown as NonNullable<Json>,
  published_at: a.publishedAt,
  updated_at: a.updatedAt,
  withdrawn_at: a.withdrawnAt,
  fetched_at: new Date().toISOString(),
});
const fromRow = (r: AdvisoryRow): Advisory => ({
  ghsaId: r.ghsa_id,
  cveId: r.cve_id,
  summary: r.summary,
  severity: r.severity,
  htmlUrl: r.html_url,
  publishedAt: r.published_at,
  updatedAt: r.updated_at,
  withdrawnAt: r.withdrawn_at,
  vulnerabilities: r.vulnerabilities as unknown as Advisory["vulnerabilities"],
});

async function storeAdvisories(admin: Db, advisories: Advisory[]) {
  for (let i = 0; i < advisories.length; i += 200) {
    const { error } = await admin.from("security_advisories").upsert(advisories.slice(i, i + 200).map(toRow), { onConflict: "ghsa_id" });
    if (error) throw new Error(error.message);
  }
}

async function loadAdvisories(db: Db, names: string[]): Promise<Advisory[]> {
  const out: Advisory[] = [];
  for (let i = 0; i < names.length; i += 200) {
    const { data, error } = await db.from("security_advisories").select("*").overlaps("packages", names.slice(i, i + 200));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []).map(fromRow));
  }
  return [...new Map(out.map((a) => [a.ghsaId, a])).values()];
}

/** Look up advisories for names not checked recently. Only package names leave the server. */
async function refreshAdvisoriesFor(admin: Db, names: string[]) {
  const since = new Date(Date.now() - RECHECK_AFTER_MS).toISOString();
  const recent = new Set<string>();
  for (let i = 0; i < names.length; i += 500) {
    const { data } = await admin.from("advisory_package_checks").select("name").in("name", names.slice(i, i + 500)).gte("checked_at", since);
    for (const r of data ?? []) recent.add(r.name);
  }
  const toQuery = names.filter((n) => !recent.has(n));
  if (!toQuery.length) return { unchecked: [] as string[], error: null as string | null, queried: 0 };
  const res = await fetchAdvisories(toQuery);
  await storeAdvisories(admin, res.advisories);
  const checked = toQuery.filter((n) => !res.unchecked.includes(n));
  const now = new Date().toISOString();
  for (let i = 0; i < checked.length; i += 500)
    await admin.from("advisory_package_checks").upsert(checked.slice(i, i + 500).map((name) => ({ name, checked_at: now })), { onConflict: "name" });
  return { unchecked: res.unchecked, error: res.error?.message ?? null, queried: toQuery.length };
}

/**
 * (Re)compute findings for one snapshot from the advisories mirror. Previous findings are superseded,
 * never deleted, so earlier conclusions remain as history. Returns the counts per status.
 */
export async function recomputeFindings(db: Db, snapshotId: string, uncheckedNow?: string[]) {
  const { data: snap } = await db.from("dependency_snapshots").select("id, project_id, stats").eq("id", snapshotId).single();
  if (!snap) throw new Error("Instantané introuvable.");
  const { data: entries, error } = await db.from("dependency_entries").select("name, version, declared, resolution, excluded, is_direct, scope").eq("snapshot_id", snapshotId);
  if (error) throw new Error(error.message);
  const list = (entries ?? []) as (Pick<DepEntry, "name" | "version" | "declared" | "resolution" | "excluded"> & { is_direct: boolean; scope: string })[];
  const names = [...new Set(list.filter((e) => transmittable(e)).map((e) => e.name))];
  const advisories = await loadAdvisories(db, names);
  const results = evaluateInventory(list, advisories);
  const updatedAt = new Map(advisories.map((a) => [a.ghsaId, a.updatedAt]));

  const now = new Date().toISOString();
  await db.from("dependency_findings").update({ superseded_at: now }).eq("snapshot_id", snapshotId).is("superseded_at", null);
  const rows = results.map(({ entry, finding }) => ({
    snapshot_id: snapshotId,
    project_id: snap.project_id,
    ghsa_id: finding.ghsaId,
    package: finding.package,
    version: entry.version,
    declared: entry.declared,
    is_direct: (entry as (typeof list)[number]).is_direct,
    scope: (entry as (typeof list)[number]).scope,
    status: finding.status,
    matched_range: finding.matchedRange,
    patched: finding.patched as unknown as NonNullable<Json>,
    advisory_updated_at: updatedAt.get(finding.ghsaId) ?? null,
    computed_at: now,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e } = await db.from("dependency_findings").insert(rows.slice(i, i + 500));
    if (e) throw new Error(e.message);
  }
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const prevStats = (snap.stats ?? {}) as Record<string, unknown>;
  // Without fresh lookup results (scheduler recomputation), packages left unchecked at import stay unchecked.
  const unchecked = uncheckedNow ?? ((prevStats.unchecked as string[] | undefined) ?? []);
  await db
    .from("dependency_snapshots")
    .update({
      analysis_status: unchecked.length ? "incomplete" : "complete",
      analyzed_at: now,
      stats: { ...prevStats, counts, uncheckedCount: unchecked.length, unchecked: unchecked.slice(0, 50), advisoriesMatched: advisories.length } as NonNullable<Json>,
    })
    .eq("id", snapshotId);
  return counts;
}

/** Store a validated inventory as a new dated snapshot, then analyze it. Older snapshots are kept. */
export async function importInventory(db: Db, admin: Db | null, projectId: string, inv: Inventory, excludedPatterns: string[]) {
  const transmitted = [...new Set(inv.entries.filter(transmittable).map((e) => e.name))];
  const { data: snap, error } = await db
    .from("dependency_snapshots")
    .insert({
      project_id: projectId,
      origin: inv.origin,
      file_name: inv.fileName,
      lockfile_version: inv.lockfileVersion,
      excluded_patterns: excludedPatterns,
      stats: {
        total: inv.entries.length,
        direct: inv.entries.filter((e) => e.isDirect).length,
        excluded: inv.entries.filter((e) => e.excluded).length,
        transmitted: transmitted.length,
        warnings: inv.warnings,
      } as NonNullable<Json>,
    })
    .select("id")
    .single();
  if (error || !snap) throw new Error(error?.message ?? "Création de l’instantané impossible.");
  const rows = inv.entries.map((e) => ({ snapshot_id: snap.id, project_id: projectId, name: e.name, declared: e.declared, version: e.version, resolution: e.resolution, is_direct: e.isDirect, scope: e.scope, excluded: e.excluded }));
  for (let i = 0; i < rows.length; i += 1000) {
    const { error: e } = await db.from("dependency_entries").insert(rows.slice(i, i + 1000));
    if (e) throw new Error(e.message);
  }
  let unchecked = transmitted;
  let fetchError: string | null = "Collecte des avis non configurée (clé de service manquante).";
  if (admin) {
    try {
      const r = await refreshAdvisoriesFor(admin, transmitted);
      unchecked = r.unchecked;
      fetchError = r.error;
    } catch (e) {
      // Advisory mirror unavailable: the inventory is kept and analysed against what is stored, marked incomplete.
      fetchError = `Avis de sécurité indisponibles : ${(e as Error).message}`.slice(0, 300);
    }
  }
  await recomputeFindings(db, snap.id, unchecked);
  if (fetchError) await db.from("dependency_snapshots").update({ analysis_error: fetchError.slice(0, 500) }).eq("id", snap.id);
  return { snapshotId: snap.id, unchecked: unchecked.length, error: fetchError };
}

/**
 * Scheduler step: re-check tracked packages for advisories modified or withdrawn since the last sync,
 * then recompute the latest snapshot of each project that uses an affected package.
 */
export async function syncAdvisories(admin: Db, opts: { deadline: number; log?: (m: string) => void; force?: boolean }) {
  const state = await getOpsState<{ lastRun?: string }>(admin, SYNC_KEY);
  const last = state?.lastRun ? Date.parse(state.lastRun) : 0;
  if (!opts.force && Date.now() - last < SYNC_EVERY_MS) return { updated: 0, incomplete: false };
  const { data: tracked } = await admin.from("advisory_package_checks").select("name").limit(5000);
  const names = (tracked ?? []).map((r) => r.name);
  if (!names.length) {
    await setOpsState(admin, SYNC_KEY, { lastRun: new Date().toISOString() });
    return { updated: 0, incomplete: false };
  }
  const startedAt = new Date().toISOString();
  // Look back one extra day: the `modified` filter has day granularity.
  const since = new Date((last || Date.now()) - 24 * 3600_000).toISOString();
  const res = await fetchAdvisories(names, { modifiedSince: since });
  const { data: existing } = res.advisories.length
    ? await admin.from("security_advisories").select("ghsa_id, updated_at, withdrawn_at").in("ghsa_id", res.advisories.map((a) => a.ghsaId))
    : { data: [] };
  const known = new Map((existing ?? []).map((r) => [r.ghsa_id, r]));
  const changed = res.advisories.filter((a) => {
    const k = known.get(a.ghsaId);
    return !k || k.updated_at !== a.updatedAt || k.withdrawn_at !== a.withdrawnAt;
  });
  await storeAdvisories(admin, changed);
  opts.log?.(`Avis de sécurité : ${changed.length} nouveau(x) ou modifié(s)${res.unchecked.length ? `, ${res.unchecked.length} package(s) non vérifié(s)` : ""}`);

  const pkgs = [...new Set(changed.flatMap((a) => a.vulnerabilities.map((v) => v.package)))];
  if (pkgs.length) {
    const { data: hit } = await admin.from("dependency_entries").select("snapshot_id, project_id").in("name", pkgs.slice(0, 1000));
    const projects = [...new Set((hit ?? []).map((h) => h.project_id))];
    for (const pid of projects) {
      if (Date.now() > opts.deadline) return { updated: changed.length, incomplete: true };
      const { data: latest } = await admin.from("dependency_snapshots").select("id").eq("project_id", pid).order("imported_at", { ascending: false }).limit(1);
      if (latest?.[0] && (hit ?? []).some((h) => h.snapshot_id === latest[0].id)) await recomputeFindings(admin, latest[0].id);
    }
  }
  if (!res.unchecked.length) await setOpsState(admin, SYNC_KEY, { lastRun: startedAt });
  return { updated: changed.length, incomplete: res.unchecked.length > 0 };
}

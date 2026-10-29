// v2 features against a real Supabase (local: `npx supabase start`). Skipped when env is missing.
// Covers: isolation of imports / findings / feedback / proposals, moderation policies, SQL feed pagination
// and filters, findings history, ranking signature, and the « last success » monitor.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { storeItems } from "@/domain/ingestion";
import { RANKING_SIGNATURE, refreshProjectInsights } from "@/domain/insights";
import { lastSuccessStatus } from "@/domain/ops";
import { recomputeFindings } from "@/domain/security";
import type { NormalizedItem } from "@/domain/sources/normalize";
import type { Database } from "@/lib/database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
type Db = SupabaseClient<Database>;
const run = `v2${Date.now().toString(36)}`;
const PASSWORD = "Integration-test-pw-2";
const local = URL ? ["127.0.0.1", "localhost"].includes(new globalThis.URL(URL).hostname) : false;

describe.skipIf(!URL || !ANON || !SECRET || !local)("Supabase v2 integration", () => {
  let admin: Db;
  let alice: Db;
  let bob: Db;
  let aliceId: string;
  let bobId: string;
  let projectId: string;
  let sourceId: string;
  let snapshotId: string;
  const ghsa = `GHSA-${run}-test`;

  async function signedIn(email: string) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    const c = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password: PASSWORD });
    return { client: c, id: data.user.id };
  }
  const item = (n: number, title: string, kind: NormalizedItem["kind"] = "tutorial", daysAgo = 1): NormalizedItem => ({
    externalId: `${run}-${n}`,
    canonicalUrl: `https://example.com/${run}/${n}`,
    title,
    excerpt: `${title} — payment checkout`,
    kind,
    isPrerelease: false,
    releaseTag: null,
    publishedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    contentHash: `h${n}`,
  });

  beforeAll(async () => {
    admin = createClient<Database>(URL!, SECRET!, { auth: { persistSession: false } });
    ({ client: alice, id: aliceId } = await signedIn(`alice-${run}@example.test`));
    ({ client: bob, id: bobId } = await signedIn(`bob-${run}@example.test`));
    const { data: src } = await admin.from("sources").insert({ kind: "rss", key: `https://example.com/${run}/feed.xml`, name: `Test ${run}`, quality: 7 }).select("*").single();
    sourceId = src!.id;
    // 23 items: enough for two pages of 15 (some with identical scores, to exercise the id tie-breaker).
    await storeItems(
      admin,
      { id: sourceId, language: "en" },
      Array.from({ length: 23 }, (_, i) => item(i, `Next.js payments ${i}`, i % 3 === 0 ? "news" : "tutorial", i)),
    );
    const { data: p } = await alice.from("projects").insert({ name: "Alice", description: "Booking SaaS with payments", stage: "development", features: ["payment"] }).select("id").single();
    projectId = p!.id;
    await alice.from("project_sources").insert({ project_id: projectId, source_id: sourceId });
    await refreshProjectInsights(alice, projectId);
  });

  afterAll(async () => {
    await admin.from("dependency_findings").delete().eq("ghsa_id", ghsa);
    await admin.from("security_advisories").delete().eq("ghsa_id", ghsa);
    await admin.from("sources").delete().eq("id", sourceId);
    for (const id of [aliceId, bobId]) if (id) await admin.auth.admin.deleteUser(id);
  });

  it("feed pagination: filters before paging, stable order, no duplicate or gap across pages", async () => {
    const all = await alice.rpc("feed_page", { p_section: "background", p_sort: "relevance", p_limit: 100, p_project: projectId });
    expect(all.error).toBeNull();
    const expected = all.data!.map((r) => r.id);
    expect(expected.length).toBeGreaterThan(10);
    const seen: string[] = [];
    let cursor: { s: number; d: string; i: string } | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const c: { s: number; d: string; i: string } | null = cursor;
      const args: Database["public"]["Functions"]["feed_page"]["Args"] = { p_section: "background", p_sort: "relevance", p_limit: 4, p_project: projectId, ...(c ? { p_after_score: c.s, p_after_date: c.d, p_after_id: c.i } : {}) };
      const page: Database["public"]["Functions"]["feed_page"]["Returns"] = (await alice.rpc("feed_page", args)).data ?? [];
      if (!page.length) break;
      seen.push(...page.map((r) => r.id));
      const last = page[page.length - 1];
      cursor = { s: last.best_score, d: last.sort_date, i: last.id };
    }
    expect(seen).toEqual(expected);
    // Filters run in SQL: only « news » items in the news section, and search narrows the set.
    const news = await alice.rpc("feed_items", { p_project: projectId }).eq("section", "news");
    expect(news.data!.every((r) => r.content_kind === "news")).toBe(true);
    const q = await alice.rpc("feed_items", { p_project: projectId, p_q: "payments 1" });
    expect(q.data!.every((r) => r.title.includes("payments 1"))).toBe(true);
    // Read filter is applied before pagination.
    await alice.from("user_content_state").upsert({ user_id: aliceId, content_item_id: expected[0], is_read: true });
    const unread = await alice.rpc("feed_page", { p_section: "background", p_sort: "relevance", p_limit: 100, p_project: projectId, p_read: "unread" });
    expect(unread.data!.map((r) => r.id)).not.toContain(expected[0]);
    // Another account sees nothing of Alice's feed.
    expect((await bob.rpc("feed_items", { p_project: projectId })).data).toEqual([]);
  });

  it("ranking signature is recorded so rule/catalog changes trigger a targeted recompute", async () => {
    const { data } = await alice.from("projects").select("ranking_signature").eq("id", projectId).single();
    expect(data!.ranking_signature).toBe(RANKING_SIGNATURE);
  });

  it("isolates dependency imports, findings, dismissals and feedback between accounts", async () => {
    const { data: snap, error } = await alice.from("dependency_snapshots").insert({ project_id: projectId, origin: "package-lock.json", lockfile_version: 3 }).select("id").single();
    expect(error).toBeNull();
    snapshotId = snap!.id;
    await alice.from("dependency_entries").insert([
      { snapshot_id: snapshotId, project_id: projectId, name: `pkg-${run}`, version: "1.2.0", resolution: "resolved", is_direct: true, scope: "prod" },
      { snapshot_id: snapshotId, project_id: projectId, name: `pkg-${run}`, version: "2.0.0", resolution: "resolved", is_direct: false, scope: "prod" },
    ]);
    await alice.from("finding_dismissals").insert({ project_id: projectId, ghsa_id: ghsa, package: `pkg-${run}`, reason: "test" });
    const items = await alice.from("project_insights").select("content_item_id").eq("project_id", projectId).limit(1);
    await alice.from("project_feedback").insert({ project_id: projectId, content_item_id: items.data![0].content_item_id, reason: "wrong_level" });

    for (const t of ["dependency_snapshots", "dependency_entries", "finding_dismissals", "project_feedback", "dependency_findings"] as const) expect((await bob.from(t).select("*")).data, t).toEqual([]);
    expect((await bob.from("dependency_entries").insert({ snapshot_id: snapshotId, project_id: projectId, name: "evil", resolution: "exact" })).error).not.toBeNull();
    expect((await bob.from("dependency_snapshots").delete().eq("id", snapshotId).select()).data).toEqual([]);
    // The advisory mirror is public read-only.
    expect((await alice.from("security_advisories").insert({ ghsa_id: "GHSA-evil", summary: "x", html_url: "https://x" })).error).not.toBeNull();
  });

  it("recomputation keeps earlier conclusions as history (corrected then withdrawn advisory)", async () => {
    const vuln = (range: string) => [{ package: `pkg-${run}`, range, patched: "1.2.1" }];
    await admin.from("security_advisories").insert({ ghsa_id: ghsa, summary: "test", html_url: "https://github.com/advisories/x", packages: [`pkg-${run}`], vulnerabilities: vuln("< 1.2.1"), updated_at: "2026-10-01T00:00:00Z" });
    await recomputeFindings(alice, snapshotId, []);
    let current = await alice.from("dependency_findings").select("version, status").eq("snapshot_id", snapshotId).is("superseded_at", null).order("version");
    expect(current.data).toEqual([
      { version: "1.2.0", status: "affected" },
      { version: "2.0.0", status: "not_affected" },
    ]);
    // Advisory corrected: range now excludes 1.2.0.
    await admin.from("security_advisories").update({ vulnerabilities: vuln("< 1.1.0"), updated_at: "2026-10-10T00:00:00Z" }).eq("ghsa_id", ghsa);
    await recomputeFindings(alice, snapshotId, []);
    current = await alice.from("dependency_findings").select("version, status").eq("snapshot_id", snapshotId).is("superseded_at", null).order("version");
    expect(current.data!.map((r) => r.status)).toEqual(["not_affected", "not_affected"]);
    // Withdrawn.
    await admin.from("security_advisories").update({ withdrawn_at: new Date().toISOString() }).eq("ghsa_id", ghsa);
    await recomputeFindings(alice, snapshotId, [`pkg-other-${run}`]);
    const withdrawn = await alice.from("dependency_findings").select("status").eq("snapshot_id", snapshotId).is("superseded_at", null);
    expect(withdrawn.data!.every((r) => r.status === "withdrawn")).toBe(true);
    const history = await alice.from("dependency_findings").select("status").eq("snapshot_id", snapshotId).not("superseded_at", "is", null);
    expect(history.data!.map((r) => r.status)).toContain("affected");
    const { data: snap } = await alice.from("dependency_snapshots").select("analysis_status").eq("id", snapshotId).single();
    expect(snap!.analysis_status).toBe("incomplete");
  });

  it("source proposals: authors create pending ones only; moderation is admin-only", async () => {
    const ok = await alice.from("source_proposals").insert({ user_id: aliceId, url: `https://example.com/${run}.xml`, language: "fr", topics: ["react"] }).select("id").single();
    expect(ok.error).toBeNull();
    expect((await alice.from("source_proposals").insert({ user_id: aliceId, url: "https://example.com/x.xml", language: "fr", status: "accepted" })).error).not.toBeNull();
    expect((await alice.from("source_proposals").insert({ user_id: bobId, url: "https://example.com/y.xml", language: "fr" })).error).not.toBeNull();
    expect((await alice.from("source_proposals").insert({ user_id: aliceId, url: "http://example.com/z.xml", language: "fr" })).error).not.toBeNull();
    // Authors cannot moderate their own proposal; other users cannot see it.
    expect((await alice.from("source_proposals").update({ status: "accepted" }).eq("id", ok.data!.id).select()).data).toEqual([]);
    expect((await bob.from("source_proposals").select("*")).data).toEqual([]);
    expect((await alice.rpc("is_admin")).data).toBe(false);
    // An admin (membership managed by the operator) can review.
    await admin.from("app_admins").insert({ user_id: bobId });
    const reviewed = await bob.from("source_proposals").update({ status: "rejected", review_note: "hors sujet" }).eq("id", ok.data!.id).select("status");
    expect(reviewed.data).toEqual([{ status: "rejected" }]);
    expect((await alice.from("source_proposals").select("status, review_note").eq("id", ok.data!.id).single()).data).toEqual({ status: "rejected", review_note: "hors sujet" });
    await admin.from("app_admins").delete().eq("user_id", bobId);
  });

  it("operations tables are not readable by users", async () => {
    expect((await alice.from("ops_state").select("*")).data).toEqual([]);
    expect((await alice.from("ops_alerts").select("*")).data).toEqual([]);
    expect((await alice.from("advisory_package_checks").select("*")).data).toEqual([]);
  });

  it("detects a scheduler that did not run (last success too old)", async () => {
    const s = await lastSuccessStatus(admin, Date.now() + 10 * 86_400_000);
    expect(s.healthy).toBe(false);
  });
});

// Runs against a real Supabase (local: `npx supabase start`). Skipped when env is missing.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { storeItems } from "@/domain/ingestion";
import { refreshProjectInsights } from "@/domain/insights";
import type { NormalizedItem } from "@/domain/sources/normalize";
import type { Database } from "@/lib/database.types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
type Db = SupabaseClient<Database>;

const run = Date.now().toString(36);
const PASSWORD = "Integration-test-pw-1";

describe.skipIf(!URL || !ANON || !SECRET)("Supabase integration", () => {
  let admin: Db;
  let alice: Db;
  let bob: Db;
  let aliceId: string;
  let bobId: string;
  let projectId: string;
  let sourceId: string;
  let itemIds: string[];

  async function signedIn(email: string) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error) throw error;
    const c = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } });
    const { error: e2 } = await c.auth.signInWithPassword({ email, password: PASSWORD });
    if (e2) throw e2;
    return { client: c, id: data.user.id };
  }

  const item = (n: number, title: string): NormalizedItem => ({
    externalId: `it-${run}-${n}`,
    canonicalUrl: `https://example.com/${run}/${n}`,
    title,
    excerpt: `${title} excerpt`,
    kind: "tutorial",
    isPrerelease: false,
    releaseTag: null,
    publishedAt: new Date().toISOString(),
    contentHash: `h${n}`,
  });

  beforeAll(async () => {
    admin = createClient<Database>(URL!, SECRET!, { auth: { persistSession: false } });
    ({ client: alice, id: aliceId } = await signedIn(`alice-${run}@example.test`));
    ({ client: bob, id: bobId } = await signedIn(`bob-${run}@example.test`));
    const { data: src } = await admin.from("sources").insert({ kind: "rss", key: `https://example.com/${run}/feed.xml`, name: `Test ${run}`, quality: 7 }).select("*").single();
    sourceId = src!.id;
    const { data: p } = await alice.from("projects").insert({ name: "Alice SaaS", description: "Booking SaaS with payments", stage: "development", features: ["payment"] }).select("id").single();
    projectId = p!.id;
  });

  afterAll(async () => {
    await admin.from("sources").delete().eq("id", sourceId);
    for (const id of [aliceId, bobId]) if (id) await admin.auth.admin.deleteUser(id);
  });

  it("ingestion is idempotent and deduplicates by canonical URL", async () => {
    const items = [item(1, "Next.js payments tutorial"), item(2, "Stripe checkout with Next.js"), { ...item(3, "Duplicate URL"), canonicalUrl: `https://example.com/${run}/1` }];
    const first = await storeItems(admin, { id: sourceId, language: "en" }, items);
    const second = await storeItems(admin, { id: sourceId, language: "en" }, items);
    expect(first).toBe(2);
    expect(second).toBe(0);
    const { data } = await admin.from("content_items").select("id, collected_at").eq("source_id", sourceId);
    expect(data).toHaveLength(2);
    itemIds = data!.map((d) => d.id);
  });

  it("users cannot write the public catalog", async () => {
    const { error } = await alice.from("sources").insert({ kind: "rss", key: "https://evil.example/feed", name: "x" });
    expect(error).not.toBeNull();
    const { data } = await alice.from("content_items").update({ title: "hacked" }).eq("id", itemIds[0]).select();
    expect(data ?? []).toHaveLength(0);
  });

  it("isolates private data between accounts (read, write, relations)", async () => {
    await alice.from("project_sources").insert({ project_id: projectId, source_id: sourceId });
    await alice.from("project_technologies").insert({ project_id: projectId, tech_key: "nextjs", display_name: "Next.js", category: "frontend", status: "used" });
    await alice.from("project_actions").insert({ project_id: projectId, title: "Secret action" });
    await alice.from("user_content_state").insert({ user_id: aliceId, content_item_id: itemIds[0], is_favorite: true, note: "private note" });

    for (const table of ["projects", "project_technologies", "project_actions", "project_sources"] as const) {
      const { data } = await bob.from(table).select("*");
      expect(data, table).toEqual([]);
    }
    expect((await bob.from("user_content_state").select("*")).data).toEqual([]);
    expect((await bob.from("projects").select("*").eq("id", projectId)).data).toEqual([]);

    // Writing into someone else's project through a child table is refused.
    const ins = await bob.from("project_actions").insert({ project_id: projectId, title: "injected" });
    expect(ins.error).not.toBeNull();
    const tech = await bob.from("project_technologies").insert({ project_id: projectId, tech_key: "go", display_name: "Go", category: "backend" });
    expect(tech.error).not.toBeNull();
    // Updates/deletes silently affect nothing.
    expect((await bob.from("projects").update({ name: "pwned" }).eq("id", projectId).select()).data).toEqual([]);
    expect((await bob.from("projects").delete().eq("id", projectId).select()).data).toEqual([]);
    // Spoofing user_id on per-user state is refused.
    const spoof = await bob.from("user_content_state").insert({ user_id: aliceId, content_item_id: itemIds[1], is_favorite: true });
    expect(spoof.error).not.toBeNull();
    // Moving one's own project to another owner is refused.
    const { data: bobProject } = await bob.from("projects").insert({ name: "Bob", description: "x" }).select("id").single();
    const steal = await bob.from("projects").update({ owner_id: aliceId }).eq("id", bobProject!.id);
    expect(steal.error).not.toBeNull();

    const { data: stillThere } = await alice.from("projects").select("name").eq("id", projectId).single();
    expect(stillThere!.name).toBe("Alice SaaS");
  });

  it("anonymous clients see nothing", async () => {
    const anon = createClient<Database>(URL!, ANON!, { auth: { persistSession: false } });
    for (const table of ["projects", "content_items", "sources", "preferences"] as const) {
      const { data } = await anon.from(table).select("*").limit(1);
      expect(data ?? [], table).toEqual([]);
    }
  });

  it("recomputes insights per project context and invalidates on stack change", async () => {
    await refreshProjectInsights(alice, projectId);
    const before = await alice.from("project_insights").select("content_item_id, why, context_version").eq("project_id", projectId);
    expect(before.data!.length).toBeGreaterThan(0);
    expect(before.data![0].why).toMatch(/Next\.js/);

    // Context change: drop the stack → explanations no longer mention Next.js, version bumped.
    await alice.from("project_technologies").delete().eq("project_id", projectId);
    await alice.from("projects").update({ context_version: 2 }).eq("id", projectId);
    await refreshProjectInsights(alice, projectId);
    const after = await alice.from("project_insights").select("why, context_version").eq("project_id", projectId);
    expect(after.data!.every((r) => r.context_version === 2 && !/Next\.js/.test(r.why))).toBe(true);
    // Favorites and notes survive the recompute.
    const fav = await alice.from("user_content_state").select("is_favorite, note").eq("content_item_id", itemIds[0]).single();
    expect(fav.data).toMatchObject({ is_favorite: true, note: "private note" });
  });

  it("deleting a project removes private dependants but keeps shared content", async () => {
    await alice.from("projects").delete().eq("id", projectId);
    expect((await admin.from("project_actions").select("id").eq("project_id", projectId)).data).toEqual([]);
    expect((await admin.from("project_insights").select("project_id").eq("project_id", projectId)).data).toEqual([]);
    expect((await admin.from("content_items").select("id").in("id", itemIds)).data).toHaveLength(2);
  });
});

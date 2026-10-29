"use server";

// All mutations go through the user-scoped client, so RLS enforces ownership on every table.
// The service role is only used for the public catalog (sources/content), after an explicit ownership check.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AI_MIN_SCORE, aiDailyBudget, enrichInsight, getAiProvider, suggestTags, type EnrichInput } from "@/domain/ai";
import { applyExclusions, inventorySchema } from "@/domain/dependencies";
import { fetchSource, refreshSourcesForUser } from "@/domain/ingestion";
import { refreshProjectInsights } from "@/domain/insights";
import { contextChanged, FEATURES, isActive, projectInputSchema, techInputSchema, type FeatureKey } from "@/domain/projects";
import { defaultSourceKeys, parseGithubRepo } from "@/domain/sources/catalog";
import { verifyPublicRepo } from "@/domain/sources/github";
import { parseFeed } from "@/domain/sources/rss";
import { checkUrl, safeFetchText } from "@/domain/sources/safe-fetch";
import { importInventory, recomputeFindings } from "@/domain/security";
import { getTechnology, normalizeTechKey, resolveTechnology, type TechCategory } from "@/domain/technologies";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

type Ctx = Awaited<ReturnType<typeof requireUser>>;
export type FormState = { error?: string; message?: string } | undefined;

const MANUAL_REFRESH_INTERVAL_MS = 10 * 60_000;
const uuid = z.string().uuid();

async function recompute({ supabase }: Ctx, projectId: string) {
  try {
    await refreshProjectInsights(supabase, projectId);
  } catch (e) {
    // insights_refreshed_at stays null → the scheduler retries.
    console.error("insight refresh failed", projectId, (e as Error).message);
  }
}

async function bumpContext(ctx: Ctx, projectId: string) {
  const { data } = await ctx.supabase.from("projects").select("context_version").eq("id", projectId).single();
  if (!data) throw new Error("Projet introuvable.");
  await ctx.supabase.from("projects").update({ context_version: data.context_version + 1, insights_refreshed_at: null, updated_at: new Date().toISOString() }).eq("id", projectId);
}

function revalidateApp() {
  revalidatePath("/", "layout");
}

function readProjectForm(form: FormData) {
  return projectInputSchema.safeParse({
    name: form.get("name") ?? "",
    description: form.get("description") ?? "",
    problem: form.get("problem") ?? "",
    audience: form.get("audience") ?? "",
    project_type: form.get("project_type") || undefined,
    stage: form.get("stage") || undefined,
    features: form.getAll("features"),
    constraints: form.get("constraints") ?? "",
    notes: form.get("notes") ?? "",
  });
}

/** Stack typed at creation: catalog keys from checkboxes + free text "Next.js, htmx". */
function readInitialTechs(form: FormData) {
  const status = form.get("stack_status") === "considered" ? "considered" : "used";
  const out = new Map<string, z.infer<typeof techInputSchema>>();
  const add = (raw: string) => {
    const name = raw.trim().slice(0, 60);
    if (!name) return;
    const tech = resolveTechnology(name);
    const key = tech?.key ?? normalizeTechKey(name);
    if (!/^[a-z0-9]/.test(key)) return;
    out.set(key, { tech_key: key, display_name: tech?.name ?? name, category: tech?.category ?? "service", status, version: null });
  };
  for (const k of form.getAll("techs")) add(String(k));
  for (const k of String(form.get("custom_techs") ?? "").split(",")) add(k);
  return [...out.values()].slice(0, 30);
}

async function subscribeDefaults(ctx: Ctx, projectId: string, techKeys: string[]) {
  const { data: sources } = await ctx.supabase.from("sources").select("id").eq("in_catalog", true).in("key", defaultSourceKeys(techKeys));
  if (sources?.length) await ctx.supabase.from("project_sources").upsert(sources.map((s) => ({ project_id: projectId, source_id: s.id })), { onConflict: "project_id,source_id", ignoreDuplicates: true });
}

// ───────────────────────── Projects ─────────────────────────

export async function createProject(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireUser();
  const parsed = readProjectForm(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { data: project, error } = await ctx.supabase.from("projects").insert({ ...parsed.data, owner_id: ctx.userId }).select("id").single();
  if (error) return { error: "Création impossible. Réessaie." };
  const techs = readInitialTechs(form);
  if (techs.length) await ctx.supabase.from("project_technologies").insert(techs.map((t) => ({ ...t, project_id: project.id })));
  await subscribeDefaults(ctx, project.id, techs.map((t) => t.tech_key));
  await recompute(ctx, project.id); // reuses content already collected: no fetch here
  revalidateApp();
  redirect(`/projets/${project.id}`);
}

export async function updateProject(projectId: string, _: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireUser();
  const { data: before } = await ctx.supabase.from("projects").select("*").eq("id", uuid.parse(projectId)).single();
  if (!before) return { error: "Projet introuvable." };
  const parsed = readProjectForm(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const changed = contextChanged(before, parsed.data);
  const reactivated = !isActive(before) && isActive({ stage: parsed.data.stage, archived_at: before.archived_at });
  const { error } = await ctx.supabase
    .from("projects")
    .update({ ...parsed.data, updated_at: new Date().toISOString(), ...(changed ? { context_version: before.context_version + 1, insights_refreshed_at: null } : {}) })
    .eq("id", projectId);
  if (error) return { error: "Enregistrement impossible." };
  if (changed || reactivated) await recompute(ctx, projectId);
  revalidateApp();
  redirect(`/projets/${projectId}`);
}

export async function saveProjectNotes(projectId: string, form: FormData) {
  const ctx = await requireUser();
  const notes = z.string().max(10000).parse(form.get("notes") ?? "");
  // Private notes never change the analysis context.
  await ctx.supabase.from("projects").update({ notes: notes || null }).eq("id", uuid.parse(projectId));
  revalidatePath(`/projets/${projectId}`);
}

export async function setProjectArchived(projectId: string, archived: boolean) {
  const ctx = await requireUser();
  await ctx.supabase.from("projects").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", uuid.parse(projectId));
  if (!archived) await recompute(ctx, projectId); // reactivation triggers a refresh
  revalidateApp();
}

export async function deleteProject(projectId: string) {
  const ctx = await requireUser();
  // Cascades remove private dependants only; shared public content stays.
  await ctx.supabase.from("projects").delete().eq("id", uuid.parse(projectId));
  revalidateApp();
  redirect("/projets");
}

// ───────────────────────── Stack ─────────────────────────

export async function addTechnology(projectId: string, _: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireUser();
  const raw = String(form.get("name") ?? "").trim();
  if (!raw) return { error: "Indique une technologie." };
  const tech = resolveTechnology(raw);
  const parsed = techInputSchema.safeParse({
    tech_key: tech?.key ?? normalizeTechKey(raw),
    display_name: tech?.name ?? raw,
    category: form.get("category") || tech?.category || "service",
    status: form.get("status") || "used",
    version: form.get("version") ?? "",
  });
  if (!parsed.success) return { error: "Technologie invalide (lettres, chiffres, . + - uniquement)." };
  const { error } = await ctx.supabase.from("project_technologies").insert({ ...parsed.data, project_id: uuid.parse(projectId) });
  if (error) return { error: error.code === "23505" ? "Cette technologie est déjà dans la stack." : "Ajout impossible." };
  await bumpContext(ctx, projectId);
  await subscribeDefaults(ctx, projectId, [parsed.data.tech_key]);
  await recompute(ctx, projectId);
  revalidateApp();
  return { message: `${parsed.data.display_name} ajoutée.` };
}

export async function updateTechnology(projectId: string, techId: string, form: FormData) {
  const ctx = await requireUser();
  const patch = techInputSchema.pick({ status: true, version: true, category: true }).parse({
    status: form.get("status"),
    version: form.get("version") ?? "",
    category: form.get("category"),
  });
  await ctx.supabase.from("project_technologies").update(patch).eq("id", uuid.parse(techId)).eq("project_id", uuid.parse(projectId));
  await bumpContext(ctx, projectId);
  await recompute(ctx, projectId);
  revalidateApp();
}

export async function removeTechnology(projectId: string, techId: string) {
  const ctx = await requireUser();
  await ctx.supabase.from("project_technologies").delete().eq("id", uuid.parse(techId)).eq("project_id", uuid.parse(projectId));
  await bumpContext(ctx, projectId);
  await recompute(ctx, projectId);
  revalidateApp();
}

/** Accept AI/rule suggestions only after explicit user validation (this action is that validation). */
export async function acceptSuggestions(projectId: string, form: FormData) {
  const ctx = await requireUser();
  const techKeys = form.getAll("techs").map(String).filter((k) => getTechnology(k));
  const features = form.getAll("features").map(String).filter((k): k is FeatureKey => k in FEATURES);
  const { data: p } = await ctx.supabase.from("projects").select("features").eq("id", uuid.parse(projectId)).single();
  if (!p) throw new Error("Projet introuvable.");
  if (techKeys.length)
    await ctx.supabase.from("project_technologies").upsert(
      techKeys.map((k) => {
        const t = getTechnology(k)!;
        return { project_id: projectId, tech_key: t.key, display_name: t.name, category: t.category as TechCategory, status: "considered" };
      }),
      { onConflict: "project_id,tech_key", ignoreDuplicates: true },
    );
  if (features.length) await ctx.supabase.from("projects").update({ features: [...new Set([...p.features, ...features])] }).eq("id", projectId);
  if (techKeys.length || features.length) {
    await bumpContext(ctx, projectId);
    await subscribeDefaults(ctx, projectId, techKeys);
    await recompute(ctx, projectId);
  }
  revalidateApp();
}

export async function suggestTagsWithAi(description: string): Promise<{ technologies: string[]; features: string[] } | { error: string }> {
  const ctx = await requireUser();
  const provider = getAiProvider();
  if (!provider) return { error: "L’enrichissement IA n’est pas configuré sur ce serveur." };
  const { data: prefs } = await ctx.supabase.from("preferences").select("ai_enabled").eq("user_id", ctx.userId).single();
  if (!prefs?.ai_enabled) return { error: "Active l’enrichissement IA dans les paramètres pour utiliser cette suggestion." };
  if (!(await consumeAiBudget(ctx))) return { error: "Budget IA quotidien atteint." };
  try {
    return await suggestTags(provider, z.string().max(2000).parse(description));
  } catch {
    return { error: "Le fournisseur IA n’a pas répondu correctement. Réessaie plus tard." };
  }
}

// ───────────────────────── Sources ─────────────────────────

export async function subscribeSource(projectId: string, sourceId: string) {
  const ctx = await requireUser();
  const { data: src } = await ctx.supabase.from("sources").select("id, in_catalog").eq("id", uuid.parse(sourceId)).single();
  if (!src?.in_catalog) throw new Error("Seules les sources du catalogue peuvent être ajoutées ainsi.");
  await ctx.supabase.from("project_sources").upsert({ project_id: uuid.parse(projectId), source_id: src.id }, { onConflict: "project_id,source_id", ignoreDuplicates: true });
  await recompute(ctx, projectId);
  revalidateApp();
}

export async function unsubscribeSource(projectId: string, sourceId: string) {
  const ctx = await requireUser();
  await ctx.supabase.from("project_sources").delete().eq("project_id", uuid.parse(projectId)).eq("source_id", uuid.parse(sourceId));
  await recompute(ctx, projectId);
  revalidateApp();
}

export async function addGithubRepo(projectId: string, _: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireUser();
  const { data: project } = await ctx.supabase.from("projects").select("id").eq("id", uuid.parse(projectId)).single();
  if (!project) return { error: "Projet introuvable." };
  const repo = parseGithubRepo(String(form.get("repo") ?? ""));
  if (!repo) return { error: "Format attendu : owner/repo (ex. vercel/next.js)." };
  const info = await verifyPublicRepo(repo);
  if (!info) return { error: `Dépôt public introuvable ou API GitHub indisponible : ${repo}.` };
  const key = info.fullName.toLowerCase();
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "La collecte n’est pas configurée sur ce serveur (clé de service manquante)." };
  }
  const { data: source, error } = await admin
    .from("sources")
    .upsert({ kind: "github", key, name: `Releases ${info.fullName}`, site_url: `https://github.com/${info.fullName}`, quality: 9 }, { onConflict: "kind,key", ignoreDuplicates: false })
    .select("*")
    .single();
  if (error || !source) return { error: "Ajout de la source impossible." };
  await ctx.supabase.from("project_sources").upsert({ project_id: projectId, source_id: source.id }, { onConflict: "project_id,source_id", ignoreDuplicates: true });
  // Mutualised: fetch only if nobody fetched this repo recently.
  const fresh = source.last_fetched_at && Date.now() - Date.parse(source.last_fetched_at) < 6 * 3600_000;
  const res = fresh ? { error: null, newItems: 0 } : await fetchSource(admin, source);
  await recompute(ctx, projectId);
  revalidateApp();
  return res.error ? { message: `${info.fullName} ajouté, mais la collecte a échoué : ${res.error}. Nouvelle tentative automatique plus tard.` } : { message: `${info.fullName} ajouté.` };
}

export async function toggleHiddenSource(sourceId: string) {
  const ctx = await requireUser();
  const id = uuid.parse(sourceId);
  const { data: prefs } = await ctx.supabase.from("preferences").select("hidden_source_ids").eq("user_id", ctx.userId).single();
  const hidden = new Set(prefs?.hidden_source_ids ?? []);
  if (hidden.has(id)) hidden.delete(id);
  else hidden.add(id);
  await ctx.supabase.from("preferences").update({ hidden_source_ids: [...hidden], updated_at: new Date().toISOString() }).eq("user_id", ctx.userId);
  await recomputeAll(ctx);
  revalidateApp();
}

export async function manualRefresh(): Promise<void> {
  const ctx = await requireUser();
  const { data: prefs } = await ctx.supabase.from("preferences").select("last_manual_refresh_at").eq("user_id", ctx.userId).single();
  const last = prefs?.last_manual_refresh_at ? Date.parse(prefs.last_manual_refresh_at) : 0;
  if (Date.now() - last < MANUAL_REFRESH_INTERVAL_MS) redirect("/veille?actualisation=trop-tot");
  await ctx.supabase.from("preferences").update({ last_manual_refresh_at: new Date().toISOString() }).eq("user_id", ctx.userId);
  const { data: subs } = await ctx.supabase.from("project_sources").select("source_id");
  let outcome = "ok";
  try {
    const res = await refreshSourcesForUser(createAdminClient(), [...new Set((subs ?? []).map((s) => s.source_id))]);
    if (res.failed) outcome = "partiel";
  } catch {
    outcome = "collecte-indisponible";
  }
  await recomputeAll(ctx);
  revalidateApp();
  redirect(`/veille?actualisation=${outcome}`);
}

async function recomputeAll(ctx: Ctx) {
  const { data: projects } = await ctx.supabase.from("projects").select("id").is("archived_at", null).neq("stage", "paused");
  for (const p of projects ?? []) await recompute(ctx, p.id);
}

// ───────────────────────── Per-user content state ─────────────────────────

async function upsertState(ctx: Ctx, itemId: string, patch: { is_read?: boolean; is_favorite?: boolean; note?: string | null; favorited_at?: string | null }) {
  const { error } = await ctx.supabase
    .from("user_content_state")
    .upsert({ user_id: ctx.userId, content_item_id: uuid.parse(itemId), ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id,content_item_id" });
  return !error;
}

export type StateResult = { ok: boolean; value: boolean };

// Called from the client with optimistic UI: the result confirms (or not) the requested value.
// No route revalidation — every view reads this state from the shared client store, and pages are dynamic.
export async function setFavorite(itemId: string, favorite: boolean): Promise<StateResult> {
  const ctx = await requireUser();
  const ok = await upsertState(ctx, itemId, { is_favorite: favorite, favorited_at: favorite ? new Date().toISOString() : null });
  return { ok, value: favorite };
}

export async function setRead(itemId: string, read: boolean): Promise<StateResult> {
  const ctx = await requireUser();
  const ok = await upsertState(ctx, itemId, { is_read: read });
  return { ok, value: read };
}

export async function saveItemNote(itemId: string, form: FormData) {
  const ctx = await requireUser();
  const note = z.string().max(5000).parse(form.get("note") ?? "").trim();
  await upsertState(ctx, itemId, { note: note || null });
  revalidateApp();
}

// ───────────────────────── Per-project feedback ─────────────────────────

const feedbackReason = z.enum(["wrong_topic", "wrong_level", "already_known", "wrong_source", "not_useful", "unspecified"]);

/**
 * « Peu pertinent » for one project and one item. The feedback is stored at the project level (never global),
 * with a snapshot of the matched technologies and the source so its bounded effect stays explainable.
 * « Déjà connu » also marks the item as read for this user — it does not lower the topic.
 */
export async function giveFeedback(projectId: string, itemId: string, reason = "unspecified"): Promise<{ ok: boolean }> {
  const ctx = await requireUser();
  const pid = uuid.parse(projectId);
  const iid = uuid.parse(itemId);
  const r = feedbackReason.parse(reason);
  const [{ data: insight }, { data: item }] = await Promise.all([
    ctx.supabase.from("project_insights").select("matched_techs").eq("project_id", pid).eq("content_item_id", iid).maybeSingle(),
    ctx.supabase.from("content_items").select("source_id").eq("id", iid).maybeSingle(),
  ]);
  const { error } = await ctx.supabase
    .from("project_feedback")
    .upsert({ project_id: pid, content_item_id: iid, reason: r, tech_keys: insight?.matched_techs ?? [], source_id: item?.source_id ?? null }, { onConflict: "project_id,content_item_id" });
  if (error) return { ok: false };
  if (r === "already_known") await upsertState(ctx, iid, { is_read: true });
  await recompute(ctx, pid);
  revalidateApp();
  return { ok: true };
}

export async function undoFeedback(projectId: string, feedbackId: string) {
  const ctx = await requireUser();
  await ctx.supabase.from("project_feedback").delete().eq("id", uuid.parse(feedbackId)).eq("project_id", uuid.parse(projectId));
  await recompute(ctx, projectId);
  revalidateApp();
}

/** Undo from the toast right after giving feedback (by item, the feedback id is not known client-side). */
export async function undoFeedbackForItem(projectId: string, itemId: string): Promise<{ ok: boolean }> {
  const ctx = await requireUser();
  const { error } = await ctx.supabase.from("project_feedback").delete().eq("project_id", uuid.parse(projectId)).eq("content_item_id", uuid.parse(itemId));
  await recompute(ctx, projectId);
  revalidateApp();
  return { ok: !error };
}

/** Reset learned adjustments for a project: all of them, or those about one source / technology / content type. */
export async function resetLearned(projectId: string, scope: "all" | "source" | "tech" | "kind", key?: string) {
  const ctx = await requireUser();
  const pid = uuid.parse(projectId);
  let q = ctx.supabase.from("project_feedback").delete().eq("project_id", pid);
  if (scope === "source") q = q.eq("reason", "wrong_source").eq("source_id", uuid.parse(key));
  if (scope === "tech") q = q.eq("reason", "wrong_topic").contains("tech_keys", [z.string().max(60).parse(key)]);
  if (scope === "kind") {
    const { data: ids } = await ctx.supabase.from("project_feedback").select("id, content_items!inner(content_kind)").eq("project_id", pid).eq("reason", "wrong_level").eq("content_items.content_kind", z.string().max(30).parse(key));
    q = q.in("id", (ids ?? []).map((r) => r.id));
  }
  await q;
  await recompute(ctx, pid);
  revalidateApp();
}

// ───────────────────────── Actions & resources ─────────────────────────

const actionStatus = z.enum(["to_study", "todo", "done", "dropped"]);

export async function createAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireUser();
  const parsed = z
    .object({
      project_id: uuid,
      content_item_id: uuid.optional(),
      title: z.string().trim().min(1, "Donne un titre à l’action.").max(300),
      note: z.string().trim().max(5000).optional(),
      status: actionStatus.default("to_study"),
    })
    .safeParse({
      project_id: form.get("project_id"),
      content_item_id: form.get("content_item_id") || undefined,
      title: form.get("title"),
      note: form.get("note") || undefined,
      status: form.get("status") || undefined,
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await ctx.supabase.from("project_actions").insert(parsed.data);
  if (error) return { error: "Création de l’action impossible." };
  revalidateApp();
  return { message: "Action créée." };
}

export async function updateActionStatus(actionId: string, form: FormData) {
  const ctx = await requireUser();
  await ctx.supabase.from("project_actions").update({ status: actionStatus.parse(form.get("status")), updated_at: new Date().toISOString() }).eq("id", uuid.parse(actionId));
  revalidateApp();
}

export async function updateActionNote(actionId: string, form: FormData) {
  const ctx = await requireUser();
  const note = z.string().trim().max(5000).parse(form.get("note") ?? "");
  await ctx.supabase.from("project_actions").update({ note: note || null, updated_at: new Date().toISOString() }).eq("id", uuid.parse(actionId));
  revalidateApp();
}

export async function deleteAction(actionId: string) {
  const ctx = await requireUser();
  await ctx.supabase.from("project_actions").delete().eq("id", uuid.parse(actionId));
  revalidateApp();
}

export async function addResource(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireUser();
  const parsed = z
    .object({
      project_id: uuid,
      url: z.string().trim().url("Lien invalide.").max(2000).refine((u) => /^https?:\/\//i.test(u), "Seuls les liens http(s) sont acceptés."),
      title: z.string().trim().min(1, "Donne un titre au lien.").max(300),
      note: z.string().trim().max(5000).optional(),
    })
    .safeParse({ project_id: form.get("project_id"), url: form.get("url"), title: form.get("title"), note: form.get("note") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // Stored as typed: no automatic fetch of arbitrary URLs.
  const { error } = await ctx.supabase.from("project_resources").insert(parsed.data);
  if (error) return { error: "Ajout impossible." };
  revalidateApp();
  return { message: "Lien enregistré." };
}

export async function deleteResource(resourceId: string) {
  const ctx = await requireUser();
  await ctx.supabase.from("project_resources").delete().eq("id", uuid.parse(resourceId));
  revalidateApp();
}

// ───────────────────────── Preferences ─────────────────────────

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((s) => s.slice(0, 60));

export async function updatePreferences(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireUser();
  const languages = form.getAll("languages").map(String).filter((l) => l === "fr" || l === "en");
  if (!languages.length) return { error: "Choisis au moins une langue de contenu." };
  await ctx.supabase
    .from("preferences")
    .update({ languages, interests: list(form.get("interests")), excluded_topics: list(form.get("excluded_topics")), ai_enabled: form.get("ai_enabled") === "on", updated_at: new Date().toISOString() })
    .eq("user_id", ctx.userId);
  await recomputeAll(ctx);
  revalidateApp();
  return { message: "Préférences enregistrées et appliquées au classement." };
}

// ───────────────────────── AI enrichment ─────────────────────────

async function consumeAiBudget(ctx: Ctx): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: p } = await ctx.supabase.from("preferences").select("ai_calls_day, ai_calls_count").eq("user_id", ctx.userId).single();
  const count = p?.ai_calls_day === today ? p.ai_calls_count : 0;
  if (count >= aiDailyBudget()) return false;
  await ctx.supabase.from("preferences").update({ ai_calls_day: today, ai_calls_count: count + 1 }).eq("user_id", ctx.userId);
  return true;
}

export async function generateAnalysis(projectId: string, itemId: string) {
  const ctx = await requireUser();
  const back = `/contenu/${uuid.parse(itemId)}`;
  const provider = getAiProvider();
  const { data: prefs } = await ctx.supabase.from("preferences").select("ai_enabled").eq("user_id", ctx.userId).single();
  if (!provider || !prefs?.ai_enabled) redirect(`${back}?ia=indisponible`);

  const { data: insight } = await ctx.supabase
    .from("project_insights")
    .select("score, projects(stage, project_type, features, problem, description, constraints, context_version, project_technologies(display_name, status, version)), content_items(id, title, excerpt, content_kind, published_at, release_tag, content_hash, sources(name))")
    .eq("project_id", uuid.parse(projectId))
    .eq("content_item_id", itemId)
    .single();
  if (!insight?.projects || !insight.content_items) redirect(`${back}?ia=introuvable`);
  if (insight.score < AI_MIN_SCORE) redirect(`${back}?ia=score`);
  if (!(await consumeAiBudget(ctx))) redirect(`${back}?ia=budget`);

  const p = insight.projects;
  const c = insight.content_items;
  // Only what the analysis needs: no private notes, no audience, no account data.
  const input: EnrichInput = {
    content: { id: c.id, title: c.title, excerpt: c.excerpt, kind: c.content_kind, sourceName: c.sources?.name ?? "", publishedAt: c.published_at, releaseTag: c.release_tag },
    project: {
      stage: p.stage,
      type: p.project_type,
      features: p.features.map((f) => FEATURES[f as FeatureKey]?.label ?? f),
      techs: p.project_technologies.map((t) => ({ name: t.display_name, status: t.status, version: t.version })),
      goals: p.problem ?? p.description,
      constraints: p.constraints,
    },
  };
  let outcome = "ok";
  try {
    const analysis = await enrichInsight(provider, input);
    await ctx.supabase
      .from("project_insights")
      .update({ ai: analysis as unknown as Json, ai_context_version: p.context_version, ai_content_hash: c.content_hash })
      .eq("project_id", projectId)
      .eq("content_item_id", itemId);
  } catch (e) {
    console.error("ai enrichment failed", (e as Error).message);
    outcome = "erreur";
  }
  revalidatePath(back);
  redirect(`${back}?ia=${outcome}`);
}

export async function setVisualEffects(enabled: boolean) {
  const ctx = await requireUser();
  await ctx.supabase.from("preferences").update({ visual_effects: enabled, updated_at: new Date().toISOString() }).eq("user_id", ctx.userId);
  revalidateApp();
}

// ───────────────────────── Command palette ─────────────────────────

export type PaletteHit = { kind: "project" | "content" | "resource"; id: string; title: string; hint: string; href: string; external?: boolean };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

/** Search the caller's own data only (user client: RLS applies to every table queried). */
export async function searchPalette(query: string): Promise<PaletteHit[]> {
  const ctx = await requireUser();
  const q = z.string().trim().min(2).max(80).safeParse(query);
  if (!q.success) return [];
  const term = escapeLike(q.data);
  const [{ data: projects }, { data: items }, { data: resources }] = await Promise.all([
    ctx.supabase.from("projects").select("id, name").ilike("name", `%${term}%`).limit(5),
    ctx.supabase.rpc("feed_items", { p_q: term }).order("best_score", { ascending: false }).limit(6),
    ctx.supabase.from("project_resources").select("id, title, url, projects(name)").ilike("title", `%${term}%`).limit(4),
  ]);
  return [
    ...(projects ?? []).map((p) => ({ kind: "project" as const, id: p.id, title: p.name, hint: "Projet", href: `/projets/${p.id}` })),
    ...(items ?? []).map((i) => ({ kind: "content" as const, id: i.id, title: i.title, hint: i.source_name ?? "Contenu", href: `/contenu/${i.id}` })),
    ...(resources ?? []).map((r) => ({ kind: "resource" as const, id: r.id, title: r.title, hint: `Lien · ${r.projects?.name ?? ""}`, href: r.url, external: true })),
  ];
}

// ───────────────────────── Dependency security ─────────────────────────

const patternSchema = z.array(z.string().trim().max(120).regex(/^(@[a-z0-9-~._*]+\/)?[a-z0-9-~._*]+$/i)).max(50);

/**
 * Import a dependency inventory parsed in the browser (the raw file is never uploaded).
 * The structure is re-validated here; only names of non-excluded registry packages are sent to GitHub.
 */
export async function importDependencies(projectId: string, payload: string, excluded: string): Promise<{ ok: true; unchecked: number; error: string | null } | { ok: false; error: string }> {
  const ctx = await requireUser();
  const pid = uuid.parse(projectId);
  const { data: project } = await ctx.supabase.from("projects").select("id").eq("id", pid).maybeSingle();
  if (!project) return { ok: false, error: "Projet introuvable." };
  if (payload.length > 3_000_000) return { ok: false, error: "Inventaire trop volumineux." };
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return { ok: false, error: "Inventaire illisible." };
  }
  const parsed = inventorySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Inventaire invalide : structure inattendue." };
  const patterns = patternSchema.safeParse(excluded.split(/[\s,]+/).filter(Boolean));
  if (!patterns.success) return { ok: false, error: "Motifs d’exclusion invalides (ex. @mon-org/*, paquet-interne)." };
  const inv = { ...parsed.data, entries: applyExclusions(parsed.data.entries, patterns.data) };
  let admin = null;
  try {
    admin = createAdminClient();
  } catch {
    // Without the service key the inventory is stored, but advisories cannot be refreshed: shown as « incomplète ».
  }
  try {
    const res = await importInventory(ctx.supabase, admin, pid, inv, patterns.data);
    revalidatePath(`/projets/${pid}`);
    return { ok: true, unchecked: res.unchecked, error: res.error };
  } catch (e) {
    console.error("dependency import failed", (e as Error).message);
    return { ok: false, error: "Enregistrement de l’inventaire impossible." };
  }
}

export async function reanalyzeSnapshot(projectId: string, snapshotId: string) {
  const ctx = await requireUser();
  await recomputeFindings(ctx.supabase, uuid.parse(snapshotId));
  revalidatePath(`/projets/${uuid.parse(projectId)}`);
}

export async function dismissFinding(projectId: string, ghsaId: string, pkg: string, form: FormData) {
  const ctx = await requireUser();
  const reason = z.string().trim().min(1).max(300).safeParse(form.get("reason"));
  if (!reason.success) return;
  await ctx.supabase
    .from("finding_dismissals")
    .upsert({ project_id: uuid.parse(projectId), ghsa_id: z.string().max(40).parse(ghsaId), package: z.string().max(214).parse(pkg), reason: reason.data }, { onConflict: "project_id,ghsa_id,package" });
  revalidatePath(`/projets/${projectId}`);
}

export async function restoreFinding(projectId: string, ghsaId: string, pkg: string) {
  const ctx = await requireUser();
  await ctx.supabase.from("finding_dismissals").delete().eq("project_id", uuid.parse(projectId)).eq("ghsa_id", ghsaId).eq("package", pkg);
  revalidatePath(`/projets/${projectId}`);
}

// ───────────────────────── Source proposals ─────────────────────────

const MAX_PENDING_PROPOSALS = 5;

export async function proposeSource(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireUser();
  const parsed = z
    .object({
      url: z.string().trim().max(2000),
      language: z.enum(["fr", "en", "other"]),
      topics: z.array(z.string().trim().min(1).max(40)).max(10),
      justification: z.string().trim().max(1000).optional(),
    })
    .safeParse({
      url: form.get("url"),
      language: form.get("language"),
      topics: String(form.get("topics") ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      justification: form.get("justification") || undefined,
    });
  if (!parsed.success) return { error: "Vérifie les champs : URL, langue et au plus 10 sujets." };
  // Static checks only: no request is made when a proposal is submitted.
  const problem = checkUrl(parsed.data.url);
  if (problem) return { error: problem };
  const { count } = await ctx.supabase.from("source_proposals").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).eq("status", "pending");
  if ((count ?? 0) >= MAX_PENDING_PROPOSALS) return { error: `Tu as déjà ${MAX_PENDING_PROPOSALS} propositions en attente.` };
  const { error } = await ctx.supabase.from("source_proposals").insert({ ...parsed.data, user_id: ctx.userId });
  if (error) return { error: "Envoi impossible. Réessaie." };
  revalidatePath("/parametres");
  return { message: "Merci ! Proposition en attente de modération : elle ne déclenche aucune collecte." };
}

async function requireAdmin() {
  const ctx = await requireUser();
  const { data } = await ctx.supabase.rpc("is_admin");
  if (data !== true) throw new Error("Accès réservé à la modération.");
  return ctx;
}

/** Moderator-only network check of a proposed feed, through the SSRF-safe fetcher. */
export async function validateProposal(proposalId: string) {
  const ctx = await requireAdmin();
  const { data: p } = await ctx.supabase.from("source_proposals").select("url").eq("id", uuid.parse(proposalId)).single();
  if (!p) return;
  let validation: Record<string, unknown>;
  try {
    const res = await safeFetchText(p.url);
    const items = parseFeed(res.body, res.finalUrl);
    const dated = items.flatMap((i) => (i.publishedAt ? [i.publishedAt] : [])).sort();
    validation = { ok: items.length > 0, items: items.length, latest: dated.at(-1) ?? null, finalUrl: res.finalUrl, redirects: res.redirects, sample: items.slice(0, 3).map((i) => i.title) };
  } catch (e) {
    validation = { ok: false, error: (e as Error).message.slice(0, 200) };
  }
  await ctx.supabase.from("source_proposals").update({ validation: { ...validation, checkedAt: new Date().toISOString() } as NonNullable<Json> }).eq("id", proposalId);
  revalidatePath("/moderation");
}

export async function reviewProposal(proposalId: string, form: FormData) {
  const ctx = await requireAdmin();
  const status = z.enum(["accepted", "rejected"]).parse(form.get("status"));
  const note = z.string().trim().max(1000).parse(form.get("note") ?? "");
  // Accepting records the decision only: adding to the shared catalog stays a reviewed code change (catalog.ts).
  await ctx.supabase.from("source_proposals").update({ status, review_note: note || null, reviewed_at: new Date().toISOString(), reviewed_by: ctx.userId }).eq("id", uuid.parse(proposalId));
  revalidatePath("/moderation");
}

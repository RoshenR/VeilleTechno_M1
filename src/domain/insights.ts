import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { isActive, type FeatureKey, type Stage, type TechStatus } from "./projects";
import { RANKING_VERSION, rankItem, type RankItem, type RankProject } from "./ranking";
import { SOURCE_CATALOG } from "./sources/catalog";
import type { ContentKind } from "./sources/normalize";
import { TECHNOLOGIES } from "./technologies";

type Db = SupabaseClient<Database>;

const CANDIDATE_LIMIT = 600;

/**
 * Version of everything that shapes an analysis apart from the project's own context (context_version)
 * and its feedback (recomputed on the spot): ranking rules, technology catalog and aliases, source catalog.
 * Changing any of them changes the signature, and the scheduler recomputes the affected projects in the background.
 */
export const RANKING_SIGNATURE = createHash("sha256")
  .update(JSON.stringify([RANKING_VERSION, TECHNOLOGIES, SOURCE_CATALOG.map((s) => [s.key, s.techKeys, s.quality, s.isOfficial, s.language])]))
  .digest("hex")
  .slice(0, 16);

type FeedbackRow = { content_item_id: string; reason: string; tech_keys: string[]; source_id: string | null; content_items: { source_id: string; content_kind: string } | null };

/** Feedback → bounded per-project adjustments (see FEEDBACK_BOUNDS). Every reason except « mauvaise source » hides that item for this project only. */
export function feedbackAdjustments(feedback: FeedbackRow[]) {
  const count = (m: Map<string, number>, k: string | null | undefined) => k && m.set(k, (m.get(k) ?? 0) + 1);
  const sourcePenalties = new Map<string, number>();
  const techPenalties = new Map<string, number>();
  const kindPenalties = new Map<string, number>();
  const dismissed = new Set<string>();
  for (const f of feedback) {
    if (f.reason === "wrong_source") count(sourcePenalties, f.source_id ?? f.content_items?.source_id);
    else dismissed.add(f.content_item_id);
    if (f.reason === "wrong_topic") for (const t of f.tech_keys) count(techPenalties, t);
    if (f.reason === "wrong_level") count(kindPenalties, f.content_items?.content_kind);
    // « Déjà connu » acts on the item's read state (see giveFeedback), never on the topic.
  }
  return { sourcePenalties, techPenalties, kindPenalties, dismissed };
}

/**
 * Recompute deterministic insights for one project. Works with the user's client (RLS: owner only)
 * or the service role (scheduler). Keeps AI analyses in place: they carry their own context/content
 * versions and are ignored once stale. Favorites, notes and actions live elsewhere and are untouched.
 */
export async function refreshProjectInsights(db: Db, projectId: string): Promise<{ included: number; skipped?: string }> {
  const { data: project, error } = await db
    .from("projects")
    .select("id, owner_id, stage, features, archived_at, context_version, project_technologies(tech_key, display_name, status, version), project_sources(source_id)")
    .eq("id", projectId)
    .single();
  if (error || !project) throw new Error(error?.message ?? "Projet introuvable");

  const markDone = () =>
    db.from("projects").update({ insights_version: project.context_version, insights_refreshed_at: new Date().toISOString(), ranking_signature: RANKING_SIGNATURE }).eq("id", projectId);

  // Paused / archived projects stay readable but get no new recommendations.
  if (!isActive(project)) {
    await markDone();
    return { included: 0, skipped: "inactive" };
  }

  const sourceIds = project.project_sources.map((s) => s.source_id);
  const [{ data: prefs }, { data: feedback }, { data: items, error: itemsError }] = await Promise.all([
    db.from("preferences").select("*").eq("user_id", project.owner_id).maybeSingle(),
    db.from("project_feedback").select("content_item_id, reason, tech_keys, source_id, content_items(source_id, content_kind)").eq("project_id", projectId),
    sourceIds.length
      ? db
          .from("content_items")
          .select("id, source_id, title, excerpt, content_kind, is_prerelease, published_at, language, content_hash, sources(name, quality, is_official, tech_keys)")
          .in("source_id", sourceIds)
          .order("collected_at", { ascending: false })
          .limit(CANDIDATE_LIMIT)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemsError) throw new Error(itemsError.message);

  const adj = feedbackAdjustments(feedback ?? []);

  const rp: RankProject = {
    stage: project.stage as Stage,
    features: project.features as FeatureKey[],
    techs: project.project_technologies.map((t) => ({ key: t.tech_key, name: t.display_name, status: t.status as TechStatus, version: t.version })),
    interests: prefs?.interests ?? [],
    excludedTopics: prefs?.excluded_topics ?? [],
    languages: prefs?.languages ?? [],
    hiddenSourceIds: prefs?.hidden_source_ids ?? [],
    dismissedItemIds: adj.dismissed,
    sourcePenalties: adj.sourcePenalties,
    techPenalties: adj.techPenalties,
    kindPenalties: adj.kindPenalties,
  };

  const now = Date.now();
  const rows: Database["public"]["Tables"]["project_insights"]["Insert"][] = [];
  for (const it of items ?? []) {
    if (!it.sources) continue;
    const ri: RankItem = {
      id: it.id,
      sourceId: it.source_id,
      title: it.title,
      excerpt: it.excerpt,
      kind: it.content_kind as ContentKind,
      isPrerelease: it.is_prerelease,
      publishedAt: it.published_at,
      language: it.language,
      source: { name: it.sources.name, quality: it.sources.quality, isOfficial: it.sources.is_official, techKeys: it.sources.tech_keys },
    };
    const r = rankItem(rp, ri, now);
    if (!r.included) continue;
    rows.push({
      project_id: projectId,
      content_item_id: it.id,
      score: r.score,
      priority: r.priority,
      why: r.why,
      reasons: r.reasons as unknown as NonNullable<Json>,
      matched_techs: r.matchedTechs,
      matched_features: r.matchedFeatures,
      context_version: project.context_version,
      content_hash: it.content_hash,
      computed_at: new Date(now).toISOString(),
    });
  }

  for (let i = 0; i < rows.length; i += 200) {
    const { error: upErr } = await db.from("project_insights").upsert(rows.slice(i, i + 200), { onConflict: "project_id,content_item_id" });
    if (upErr) throw new Error(upErr.message);
  }

  // Remove insights that no longer qualify.
  const keep = new Set(rows.map((r) => r.content_item_id));
  const { data: existing } = await db.from("project_insights").select("content_item_id").eq("project_id", projectId);
  const stale = (existing ?? []).map((e) => e.content_item_id).filter((id) => !keep.has(id));
  for (let i = 0; i < stale.length; i += 100) {
    await db.from("project_insights").delete().eq("project_id", projectId).in("content_item_id", stale.slice(i, i + 100));
  }

  await markDone();
  return { included: rows.length };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { isActive, type FeatureKey, type Stage, type TechStatus } from "./projects";
import { rankItem, type RankItem, type RankProject } from "./ranking";
import type { ContentKind } from "./sources/normalize";

type Db = SupabaseClient<Database>;

const CANDIDATE_LIMIT = 600;

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
    db.from("projects").update({ insights_version: project.context_version, insights_refreshed_at: new Date().toISOString() }).eq("id", projectId);

  // Paused / archived projects stay readable but get no new recommendations.
  if (!isActive(project)) {
    await markDone();
    return { included: 0, skipped: "inactive" };
  }

  const sourceIds = project.project_sources.map((s) => s.source_id);
  const [{ data: prefs }, { data: feedback }, { data: items, error: itemsError }] = await Promise.all([
    db.from("preferences").select("*").eq("user_id", project.owner_id).maybeSingle(),
    db.from("project_feedback").select("content_item_id, reason, content_items(source_id)").eq("project_id", projectId),
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

  const penalties = new Map<string, number>();
  for (const f of feedback ?? []) {
    if (f.reason === "wrong_source" && f.content_items) penalties.set(f.content_items.source_id, (penalties.get(f.content_items.source_id) ?? 0) + 1);
  }

  const rp: RankProject = {
    stage: project.stage as Stage,
    features: project.features as FeatureKey[],
    techs: project.project_technologies.map((t) => ({ key: t.tech_key, name: t.display_name, status: t.status as TechStatus, version: t.version })),
    interests: prefs?.interests ?? [],
    excludedTopics: prefs?.excluded_topics ?? [],
    languages: prefs?.languages ?? [],
    hiddenSourceIds: prefs?.hidden_source_ids ?? [],
    dismissedItemIds: new Set((feedback ?? []).filter((f) => f.reason !== "wrong_source").map((f) => f.content_item_id)),
    sourcePenalties: penalties,
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

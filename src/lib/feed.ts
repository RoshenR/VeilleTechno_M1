import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRIORITY_THRESHOLD, type Priority } from "@/domain/ranking";
import { CONTENT_KINDS, isNewsKind, type ContentKind } from "@/domain/sources/normalize";
import type { Database } from "./database.types";

type Db = SupabaseClient<Database>;

export const PAGE_SIZE = 15;
const MAX_ROWS = 800;

export type FeedFilters = {
  project?: string;
  tech?: string;
  kind?: ContentKind;
  source?: string;
  period?: "7" | "30" | "90" | "365";
  read?: "unread" | "read";
  sort: "relevance" | "date";
  section: "news" | "background";
  page: number;
};

export function parseFilters(sp: Record<string, string | string[] | undefined>): FeedFilters {
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const kind = one("type");
  const period = one("periode");
  const read = one("lecture");
  return {
    project: one("projet"),
    tech: one("techno"),
    kind: CONTENT_KINDS.includes(kind as ContentKind) ? (kind as ContentKind) : undefined,
    source: one("source"),
    period: ["7", "30", "90", "365"].includes(period ?? "") ? (period as FeedFilters["period"]) : undefined,
    read: read === "unread" || read === "read" ? read : undefined,
    sort: one("tri") === "date" ? "date" : "relevance",
    section: one("section") === "fond" ? "background" : "news",
    page: Math.max(1, Math.min(100, Number(one("page") ?? 1) || 1)),
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
    isDemo?: boolean;
  };
  projects: ProjectInsightView[];
  bestScore: number;
  isRead: boolean;
  isFavorite: boolean;
};

const INSIGHT_SELECT =
  "project_id, score, priority, why, matched_techs, projects!inner(id, name, archived_at), content_items!inner(id, title, canonical_url, excerpt, content_kind, is_prerelease, release_tag, published_at, source_id, sources(name))";

/** Group per-project insights by content (global view shows one card per content + concerned projects). */
export async function loadFeed(db: Db, f: FeedFilters) {
  let q = db.from("project_insights").select(INSIGHT_SELECT).order("score", { ascending: false }).limit(MAX_ROWS);
  if (f.project) q = q.eq("project_id", f.project);
  else q = q.is("projects.archived_at", null);
  if (f.tech) q = q.contains("matched_techs", [f.tech]);
  if (f.kind) q = q.eq("content_items.content_kind", f.kind);
  if (f.source) q = q.eq("content_items.source_id", f.source);
  if (f.period) q = q.gte("content_items.published_at", new Date(Date.now() - Number(f.period) * 86_400_000).toISOString());

  const [{ data, error }, { data: states }] = await Promise.all([q, db.from("user_content_state").select("content_item_id, is_read, is_favorite")]);
  if (error) throw new Error(error.message);
  const stateById = new Map((states ?? []).map((s) => [s.content_item_id, s]));

  // ponytail: grouping/pagination in memory over the top MAX_ROWS insights; move to SQL if users hit the cap.
  const byItem = new Map<string, FeedEntry>();
  for (const r of data ?? []) {
    const c = r.content_items;
    let e = byItem.get(c.id);
    if (!e) {
      const st = stateById.get(c.id);
      e = {
        item: {
          id: c.id,
          title: c.title,
          url: c.canonical_url,
          excerpt: c.excerpt,
          kind: c.content_kind as ContentKind,
          isPrerelease: c.is_prerelease,
          releaseTag: c.release_tag,
          publishedAt: c.published_at,
          sourceId: c.source_id,
          sourceName: c.sources?.name ?? "Source",
        },
        projects: [],
        bestScore: 0,
        isRead: st?.is_read ?? false,
        isFavorite: st?.is_favorite ?? false,
      };
      byItem.set(c.id, e);
    }
    e.projects.push({ projectId: r.project_id, projectName: r.projects.name, score: r.score, priority: r.priority as Priority, why: r.why, matchedTechs: r.matched_techs });
    e.bestScore = Math.max(e.bestScore, r.score);
  }

  let all = [...byItem.values()];
  if (f.read) all = all.filter((e) => (f.read === "read" ? e.isRead : !e.isRead));
  const byDate = (a: FeedEntry, b: FeedEntry) => (b.item.publishedAt ?? "").localeCompare(a.item.publishedAt ?? "");
  all.sort(f.sort === "date" ? byDate : (a, b) => b.bestScore - a.bestScore || byDate(a, b));

  // Up to five priorities, only when relevance justifies it — never padded.
  const priorities = [...byItem.values()]
    .filter((e) => !e.isRead && e.bestScore >= PRIORITY_THRESHOLD && !e.item.isPrerelease)
    .sort((a, b) => b.bestScore - a.bestScore || byDate(a, b))
    .slice(0, 5);

  // Priorities are shown once, above the feed — not repeated in it.
  const prioIds = new Set(priorities.map((e) => e.item.id));
  const rest = all.filter((e) => !prioIds.has(e.item.id));
  const news = rest.filter((e) => isNewsKind(e.item.kind));
  const background = rest.filter((e) => !isNewsKind(e.item.kind));
  const list = f.section === "news" ? news : background;
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  return {
    priorities,
    entries: list.slice((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE),
    counts: { news: news.length, background: background.length },
    pages,
    capped: (data?.length ?? 0) >= MAX_ROWS,
  };
}

/** Latest scheduler run + subscribed sources currently failing. */
export async function loadSyncStatus(db: Db) {
  const [{ data: runs }, { data: subs }] = await Promise.all([
    db.from("ingestion_runs").select("status, started_at, finished_at, sources_done, sources_failed, trigger").neq("trigger", "manual").order("started_at", { ascending: false }).limit(1),
    db.from("project_sources").select("sources(id, name, last_error, last_success_at, consecutive_failures)"),
  ]);
  const failing = new Map<string, { name: string; error: string; lastSuccess: string | null }>();
  for (const s of subs ?? []) if (s.sources?.last_error) failing.set(s.sources.id, { name: s.sources.name, error: s.sources.last_error, lastSuccess: s.sources.last_success_at });
  return { lastRun: runs?.[0] ?? null, failing: [...failing.values()] };
}

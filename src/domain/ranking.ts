// Deterministic, explainable ranking. One call = one (project, content item) pair.
// Factor bounds (internal score 0..100, never shown as a percentage):
//   tech      0..40  catalog/alias match against the project stack (0 and redistributed when no stack)
//   needs     0..25  match with followed features / interests (0..45 without stack)
//   stage     0..15  content type fit for the project stage   (0..35 without stack)
//   source    0..10  source quality / directness (official = 10)
//   freshness 0..10  news: recency; background resources: mostly stable
// Inclusion requires tech > 0 or needs > 0 — freshness or source quality alone never qualify an item.

import { FEATURES, type FeatureKey, type Stage, type TechStatus } from "./projects";
import { aliasesFor, foldText, getTechnology } from "./technologies";
import { isNewsKind, type ContentKind } from "./sources/normalize";

export const RANKING_VERSION = 1;
export const INCLUDE_THRESHOLD = 30;
export const PRIORITY_THRESHOLD = 65;

export type RankProject = {
  stage: Stage;
  features: FeatureKey[];
  techs: { key: string; name: string; status: TechStatus; version: string | null }[];
  interests: string[];
  excludedTopics: string[];
  languages: string[];
  hiddenSourceIds: string[];
  /** content ids hidden through « Peu pertinent » feedback */
  dismissedItemIds: Set<string>;
  /** source id → number of « mauvaise source » feedbacks */
  sourcePenalties: Map<string, number>;
};

export type RankItem = {
  id: string;
  sourceId: string;
  title: string;
  excerpt: string | null;
  kind: ContentKind;
  isPrerelease: boolean;
  publishedAt: string | null;
  language: string | null;
  source: { quality: number; isOfficial: boolean; techKeys: string[]; name: string };
};

export type Priority = "explore" | "watch" | "verify" | "action";
export const PRIORITY_LABELS: Record<Priority, string> = {
  explore: "À explorer",
  watch: "À surveiller",
  verify: "Applicabilité à vérifier",
  action: "Action prioritaire",
};

export type Reason = { factor: "tech" | "needs" | "stage" | "source" | "freshness" | "penalty"; points: number; label: string };
export type RankResult =
  | { included: false; excludedBy: string }
  | { included: true; score: number; priority: Priority; why: string; reasons: Reason[]; matchedTechs: string[]; matchedFeatures: FeatureKey[] };

const STATUS_WEIGHT: Record<TechStatus, number> = { used: 1, considered: 0.6, exploring: 0.5 };

// Stage fit (0..1) per content kind. idea → design/comparisons; development → docs/integrations;
// production → maintenance, compatibility, deprecations.
const STAGE_FIT: Record<Exclude<Stage, "paused">, Record<ContentKind, number>> = {
  idea: { tutorial: 1, tool: 1, experience: 1, news: 0.5, release: 0.3, breaking: 0.2, security: 0.3 },
  prototype: { tutorial: 1, tool: 0.9, experience: 0.8, news: 0.5, release: 0.5, breaking: 0.4, security: 0.5 },
  development: { tutorial: 1, tool: 0.8, experience: 0.7, release: 0.7, breaking: 0.8, security: 0.8, news: 0.4 },
  production: { breaking: 1, security: 1, release: 0.9, experience: 0.6, tutorial: 0.4, tool: 0.4, news: 0.4 },
};
const DESIGN_HINT = /\b(vs\.?|versus|comparison|compare|comparatif|alternatives?|choosing|choisir|architecture|getting started)\b/;

const DAY = 86_400_000;

function freshness(kind: ContentKind, publishedAt: string | null, now: number): { points: number; label: string } {
  if (!publishedAt) return { points: 2, label: "Date de publication inconnue" };
  const age = (now - new Date(publishedAt).getTime()) / DAY;
  if (isNewsKind(kind)) {
    if (age <= 7) return { points: 10, label: "Publié cette semaine" };
    if (age <= 30) return { points: 7, label: "Publié ce mois-ci" };
    if (age <= 90) return { points: 4, label: "Publié ces trois derniers mois" };
    if (age <= 365) return { points: 1, label: "Actualité de plus de trois mois" };
    return { points: 0, label: "Actualité ancienne" };
  }
  // Background resources: usefulness first, mild decay only.
  if (age <= 730) return { points: 8, label: "Ressource de fond récente" };
  return { points: 5, label: "Ressource de fond plus ancienne" };
}

const wordRe = (w: string) => new RegExp(`(?<![\\w])${foldText(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`);

export function rankItem(p: RankProject, item: RankItem, now = Date.now()): RankResult {
  if (p.stage === "paused") return { included: false, excludedBy: "Projet en pause" };
  if (p.dismissedItemIds.has(item.id)) return { included: false, excludedBy: "Marqué peu pertinent" };
  if (p.hiddenSourceIds.includes(item.sourceId)) return { included: false, excludedBy: "Source masquée" };
  if (item.language && p.languages.length && !p.languages.includes(item.language)) return { included: false, excludedBy: "Langue exclue" };

  const title = foldText(item.title);
  const body = `${title} ${foldText(item.excerpt ?? "")}`;
  const excluded = p.excludedTopics.find((t) => t.trim() && wordRe(t).test(body));
  if (excluded) return { included: false, excludedBy: `Sujet exclu : ${excluded}` };

  const hasStack = p.techs.length > 0;
  const W = hasStack ? { tech: 40, needs: 25, stage: 15 } : { tech: 0, needs: 45, stage: 35 };
  const reasons: Reason[] = [];

  // ── tech ──
  const matchedTechs: { key: string; name: string; status: TechStatus; strength: number; version: string | null }[] = [];
  for (const t of p.techs) {
    const res = aliasesFor(t.key, t.name);
    const strength = res.some((r) => r.test(title)) ? 1 : res.some((r) => r.test(body)) ? 0.75 : item.source.techKeys.includes(t.key) ? 0.75 : 0;
    if (strength > 0) matchedTechs.push({ ...t, strength: strength * STATUS_WEIGHT[t.status] });
  }
  matchedTechs.sort((a, b) => b.strength - a.strength);
  let techPoints = 0;
  if (matchedTechs.length) {
    techPoints = Math.min(W.tech, Math.round(W.tech * matchedTechs[0].strength) + 5 * (matchedTechs.length - 1));
    const names = matchedTechs.map((t) => `${t.name} (${t.status === "used" ? "utilisée" : t.status === "considered" ? "envisagée" : "à explorer"})`);
    reasons.push({ factor: "tech", points: techPoints, label: `Concerne ${names.join(", ")}` });
  }

  // ── needs ──
  const matchedFeatures = p.features.filter((f) => FEATURES[f].keywords.some((k) => wordRe(k).test(body)));
  const matchedInterests = p.interests.filter((i) => i.trim() && wordRe(i).test(body));
  let needsPoints = 0;
  if (matchedFeatures.length) {
    needsPoints = Math.round(W.needs * 0.72) + Math.round(W.needs * 0.28) * Math.min(1, matchedFeatures.length - 1);
    reasons.push({ factor: "needs", points: needsPoints, label: `Lié à vos besoins : ${matchedFeatures.map((f) => FEATURES[f].label.toLowerCase()).join(", ")}` });
  }
  if (matchedInterests.length) {
    const bonus = Math.min(W.needs - needsPoints, Math.round(W.needs * 0.2));
    if (bonus > 0) {
      needsPoints += bonus;
      reasons.push({ factor: "needs", points: bonus, label: `Correspond à vos intérêts : ${matchedInterests.join(", ")}` });
    }
  }

  if (techPoints === 0 && needsPoints === 0) return { included: false, excludedBy: "Aucune correspondance de technologie ou de besoin" };

  // ── stage ──
  let fit = STAGE_FIT[p.stage][item.kind];
  if ((p.stage === "idea" || p.stage === "prototype") && DESIGN_HINT.test(body)) fit = 1;
  if (item.isPrerelease) fit *= p.stage === "production" ? 0.3 : 0.6;
  const stagePoints = Math.round(W.stage * fit);
  if (stagePoints > 0) reasons.push({ factor: "stage", points: stagePoints, label: stageLabel(p.stage, item.kind, item.isPrerelease) });

  // ── source ──
  const sourcePoints = item.source.isOfficial ? 10 : Math.max(0, Math.min(10, item.source.quality));
  reasons.push({ factor: "source", points: sourcePoints, label: item.source.isOfficial ? `Source officielle (${item.source.name})` : `Source éditoriale (${item.source.name})` });

  // ── freshness ──
  const f = freshness(item.kind, item.publishedAt, now);
  reasons.push({ factor: "freshness", points: f.points, label: f.label });

  // ── explicit feedback ──
  const penaltyCount = p.sourcePenalties.get(item.sourceId) ?? 0;
  const penalty = Math.min(20, penaltyCount * 10);
  if (penalty) reasons.push({ factor: "penalty", points: -penalty, label: "Source signalée comme peu pertinente pour ce projet" });

  const score = Math.max(0, Math.min(100, techPoints + needsPoints + stagePoints + sourcePoints + f.points - penalty));
  if (score < INCLUDE_THRESHOLD) return { included: false, excludedBy: "Pertinence insuffisante" };

  const priority = priorityFor(p, item, matchedTechs, score);
  const why = [reasons.find((r) => r.factor === "tech")?.label, reasons.find((r) => r.factor === "needs")?.label?.replace(/^Lié à/, "lié à"), stagePoints >= W.stage * 0.8 ? `adapté au stade « ${stageName(p.stage)} »` : null]
    .filter(Boolean)
    .join(" · ");

  return {
    included: true,
    score,
    priority,
    why: why.charAt(0).toUpperCase() + why.slice(1),
    reasons,
    matchedTechs: matchedTechs.map((t) => t.key),
    matchedFeatures,
  };
}

function priorityFor(p: RankProject, item: RankItem, techs: { key: string; status: TechStatus; version: string | null }[], score: number): Priority {
  const used = techs.filter((t) => t.status === "used");
  const operational = item.kind === "security" || item.kind === "breaking";
  if (operational && used.length && (p.stage === "development" || p.stage === "production")) {
    // An operational alert requires an official source and a version we can actually compare.
    const text = `${item.title} ${item.excerpt ?? ""}`;
    const versionMatch = used.some((t) => {
      const major = t.version?.match(/^\D*(\d+)/)?.[1];
      return major ? new RegExp(`(?<![\\d.])v?${major}\\.(\\d+|x)`).test(text) : false;
    });
    return item.source.isOfficial && versionMatch && !item.isPrerelease ? "action" : "verify";
  }
  // Considered / exploring technologies → discovery, never an operational alert.
  if (!used.length) return "explore";
  if ((item.kind === "release" || item.kind === "news" || operational) && score >= 50) return "watch";
  return "explore";
}

const stageName = (s: Stage) => ({ idea: "idée", prototype: "prototype", development: "développement", production: "production", paused: "en pause" })[s];

function stageLabel(stage: Stage, kind: ContentKind, pre: boolean): string {
  if (pre) return "Préversion : à tester avant toute adoption";
  if (stage === "idea" || stage === "prototype") return kind === "tutorial" || kind === "tool" || kind === "experience" ? "Utile pour concevoir et comparer les options" : "Information de contexte pour un projet en conception";
  if (stage === "development") return kind === "tutorial" || kind === "tool" ? "Documentation et intégration utiles en développement" : "À connaître pendant le développement";
  return kind === "breaking" || kind === "security" || kind === "release" ? "Maintenance et compatibilité en production" : "Ressource secondaire pour un projet en production";
}

/** Version sanity: does the project know which version it runs? Used to flag « version inconnue ». */
export function unknownVersionTechs(p: RankProject, matched: string[]): string[] {
  return p.techs.filter((t) => matched.includes(t.key) && t.status === "used" && !t.version).map((t) => getTechnology(t.key)?.name ?? t.name);
}

// Small evaluation set of representative cases for relevance changes. Each case states what a sensible
// curator would expect; run it after touching ranking rules, catalogs or feedback effects.
import { describe, expect, it } from "vitest";
import { feedbackAdjustments } from "./insights";
import { FEEDBACK_BOUNDS, rankItem, type RankItem, type RankProject } from "./ranking";

const NOW = Date.parse("2026-10-29T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const project = (o: Partial<RankProject> = {}): RankProject => ({
  stage: "development",
  features: [],
  techs: [],
  interests: [],
  excludedTopics: [],
  languages: ["fr", "en"],
  hiddenSourceIds: [],
  dismissedItemIds: new Set(),
  sourcePenalties: new Map(),
  ...o,
});
const item = (o: Partial<RankItem> = {}): RankItem => ({
  id: "i",
  sourceId: "s",
  title: "Untitled",
  excerpt: null,
  kind: "news",
  isPrerelease: false,
  publishedAt: daysAgo(2),
  language: "en",
  source: { quality: 7, isOfficial: false, techKeys: [], name: "Blog" },
  ...o,
});
const score = (p: RankProject, i: RankItem) => {
  const r = rankItem(p, i, NOW);
  return r.included ? r.score : -1;
};

const saas = project({
  stage: "production",
  features: ["payment", "auth"],
  techs: [
    { key: "nextjs", name: "Next.js", status: "used", version: "16.1" },
    { key: "postgresql", name: "PostgreSQL", status: "used", version: "17" },
    { key: "stripe", name: "Stripe", status: "considered", version: null },
  ],
});
const idea = project({ stage: "idea", features: ["payment", "seo"] });

describe("relevance evaluation set", () => {
  it("1. an official security fix on a used technology outranks a generic tutorial", () => {
    const sec = item({ title: "Next.js 16.1.4 security release", kind: "security", source: { quality: 10, isOfficial: true, techKeys: ["nextjs"], name: "Next.js" } });
    const tuto = item({ title: "How to build a landing page", kind: "tutorial", excerpt: "with Next.js" });
    expect(score(saas, sec)).toBeGreaterThan(score(saas, tuto));
  });

  it("2. a project without stack still gets useful, need-based items (and nothing unrelated)", () => {
    expect(score(idea, item({ title: "Comparing payment providers for subscriptions", kind: "tutorial" }))).toBeGreaterThan(30);
    expect(score(idea, item({ title: "Kubernetes 1.34 released", kind: "release" }))).toBe(-1);
  });

  it("3. a considered technology is discovery, never an operational alert", () => {
    const r = rankItem(saas, item({ title: "Stripe API breaking change for checkout", kind: "breaking", source: { quality: 10, isOfficial: true, techKeys: ["stripe"], name: "Stripe" } }), NOW);
    expect(r.included && r.priority).toBe("explore");
  });

  it("4. one « mauvais sujet » click lowers the topic for this project, boundedly, without excluding it", () => {
    const i = item({ title: "PostgreSQL 18 performance notes", kind: "news" });
    const base = score(saas, i);
    const many = feedbackAdjustments(Array.from({ length: 10 }, () => ({ content_item_id: "other", reason: "wrong_topic", tech_keys: ["postgresql"], source_id: null, content_items: null })));
    const after = rankItem(saas, i, NOW);
    const penalised = rankItem({ ...saas, techPenalties: many.techPenalties }, i, NOW);
    expect(after.included && penalised.included).toBe(true);
    if (after.included && penalised.included) {
      expect(base - penalised.score).toBe(FEEDBACK_BOUNDS.tech.max);
      expect(penalised.why).toMatch(/retours/);
      expect(penalised.reasons.some((r) => r.factor === "penalty" && /PostgreSQL/.test(r.label))).toBe(true);
    }
  });

  it("5. « déjà connu » hides the item for this project but never lowers its topic", () => {
    const adj = feedbackAdjustments([{ content_item_id: "x", reason: "already_known", tech_keys: ["postgresql"], source_id: "s", content_items: { source_id: "s", content_kind: "news" } }]);
    expect(adj.dismissed.has("x")).toBe(true);
    expect(adj.techPenalties.size + adj.sourcePenalties.size + adj.kindPenalties.size).toBe(0);
  });

  it("6. feedback stays per project: another project with the same stack is untouched", () => {
    const i = item({ id: "same", title: "Next.js 16.2 is out", kind: "release" });
    const adj = feedbackAdjustments([{ content_item_id: "same", reason: "not_useful", tech_keys: ["nextjs"], source_id: "s", content_items: null }]);
    expect(rankItem({ ...saas, dismissedItemIds: adj.dismissed }, i, NOW).included).toBe(false);
    expect(rankItem(saas, i, NOW).included).toBe(true);
  });

  it("7. language preference keeps essential official announcements", () => {
    const fr = project({ ...saas, languages: ["fr"] });
    expect(rankItem(fr, item({ title: "Next.js 16.2 is out", kind: "release" }), NOW).included).toBe(false);
    const sec = rankItem(fr, item({ title: "Next.js security advisory", kind: "security", source: { quality: 10, isOfficial: true, techKeys: ["nextjs"], name: "Next.js" } }), NOW);
    expect(sec.included).toBe(true);
  });

  it("8. freshness alone never qualifies an item", () => {
    expect(score(saas, item({ title: "This week in tech", publishedAt: daysAgo(0), source: { quality: 10, isOfficial: true, techKeys: [], name: "X" } }))).toBe(-1);
  });
});

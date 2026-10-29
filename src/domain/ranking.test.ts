import { describe, expect, it } from "vitest";
import { rankItem, type RankItem, type RankProject } from "./ranking";
import { detectTechnologies } from "./technologies";

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
  id: "i1",
  sourceId: "s1",
  title: "Untitled",
  excerpt: null,
  kind: "news",
  isPrerelease: false,
  publishedAt: daysAgo(2),
  language: "en",
  source: { quality: 7, isOfficial: false, techKeys: [], name: "Blog" },
  ...o,
});

const saas = project({ techs: [{ key: "nextjs", name: "Next.js", status: "used", version: "16.1" }, { key: "postgresql", name: "PostgreSQL", status: "used", version: null }], features: ["payment"] });
const idea = project({ stage: "idea", features: ["payment", "auth"] });

describe("rankItem", () => {
  it("matches a stack technology and explains it", () => {
    const r = rankItem(saas, item({ title: "Next.js 16.2 is out", kind: "release" }), NOW);
    expect(r.included).toBe(true);
    if (!r.included) return;
    expect(r.matchedTechs).toContain("nextjs");
    expect(r.why).toMatch(/Next\.js \(utilisée\)/);
    expect(r.priority).toBe("watch");
  });

  it("requires a technology or need match — freshness alone is not enough", () => {
    const r = rankItem(saas, item({ title: "Our company retreat photos", publishedAt: daysAgo(0), source: { quality: 10, isOfficial: true, techKeys: [], name: "X" } }), NOW);
    expect(r).toEqual({ included: false, excludedBy: "Aucune correspondance de technologie ou de besoin" });
  });

  it("does not confuse ambiguous words with products", () => {
    expect(detectTechnologies("We will go to the next meetup and expo hall")).toEqual([]);
    expect(detectTechnologies("Built with Next.js, Golang and Expo Router").map((t) => t.key)).toEqual(["nextjs", "expo", "go"]);
    expect(rankItem(saas, item({ title: "What comes next for the web" }), NOW).included).toBe(false);
  });

  it("ranks a project without stack on needs and stage, not artificially low", () => {
    const r = rankItem(idea, item({ title: "How to choose a payment provider: comparison", kind: "tutorial" }), NOW);
    expect(r.included).toBe(true);
    if (r.included) {
      expect(r.score).toBeGreaterThanOrEqual(65);
      expect(r.matchedTechs).toEqual([]);
      expect(r.matchedFeatures).toEqual(["payment"]);
    }
  });

  it("gives the same item different explanations for two projects", () => {
    const it1 = item({ title: "Accepting payments with Stripe in Next.js", kind: "tutorial", publishedAt: daysAgo(400) });
    const a = rankItem(saas, it1, NOW);
    const b = rankItem(idea, it1, NOW);
    expect(a.included && b.included).toBe(true);
    if (a.included && b.included) expect(a.why).not.toEqual(b.why);
  });

  it("never turns an old resource into fresh news, and handles unknown dates", () => {
    const old = rankItem(saas, item({ title: "Next.js 9 released", kind: "release", publishedAt: daysAgo(2000) }), NOW);
    const unknown = rankItem(saas, item({ title: "Next.js 9 released", kind: "release", publishedAt: null }), NOW);
    if (!old.included || !unknown.included) throw new Error("expected included");
    expect(old.reasons.find((r) => r.factor === "freshness")?.points).toBe(0);
    expect(unknown.reasons.find((r) => r.factor === "freshness")?.label).toBe("Date de publication inconnue");
  });

  it("security info without verifiable version → « Applicabilité à vérifier »", () => {
    const sec = (title: string) => rankItem(saas, item({ title, kind: "security", source: { quality: 10, isOfficial: true, techKeys: ["nextjs"], name: "Blog Next.js" } }), NOW);
    const vague = sec("Security advisory for Next.js middleware");
    const precise = sec("Security fix for Next.js 16.1 and 15.5");
    expect(vague.included && vague.priority).toBe("verify");
    expect(precise.included && precise.priority).toBe("action");
  });

  it("treats considered technologies as discovery, not alerts", () => {
    const p = project({ techs: [{ key: "prisma", name: "Prisma", status: "considered", version: null }] });
    const r = rankItem(p, item({ title: "Prisma deprecates old engine", kind: "breaking" }), NOW);
    expect(r.included && r.priority).toBe("explore");
  });

  it("applies exclusions, dismissals, hidden sources and source feedback", () => {
    const it1 = item({ title: "Next.js payment tutorial", kind: "tutorial" });
    expect(rankItem({ ...saas, excludedTopics: ["payment"] }, it1, NOW).included).toBe(false);
    expect(rankItem({ ...saas, dismissedItemIds: new Set(["i1"]) }, it1, NOW).included).toBe(false);
    expect(rankItem({ ...saas, hiddenSourceIds: ["s1"] }, it1, NOW).included).toBe(false);
    const base = rankItem(saas, it1, NOW);
    const penalized = rankItem({ ...saas, sourcePenalties: new Map([["s1", 1]]) }, it1, NOW);
    if (!base.included || !penalized.included) throw new Error("expected included");
    expect(penalized.score).toBe(base.score - 10);
  });

  it("generates nothing for a paused project", () => {
    expect(rankItem({ ...saas, stage: "paused" }, item({ title: "Next.js 16.2" }), NOW).included).toBe(false);
  });
});

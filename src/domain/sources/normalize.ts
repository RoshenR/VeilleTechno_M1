import { createHash } from "node:crypto";
import { foldText } from "../technologies";

export const CONTENT_KINDS = ["release", "tutorial", "tool", "experience", "breaking", "security", "news"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];
export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  release: "Release",
  tutorial: "Tutoriel",
  tool: "Outil",
  experience: "Retour d’expérience",
  breaking: "Changement important",
  security: "Sécurité",
  news: "Actualité",
};
/** News decays fast; background resources are judged on usefulness before recency. */
export const isNewsKind = (k: ContentKind) => k === "release" || k === "breaking" || k === "security" || k === "news";

export type NormalizedItem = {
  externalId: string;
  canonicalUrl: string;
  title: string;
  excerpt: string | null;
  kind: ContentKind;
  isPrerelease: boolean;
  releaseTag: string | null;
  publishedAt: string | null;
  contentHash: string;
};

export const MAX_EXCERPT = 600;

const TRACKING_PARAMS = /^(utm_[a-z]+|ref|ref_src|fbclid|gclid|mc_cid|mc_eid|source)$/i;

/** Canonical URL for deduplication: https, lowercase host, no www/hash/tracking params, no trailing slash. */
export function canonicalUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.protocol = "https:";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.hash = "";
  u.port = "";
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  const s = u.toString();
  return u.pathname === "/" && !u.search ? s.replace(/\/$/, "") : s;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** HTML → short plain text. Only a bounded extract is kept, never the full article. */
export function toExcerpt(html: string | null | undefined, max = MAX_EXCERPT): string | null {
  if (!html) return null;
  const text = String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : text;
}

export function parseDate(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(v);
  const t = d.getTime();
  // Reject garbage and dates more than a day in the future.
  if (!Number.isFinite(t) || t > Date.now() + 86_400_000 || t < Date.UTC(1995, 0, 1)) return null;
  return d.toISOString();
}

const KIND_RULES: [ContentKind, RegExp][] = [
  ["security", /\b(security|vulnerabilit(y|ies)|cve-\d{4}|securite|patch(ed)? .*(exploit|vulnerab)|advisory)\b/],
  ["breaking", /\b(breaking changes?|deprecat\w*|end[- ]of[- ]life|eol|sunset(ting)?|removed support|migration guide)\b/],
  ["experience", /\b(how we|lessons learned|case study|postmortem|post-mortem|retour d.experience|our journey|in production at)\b/],
  ["tutorial", /\b(how to|tutorial|tutoriel|guide|step[- ]by[- ]step|getting started|learn|walkthrough|comment (faire|creer|utiliser|mettre))\b/],
  ["tool", /\b(introducing|announcing|launch(es|ed)?|now available|open[- ]sourc(e|ing)|new tool|outil)\b/],
  ["release", /\b(v?\d+\.\d+(\.\d+)?|release[sd]?|is out|version)\b/],
];

export function classifyKind(title: string, excerpt: string | null): ContentKind {
  const t = foldText(title);
  const e = foldText(excerpt ?? "").slice(0, 300);
  for (const [kind, re] of KIND_RULES) if (re.test(t)) return kind;
  // Only security/breaking are strong enough signals to be read from the excerpt.
  for (const [kind, re] of KIND_RULES.slice(0, 2)) if (re.test(e)) return kind;
  return "news";
}

export const hashContent = (...parts: (string | null)[]) =>
  createHash("sha256").update(parts.map((p) => p ?? "").join("\u0000")).digest("hex").slice(0, 32);

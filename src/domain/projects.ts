import { z } from "zod";
import { TECH_CATEGORIES } from "./technologies";

export const STAGES = ["idea", "prototype", "development", "production", "paused"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = {
  idea: "Idée",
  prototype: "Prototype",
  development: "Développement",
  production: "Production",
  paused: "En pause",
};

export const PROJECT_TYPES = ["website", "saas", "mobile", "api", "internal", "other"] as const;
export const PROJECT_TYPE_LABELS: Record<(typeof PROJECT_TYPES)[number], string> = {
  website: "Site web",
  saas: "SaaS",
  mobile: "Application mobile",
  api: "API",
  internal: "Outil interne",
  other: "Autre",
};

export const TECH_STATUSES = ["used", "considered", "exploring"] as const;
export type TechStatus = (typeof TECH_STATUSES)[number];
export const TECH_STATUS_LABELS: Record<TechStatus, string> = {
  used: "Utilisée",
  considered: "Envisagée",
  exploring: "À explorer",
};

// Followed needs/subjects. Keywords are folded (no accents, lowercase), FR + EN, matched on word boundaries.
export const FEATURES = {
  auth: { label: "Authentification", keywords: ["authentication", "authentification", "auth", "login", "oauth", "passkey", "passkeys", "sso", "magic link"] },
  payment: { label: "Paiement", keywords: ["payment", "payments", "paiement", "paiements", "billing", "checkout", "subscription billing", "recurring payments", "abonnement payant", "invoice", "invoicing", "facturation"] },
  realtime: { label: "Temps réel", keywords: ["realtime", "real-time", "temps reel", "websocket", "websockets", "live updates", "presence"] },
  search: { label: "Recherche", keywords: ["search", "full-text", "full text", "recherche", "indexing"] },
  accessibility: { label: "Accessibilité", keywords: ["accessibility", "accessibilite", "a11y", "wcag", "aria", "screen reader"] },
  seo: { label: "SEO", keywords: ["seo", "metadata", "sitemap", "referencement"] },
  performance: { label: "Performance", keywords: ["performance", "core web vitals", "lcp", "inp", "bundle size", "caching", "latency"] },
  testing: { label: "Tests", keywords: ["testing", "unit test", "unit tests", "e2e", "end-to-end", "test runner", "tests"] },
  deployment: { label: "Déploiement", keywords: ["deploy", "deployment", "deploiement", "hosting", "hebergement", "ci/cd", "self-host", "self-hosting"] },
  offline: { label: "Hors ligne", keywords: ["offline", "hors ligne", "local-first", "offline sync", "sync engine", "synchronisation", "service worker"] },
  security: { label: "Sécurité", keywords: ["security", "securite", "vulnerability", "vulnerabilite", "cve", "xss", "csrf"] },
  data: { label: "Données & base", keywords: ["database", "base de donnees", "migration", "migrations", "orm", "sql"] },
  ai: { label: "IA", keywords: ["llm", "ai sdk", "machine learning", "intelligence artificielle", "ai agent", "ai agents", "embeddings"] },
  mobile: { label: "Mobile", keywords: ["mobile", "ios", "android", "push notification", "push notifications"] },
} as const satisfies Record<string, { label: string; keywords: readonly string[] }>;
export type FeatureKey = keyof typeof FEATURES;
export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable().optional();

export const techInputSchema = z.object({
  tech_key: z.string().regex(/^[a-z0-9][a-z0-9.+-]{0,40}$/),
  display_name: z.string().trim().min(1).max(60),
  category: z.enum(TECH_CATEGORIES),
  status: z.enum(TECH_STATUSES),
  version: optionalText(30),
});
export type TechInput = z.infer<typeof techInputSchema>;

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(120),
  description: z.string().trim().min(1, "Une courte description est obligatoire.").max(2000),
  problem: optionalText(2000),
  audience: optionalText(500),
  project_type: z.enum(PROJECT_TYPES).default("other"),
  stage: z.enum(STAGES).default("idea"),
  features: z.array(z.enum(FEATURE_KEYS as [FeatureKey, ...FeatureKey[]])).max(20).default([]),
  constraints: optionalText(2000),
  notes: optionalText(10000),
});
export type ProjectInput = z.infer<typeof projectInputSchema>;

/** Fields that shape the personalised feed. Changing any of them bumps context_version. */
export const CONTEXT_FIELDS = ["name", "description", "problem", "audience", "project_type", "stage", "features", "constraints"] as const;

export function contextChanged(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  return CONTEXT_FIELDS.some((f) => JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null));
}

export const isActive = (p: { stage: string; archived_at: string | null }) => p.stage !== "paused" && !p.archived_at;

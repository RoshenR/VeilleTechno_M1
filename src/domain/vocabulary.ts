// Shared vocabulary, safe for client bundles (no Node or server-only imports).

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

export type Priority = "explore" | "watch" | "verify" | "action";
export const PRIORITY_LABELS: Record<Priority, string> = {
  explore: "À explorer",
  watch: "À surveiller",
  verify: "Applicabilité à vérifier",
  action: "Action prioritaire",
};

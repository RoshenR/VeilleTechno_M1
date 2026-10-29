import type { Priority } from "./ranking";
import type { ContentKind } from "./sources/normalize";

/**
 * Rule-based suggested action. Returns null when the information is useful without requiring action.
 * Never claims the project is broken or vulnerable: that needs the user's own verification.
 */
export function suggestedAction(priority: Priority, kind: ContentKind, techNames: string[], unknownVersionTechs: string[]): string | null {
  const techs = techNames.join(", ") || "la technologie concernée";
  const versionNote = unknownVersionTechs.length ? ` Renseigne d’abord la version de ${unknownVersionTechs.join(", ")} dans la stack.` : "";
  if (priority === "action") return `Lire la source officielle et vérifier les conditions indiquées, puis planifier la mise à jour de ${techs} si elles s’appliquent.`;
  if (priority === "verify") return `Vérifier dans la source si ta version de ${techs} et ta configuration sont concernées.${versionNote}`;
  if (priority === "watch" && kind === "release") return `Lire les notes de version avant toute mise à jour de ${techs}.${versionNote}`;
  return null;
}

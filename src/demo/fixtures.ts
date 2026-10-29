// Demo fixtures — fictional, in-memory only, never written to the database or mixed with production data.
// Libraries, posts and URLs are invented (example.com is a reserved domain) so no news is attributed to a real organisation.
import type { RankItem, RankProject } from "@/domain/ranking";

const DAY = 86_400_000;
const ago = (now: number, d: number) => new Date(now - d * DAY).toISOString();

export type DemoProject = { id: string; name: string; description: string; rank: RankProject };
export type DemoItem = RankItem & { url: string; releaseTag: string | null };

const base = { interests: [], excludedTopics: [], languages: ["fr", "en"], hiddenSourceIds: [], dismissedItemIds: new Set<string>(), sourcePenalties: new Map<string, number>() };

export const DEMO_PROJECTS: DemoProject[] = [
  {
    id: "demo-saas",
    name: "Démo — SaaS de réservation",
    description: "Prise de rendez-vous pour salons avec acompte en ligne. Next.js et PostgreSQL en production.",
    rank: { ...base, stage: "production", features: ["payment", "auth"], techs: [{ key: "nextjs", name: "Next.js", status: "used", version: "16.1" }, { key: "postgresql", name: "PostgreSQL", status: "used", version: null }] },
  },
  {
    id: "demo-mobile",
    name: "Démo — Liste de courses hors ligne",
    description: "Application mobile partagée qui doit fonctionner sans réseau. Expo envisagé.",
    rank: { ...base, stage: "prototype", features: ["offline", "mobile"], techs: [{ key: "expo", name: "Expo", status: "considered", version: null }] },
  },
  {
    id: "demo-courses",
    name: "Démo — Plateforme de cours (idée)",
    description: "Cours vidéo pour artisans avec abonnement mensuel. Aucune stack choisie.",
    rank: { ...base, stage: "idea", features: ["payment", "search"], techs: [] },
  },
];

const src = (name: string, techKeys: string[] = []) => ({ name, quality: 6, isOfficial: false, techKeys });

export function demoItems(now = Date.now()): DemoItem[] {
  return [
    {
      id: "d1", sourceId: "demo-src-1", url: "https://example.com/demo/kit-paiement-3", releaseTag: "v3.0.0",
      title: "kit-paiement-demo 3.0.0 : nouvelle API de remboursement partiel",
      excerpt: "Version majeure de la bibliothèque fictive kit-paiement-demo : remboursements partiels, acomptes et webhooks signés. Les anciennes méthodes sont conservées une version de plus.",
      kind: "release", isPrerelease: false, publishedAt: ago(now, 3), language: "fr", source: src("Releases démo"),
    },
    {
      id: "d2", sourceId: "demo-src-2", url: "https://example.com/demo/tutoriel-acompte-nextjs", releaseTag: null,
      title: "Tutoriel : encaisser un acompte de réservation dans une application Next.js",
      excerpt: "Pas à pas : créer une session de paiement, confirmer la réservation après le webhook, gérer l’annulation et le remboursement de l’acompte.",
      kind: "tutorial", isPrerelease: false, publishedAt: ago(now, 40), language: "fr", source: src("Blog démo"),
    },
    {
      id: "d3", sourceId: "demo-src-2", url: "https://example.com/demo/creneaux-postgresql", releaseTag: null,
      title: "Guide : modéliser des créneaux de réservation sans chevauchement dans PostgreSQL",
      excerpt: "Contraintes d’exclusion, types d’intervalles et index GiST pour empêcher deux réservations sur le même créneau. Ressource ancienne mais toujours d’actualité.",
      kind: "tutorial", isPrerelease: false, publishedAt: ago(now, 6 * 365), language: "fr", source: src("Blog démo"),
    },
    {
      id: "d4", sourceId: "demo-src-3", url: "https://example.com/demo/avis-securite-auth", releaseTag: null,
      title: "Avis de sécurité : contournement de session dans un module d’authentification pour Next.js",
      excerpt: "Un module communautaire fictif d’authentification présente une faille de validation de session. Les versions concernées ne sont pas précisées dans l’annonce.",
      kind: "security", isPrerelease: false, publishedAt: ago(now, 2), language: "fr", source: src("Bulletin démo", ["nextjs"]),
    },
    {
      id: "d5", sourceId: "demo-src-2", url: "https://example.com/demo/expo-local-first", releaseTag: null,
      title: "Comment synchroniser une app Expo hors ligne : stratégies local-first",
      excerpt: "File d’attente des modifications, résolution de conflits et stockage local : comparaison de trois approches pour une application qui doit fonctionner sans réseau.",
      kind: "tutorial", isPrerelease: false, publishedAt: ago(now, 120), language: "fr", source: src("Blog démo"),
    },
    {
      id: "d6", sourceId: "demo-src-2", url: "https://example.com/demo/comparatif-abonnements", releaseTag: null,
      title: "Comparatif : choisir une solution d’abonnement et de paiement pour une plateforme de cours",
      excerpt: "Critères pour comparer les solutions d’abonnement : frais, gestion des essais gratuits, facturation, conformité et recherche dans le catalogue de cours.",
      kind: "tutorial", isPrerelease: false, publishedAt: ago(now, 200), language: "fr", source: src("Blog démo"),
    },
    {
      id: "d7", sourceId: "demo-src-1", url: "https://example.com/demo/sdk-mobile-preview", releaseTag: "v2.0.0-beta.1",
      title: "Expo Router démo 2.0.0-beta.1",
      excerpt: null,
      kind: "release", isPrerelease: true, publishedAt: null, language: "en", source: src("Releases démo", ["expo"]),
    },
    {
      id: "d8", sourceId: "demo-src-2", url: "https://example.com/demo/seminaire", releaseTag: null,
      title: "Retour en images sur notre séminaire d’équipe",
      excerpt: "Une journée de randonnée et d’ateliers pour l’équipe de rédaction.",
      kind: "news", isPrerelease: false, publishedAt: ago(now, 1), language: "fr", source: src("Blog démo"),
    },
  ];
}

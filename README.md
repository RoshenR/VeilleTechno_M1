# StackSignal

> Transforme tes idées de projet en veille utile pour les concrétiser et les faire évoluer.

StackSignal propose, pour chaque projet décrit par l’utilisateur (objectifs, stack actuelle ou envisagée, stade, contraintes), une sélection d’actualités et de ressources collectées dans des sources publiques vérifiées. Chaque recommandation indique **ce qu’elle apporte**, **pourquoi elle concerne ce projet**, **ce qu’on pourrait en faire** et **la source qui permet de vérifier**.

Public : développeurs indépendants, freelances et étudiants qui mènent plusieurs projets.

---

## Sommaire

1. [Ce qui fonctionne](#ce-qui-fonctionne)
2. [Démarrage rapide (local)](#démarrage-rapide-local)
3. [Commandes](#commandes)
4. [Configuration des services](#configuration-des-services)
5. [Planification et hébergement](#planification-et-hébergement)
6. [Architecture](#architecture)
7. [Classement explicable](#classement-explicable)
8. [Sources et collecte](#sources-et-collecte)
9. [IA facultative](#ia-facultative)
10. [Confidentialité et sécurité](#confidentialité-et-sécurité)
11. [Mode démo](#mode-démo)
12. [Tests et vérifications réalisées](#tests-et-vérifications-réalisées)
13. [Hypothèses et décisions](#hypothèses-et-décisions)
14. [Limites connues](#limites-connues)
15. [Dépannage](#dépannage)
16. [Hors périmètre (versions suivantes)](#hors-périmètre-versions-suivantes)

---

## Ce qui fonctionne

- Comptes individuels (Supabase Auth) : inscription, connexion, déconnexion, mot de passe oublié / nouveau mot de passe.
- Projets privés multiples : création rapide (nom + description), stack facultative et structurée (statut utilisée / envisagée / à explorer, version, catégorie), stade, type, besoins suivis, contraintes, notes, archivage, suppression confirmée.
- Détection des technologies dans la description par catalogue d’alias (suggestions **à valider**, jamais ajoutées automatiquement). Suggestion IA en option.
- Collecte réelle RSS/Atom + GitHub Releases, catalogue de 28 sources vérifiées, ajout d’un dépôt public `owner/repo`.
- Moteur de classement déterministe, testé, expliqué critère par critère ; fonctionne sans IA.
- « Ma veille » : vue globale regroupée par contenu ou par projet, jusqu’à 5 prioritaires (jamais complétés artificiellement), actualités récentes et ressources de fond séparées, filtres (projet, technologie, type, source, date, lecture), tri pertinence/date, pagination, état de la collecte et sources en échec, actualisation manuelle limitée.
- Détail d’un contenu : faits vérifiables (source, dates de publication/collecte/vérification, tag, extrait), interprétation **séparée pour chaque projet**, action suggérée si justifiée, enrichissement IA facultatif.
- Favoris, lu/non lu, notes personnelles (par utilisateur) ; retours « Peu pertinent » avec motif et actions (par projet), réversibles.
- Enregistrés (favoris + liens manuels), Actions (statuts à étudier / à faire / terminé / abandonné), Paramètres (langues, intérêts, sujets exclus, sources masquées, état des services, IA).
- Mode démo isolé, thème clair/sombre, navigation clavier, mise en page mobile.

## Démarrage rapide (local)

Prérequis : Node.js ≥ 20.9, npm, Docker Desktop (pour Supabase local).

```bash
npm install
```

```bash
npx supabase start
```

Créer `.env.local` à partir de `.env.example` et y reporter `API_URL`, `PUBLISHABLE_KEY` et `SECRET_KEY` affichés par :

```bash
npx supabase status -o env
```

Collecter les sources réelles (≈ 10 s, 28 sources) :

```bash
npm run ingest
```

Lancer l’application puis ouvrir http://localhost:3000 :

```bash
npm run dev
```

En local, la confirmation d’e-mail est désactivée (`supabase/config.toml`) ; les e-mails (réinitialisation) sont visibles dans Mailpit : http://127.0.0.1:54324.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` / `npm start` | Build et serveur de production |
| `npm run typecheck` | Génère les types de routes Next puis `tsc --noEmit` (TypeScript strict) |
| `npm run lint` | ESLint (config Next) |
| `npm test` | Vitest : règles métier + intégration Supabase (ignorée si l’environnement Supabase est absent) |
| `npm run test:e2e` | Playwright (desktop + mobile) — nécessite Supabase local et du contenu collecté |
| `npm run ingest` | Collecte + recalcul des analyses, par lots, jusqu’à épuisement. `npm run ingest -- --force` rend toutes les sources dues (les requêtes restent conditionnelles) |
| `npm run db:types` | Régénère `src/lib/database.types.ts` depuis la base locale |

## Configuration des services

### Supabase (hébergé)

1. Créer un projet, puis appliquer les migrations : `npx supabase link --project-ref <ref>` puis `npx supabase db push`.
2. Renseigner `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
3. Authentication → URL Configuration : `Site URL` = URL de production ; ajouter `https://<domaine>/**` aux Redirect URLs.
4. Modèles d’e-mail : les liens doivent pointer vers `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>&next=<chemin>` (le gestionnaire accepte aussi le flux PKCE `?code=`).

### GitHub

`GITHUB_TOKEN` facultatif. Sans jeton, l’API publique autorise 60 requêtes/heure par IP : la première collecte (2 pages × 12 dépôts) peut dépasser ce quota ; les dépôts concernés sont reportés automatiquement (respect de `Retry-After`). Un jeton fine-grained **sans permission** suffit pour les dépôts publics.

### IA

Voir [IA facultative](#ia-facultative). Sans clé, l’application est complète.

## Planification et hébergement

Hébergement retenu : **Vercel** (Next.js) + **Supabase**.

- `vercel.json` déclare un cron quotidien (`0 5 * * *`) vers `GET /api/cron/ingest`. Vercel envoie automatiquement `Authorization: Bearer $CRON_SECRET` si la variable `CRON_SECRET` est définie dans le projet.
- Prérequis : variables d’environnement ci-dessus configurées sur Vercel ; `maxDuration = 300` s (défaut actuel des fonctions Vercel).
- Le point d’entrée refuse toute requête sans le bon secret (comparaison à temps constant) et répond `409` si une collecte est déjà en cours.

**Lots bornés et reprise.** Chaque appel traite les sources dues par lots de 4 et les projets par lots de 5, dans un budget de 240 s. La progression est stockée en base (`sources.next_fetch_at`, `projects.insights_refreshed_at`, `ingestion_runs`) : un appel suivant reprend où le précédent s’est arrêté (statut `partial`). Aucune dépendance à un processus en mémoire.
Avec ~30 sources, une passe dure ≈ 10 s : un cron quotidien suffit. Si le catalogue grossit, augmenter la fréquence du cron (plan Pro) ou appeler `npm run ingest` depuis un autre scheduler (GitHub Actions…).

**Concurrence.** Un index unique partiel sur `ingestion_runs (status = 'running')` sert de verrou ; un verrou dont le battement de cœur date de plus de 10 min est considéré comme abandonné.

**Mutualisation.** Une source publique est collectée une seule fois pour tous les comptes. La création d’un projet réutilise les contenus déjà collectés (aucune requête externe). L’ouverture d’un écran ne déclenche jamais de collecte. L’actualisation manuelle est limitée à une fois toutes les 10 minutes par utilisateur et ne recharge que les sources de l’utilisateur non collectées depuis 30 minutes.

## Architecture

```
src/
  domain/                 règles métier, sans UI (testées avec Vitest)
    technologies.ts       catalogue normalisé + alias non ambigus (= entité Technology)
    projects.ts           stades, types, besoins, schémas Zod, invalidation du contexte
    ranking.ts            moteur de classement déterministe
    insights.ts           recalcul des analyses d’un projet
    ingestion.ts          lots, verrou, reprise, stockage idempotent
    ai.ts                 fournisseur interchangeable, prompt, validation Zod des sorties
    suggestions.ts        action suggérée par règles
    sources/              catalog.ts, http.ts (timeout, taille, retries, conditionnel), rss.ts, github.ts, normalize.ts
  lib/supabase/           clients serveur (cookies) et service role
  lib/feed.ts             requêtes du flux (regroupement, filtres, pagination)
  app/(auth)/             inscription, connexion, récupération d’accès
  app/(app)/              écrans authentifiés + mutations.ts (server actions)
  app/api/cron/ingest     point d’entrée planifié
  app/demo                démonstration isolée
  demo/fixtures.ts        données fictives (jamais en base)
supabase/migrations/      schéma, contraintes, index, RLS
scripts/ingest.ts         collecte en ligne de commande
tests/integration/        Supabase réel : RLS, idempotence, invalidation
tests/e2e/                Playwright
```

Stack : Next.js 16 (App Router, TypeScript strict, `proxy.ts`), Tailwind CSS 4, shadcn/ui (base Base UI), Supabase (`@supabase/ssr`, PostgreSQL 17), Zod 4, fast-xml-parser, Vitest, Playwright.

Modèle de données (`supabase/migrations/20261029000000_init.sql`) : `profiles`, `preferences`, `sources`, `project_sources`, `content_items`, `projects`, `project_technologies`, `project_insights`, `user_content_state`, `project_feedback`, `project_resources`, `project_actions`, `ingestion_runs`. L’entité *Technology* est le catalogue versionné `src/domain/technologies.ts` (les technologies hors catalogue sont acceptées dans `project_technologies`).

## Classement explicable

Score interne 0–100 par couple projet/contenu (jamais affiché en pourcentage) :

| Facteur | Bornes avec stack | Sans stack | Règle |
| --- | --- | --- | --- |
| Technologies | 0–40 | 0 | Alias dans le titre (×1) ou l’extrait / source dédiée (×0,75), pondéré par le statut (utilisée 1, envisagée 0,6, à explorer 0,5) ; +5 par technologie supplémentaire |
| Besoins | 0–25 | 0–45 | Mots-clés FR/EN des besoins suivis (72 % au premier, 100 % à partir de deux) ; intérêts du compte : bonus ≤ 20 % |
| Stade | 0–15 | 0–35 | Adéquation type de contenu / stade (idée → conception, comparatifs ; développement → docs, intégrations ; production → compatibilité, dépréciations, sécurité). Préversion : ×0,6 (×0,3 en production) |
| Source | 0–10 | 0–10 | Officielle = 10, sinon qualité déclarée |
| Fraîcheur | 0–10 | 0–10 | Actualités : ≤7 j = 10, ≤30 j = 7, ≤90 j = 4, ≤1 an = 1, sinon 0. Ressources de fond : ≤2 ans = 8, sinon 5. Date inconnue = 2 |
| Retour « mauvaise source » | −10 par retour, max −20 | idem | Baisse la source pour ce projet sans la masquer |

- **Inclusion** : correspondance de technologie **ou** de besoin obligatoire, puis score ≥ 30. La fraîcheur ou la qualité seules ne suffisent jamais.
- **Exclusions** : projet en pause/archivé, retour « Peu pertinent » (mauvais sujet / niveau / déjà connu masquent ce contenu pour ce projet), source masquée, langue non choisie, sujet exclu.
- **Priorité** (distincte de la certitude) : *Action prioritaire* seulement si sécurité/changement important sur une technologie **utilisée**, en développement ou production, source officielle **et** version majeure déclarée retrouvée dans le texte ; sinon *Applicabilité à vérifier*. *À surveiller* : release/actualité sur une technologie utilisée (score ≥ 50). *À explorer* : le reste, et toujours pour les technologies envisagées (découverte, pas alerte).
- **Prioritaires** : 5 au plus, non lus, score ≥ 65, hors préversions — la section disparaît s’il n’y en a pas.
- Les phrases « Pourquoi pour ce projet ? » et la liste « Critères appliqués » sont générées à partir des mêmes facteurs que le score.

## Sources et collecte

Catalogue vérifié le 2026-10-29 (`src/domain/sources/catalog.ts`) : 16 flux RSS/Atom (Next.js, React, Supabase, GitHub Changelog, Node.js, PostgreSQL, TypeScript, Tailwind CSS, Expo changelog, Stripe, Deno, Cloudflare, MDN, web.dev, Smashing Magazine, Alsacréations en français) et 12 dépôts GitHub (next.js, react, supabase-js, expo, stripe-node, prisma, drizzle-orm, tailwindcss, playwright, vitest, zod, node).

Écartés lors de la vérification :
- `https://vercel.com/atom` : valide mais 4,6 Mo, au-delà de la taille maximale acceptée (3 Mo).
- `https://playwright.dev/blog/rss.xml` : 404.
- `facebook/react` et `prisma/prisma` ont été renommés (`react/react`, `prisma/orm`) : le catalogue utilise les noms actuels.

Connecteurs (`src/domain/sources/`) :
- délai de 15 s, 3 tentatives max (erreurs réseau et 5xx), pas de nouvelle tentative sur 429/403 (respect de `Retry-After`), taille max 3 Mo lue en flux, hôte final vérifié (GitHub : `api.github.com` uniquement), requêtes conditionnelles `ETag` / `Last-Modified`, 50 éléments max par flux, 2 pages max de 30 releases à la première collecte ;
- RSS 2.0, RSS 1.0 (RDF) et Atom ; dates invalides ou futures rejetées (→ « Date inconnue ») ; extrait texte borné à 600 caractères — l’article complet n’est jamais recopié ;
- releases : brouillons ignorés, préversions détectées (`prerelease` ou tag `-alpha/-beta/-rc/-canary/…`) ;
- déduplication : `unique (source_id, external_id)` + `unique (canonical_url)` (https, sans `www`, sans fragment ni paramètres de suivi, paramètres triés). Pas de fusion par similarité de titre ;
- `published_at`, `collected_at` (première collecte) et `last_seen_at` (dernière vérification) sont distincts : une vieille ressource collectée tard garde sa date réelle ;
- échec d’une source : erreur enregistrée, reprise avec backoff exponentiel (30 min → 24 h) ; les autres sources continuent.

L’application couvre uniquement ces sources : elle ne prétend pas surveiller tout le web. L’ajout de flux arbitraires est volontairement hors périmètre ; seul l’ajout d’un dépôt GitHub public est proposé.

## IA facultative

- Fournisseur interchangeable côté serveur (`AiProvider`) : Anthropic (Messages API) ou tout service compatible OpenAI (`AI_PROVIDER=openai-compatible`, `AI_BASE_URL`).
- Désactivé par défaut pour chaque compte (Paramètres). Déclenché à la demande, uniquement pour les contenus de score ≥ 50, avec un budget quotidien par utilisateur (`AI_DAILY_BUDGET_PER_USER`). Résultat mis en cache dans `project_insights.ai` avec la version de contexte et l’empreinte du contenu : il est ignoré (et signalé) dès que l’un des deux change.
- Données transmises : titre, extrait, type, source et date du contenu ; stade, type, besoins, stack et contraintes du projet. **Jamais** les notes ni les données de compte.
- Le contenu est encadré comme donnée non fiable ; la sortie JSON est validée par Zod ; les citations doivent exister mot pour mot dans le titre/l’extrait et référencer l’identifiant fourni, sinon elles sont retirées ; sans citation valide, les « faits » deviennent des « inférences » ; sans extrait, aucun résumé n’est accepté. Les liens affichés viennent toujours de la base.
- Sans clé, en cas d’erreur ou de quota : collecte, classement, favoris et actions fonctionnent ; les explications viennent des règles.

## Confidentialité et sécurité

- RLS activée sur toutes les tables. Contenus publics (`sources`, `content_items`, `ingestion_runs`) : lecture seule pour les comptes authentifiés, écriture réservée à la clé de service. Données privées : propriétaire uniquement, y compris via les tables enfants (`owns_project()`), avec `with check` qui empêche l’usurpation d’`owner_id` / `user_id`. Le rôle `anon` n’a aucun accès.
- Les server actions utilisent le client de l’utilisateur (RLS) ; la clé de service n’est utilisée que pour le catalogue public, après vérification de propriété.
- L’identité est vérifiée par `getClaims()` (signature du JWT), jamais par `getSession()` côté serveur.
- Cache Components de Next.js désactivé : toutes les pages sont rendues par requête, rien de privé ne passe par un cache partagé. Les logs ne contiennent ni contenu privé ni secret.
- Supprimer un projet supprime en cascade sa stack, ses abonnements, analyses, retours, ressources et actions, sans toucher aux contenus publics.
- Les liens manuels sont stockés tels quels (http/https uniquement), sans récupération automatique.
- Cette veille n’est pas un audit de sécurité : une information de sécurité ou une version majeure n’implique pas qu’un projet soit vulnérable ou cassé.

## Mode démo

`/demo`, accessible sans compte : 3 projets fictifs (SaaS de réservation Next.js/PostgreSQL avec paiement, app mobile Expo hors ligne, idée de plateforme de cours sans stack) et 8 contenus fictifs classés **en mémoire** par le vrai moteur. Chaque élément porte « Donnée de démonstration » ; les bibliothèques et URL sont inventées (`example.com`) pour n’attribuer aucune fausse actualité à une organisation réelle. Les fixtures ne sont jamais écrites en base. Le jeu illustre : release, tutoriel, ressource ancienne utile, contenu non retenu, applicabilité à vérifier, préversion avec titre seul et date inconnue, même contenu expliqué différemment selon le projet.

## Tests et vérifications réalisées

Exécuté le 2026-10-29 sur Windows 11, Node 23.6, Supabase CLI local (PostgreSQL 17) :

| Vérification | Résultat |
| --- | --- |
| `npm run typecheck` | OK |
| `npm run lint` | OK, 0 avertissement |
| `npm test` — unitaires (30) | OK : classement avec/sans stack, alias ambigus, fraîcheur et date inconnue, priorités sécurité, exclusions et retours, parsing RSS/Atom, normalisation d’URL, validation `owner/repo`, préversions, requêtes conditionnelles, taille max, retries, rate limit, validation des sorties IA |
| `npm test` — intégration Supabase (6) | OK : idempotence et déduplication, catalogue public non modifiable, isolation entre deux comptes (lecture, écriture, tables enfants, usurpation `user_id`/`owner_id`), accès anonyme nul, invalidation du contexte avec conservation des favoris/notes, suppression en cascade sans perte de contenu public |
| `npm run test:e2e` (6, Chromium desktop + Pixel 7) | OK : inscription → projet → veille → favori → action → retour réversible, persistance après rechargement ; projet sans stack ; URL d’un projet d’un autre compte → 404 ; lien d’évitement et focus visible ; démo et écrans sans débordement horizontal en mobile |
| `npm run build` | OK |
| Collecte réelle (`npm run ingest`) | 28/28 sources, 1 219 contenus ; seconde collecte forcée : 0 doublon (6 dépôts GitHub reportés pour quota non authentifié dépassé, comportement attendu) |
| Cron | 401 sans secret ou secret faux ; 200 avec secret ; deux appels simultanés → l’un `409 busy` |
| Navigateur | création de projet, détection de stack, flux réel, modification de version → contexte v2 et recalcul ; démo en thème sombre et clair |

Non vérifié : enrichissement IA avec un vrai fournisseur (aucune clé fournie ; testé avec un fournisseur simulé), envoi réel d’e-mails hors Mailpit, déploiement Vercel, audit d’accessibilité outillé complet (axe/Lighthouse).

## Hypothèses et décisions

- Dépôt vide → projet initialisé avec la stack demandée, versions stables du 2026-10-29 (Next 16.4, React 19.3, Zod 4, Tailwind 4).
- Abonnements aux sources **par projet** (`project_sources`), gérés dans l’onglet Stack ; masquage de source au niveau du compte (Paramètres).
- À la création, un projet suit les sources générales (MDN, web.dev, Smashing, Alsacréations) et celles liées à ses technologies.
- Les technologies validées depuis les suggestions sont ajoutées comme « envisagées » : aucun choix technique n’est modifié automatiquement.
- Les notes personnelles ne modifient jamais le contexte (pas de recalcul, pas d’envoi IA).
- Pagination/regroupement du flux en mémoire sur les 800 meilleures analyses (marqué `ponytail:` dans le code) : suffisant en V1.
- Démo en lecture seule (aucune action d’écriture affichée).

## Limites connues

- Classification du type de contenu par mots-clés (titre, extrait) : imparfaite, notamment pour les articles éditoriaux.
- Correspondance des besoins par mots-clés FR/EN : pas de compréhension sémantique (recherche vectorielle hors périmètre).
- Le quota GitHub non authentifié retarde la collecte des releases sans `GITHUB_TOKEN`.
- Les nouveaux contenus n’entrent dans les analyses existantes qu’au passage du scheduler ou lors d’une actualisation manuelle.
- `revalidatePath` est utilisé largement après chaque mutation : simple mais pas optimal.

## Dépannage

| Symptôme | Piste |
| --- | --- |
| « NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY sont requis » | `.env.local` incomplet ; voir `npx supabase status -o env`. |
| `npx supabase start` échoue | Docker Desktop doit être démarré. |
| Flux vide après création d’un projet | Lancer `npm run ingest`, vérifier les sources suivies (onglet Stack) et les filtres. |
| Releases GitHub absentes, erreur « Limite de débit » | Définir `GITHUB_TOKEN` ; la reprise est automatique. |
| Lien d’e-mail « invalide ou expiré » | Vérifier `NEXT_PUBLIC_SITE_URL`, les Redirect URLs Supabase et le modèle d’e-mail (`token_hash`). |
| Cron renvoie 401 | `CRON_SECRET` absent ou différent entre Vercel et l’appelant. |
| Cron renvoie 409 | Une collecte est déjà en cours ; un verrou bloqué expire après 10 min. |
| Bouton IA absent | `AI_API_KEY` non défini, IA désactivée dans Paramètres, ou contenu de score < 50. |
| Types Supabase désynchronisés après une migration | `npm run db:types`. |

## Hors périmètre (versions suivantes)

Collaboration et espaces partagés, facturation, application mobile native, import de dépôts privés, analyse complète des dépendances, chatbot généraliste, recherche vectorielle, newsletters par e-mail, intégrations de gestion de projet, ajout de flux RSS arbitraires.

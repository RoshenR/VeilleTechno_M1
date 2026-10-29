# StackSignal

> Transforme tes idées de projet en veille utile pour les concrétiser et les faire évoluer.

StackSignal propose, pour chaque projet décrit par l’utilisateur (objectifs, stack actuelle ou envisagée, stade, contraintes), une sélection d’actualités et de ressources collectées dans des sources publiques vérifiées, et compare les dépendances importées aux avis de sécurité connus. Chaque recommandation indique **ce qu’elle apporte**, **pourquoi elle concerne ce projet**, **ce qu’on pourrait en faire** et **la source qui permet de vérifier**.

Public : développeurs indépendants, freelances et étudiants qui mènent plusieurs projets.

---

## Sommaire

1. [Ce qui fonctionne](#ce-qui-fonctionne)
2. [Démarrage rapide (local)](#démarrage-rapide-local)
3. [Commandes](#commandes)
4. [Configuration des services](#configuration-des-services) — Supabase, **jeton GitHub**, exploitation, IA
5. [Planification, collecte et exploitation](#planification-collecte-et-exploitation)
6. [Architecture](#architecture)
7. [Flux : filtres, recherche et pagination](#flux--filtres-recherche-et-pagination)
8. [Classement explicable et retours](#classement-explicable-et-retours)
9. [Sécurité des dépendances](#sécurité-des-dépendances)
10. [Sources, sources francophones et propositions](#sources-sources-francophones-et-propositions)
11. [Interface : design system, 3D, interactions](#interface--design-system-3d-interactions)
12. [IA facultative](#ia-facultative)
13. [Confidentialité et sécurité](#confidentialité-et-sécurité)
14. [Tests, CI et vérifications réalisées](#tests-ci-et-vérifications-réalisées)
15. [Mesures de performance](#mesures-de-performance)
16. [Limites connues et fonctionnalités reportées](#limites-connues-et-fonctionnalités-reportées)
17. [Dépannage](#dépannage)

---

## Ce qui fonctionne

- Comptes individuels (Supabase Auth), projets privés multiples (stack facultative et structurée, stade, besoins, contraintes, notes, archivage).
- Collecte réelle RSS/Atom + GitHub Releases (30 sources vérifiées dont 3 francophones), ajout d’un dépôt public `owner/repo`, client GitHub centralisé (quotas, `Retry-After`, reprise persistée).
- **Ma veille** : bandeau « À retenir » (jusqu’à 3 éléments réels) avec radar 3D décoratif, recherche, filtres groupés avec puces actives, sections **Actualités / Sécurité / Ressources de fond**, pagination par curseur en SQL, détail en panneau latéral.
- **Peu pertinent** avec 5 raisons facultatives, effets bornés par projet, préférences apprises consultables et réinitialisables.
- **Sécurité** : import `package.json` / `package-lock.json` v2-v3 (analysé dans le navigateur), aperçu avant remplacement, instantanés datés, comparaison semver déterministe avec les GitHub Advisories *reviewed* (npm), historique des conclusions.
- **Synthèse de la semaine** filtrable par projet ; **proposition de sources** avec modération restreinte.
- Interactions immédiates (enregistrer, lu, retours) avec retour arrière et « Annuler » ; palette **Ctrl/Cmd + K**, aide des raccourcis (`?`), Échap partout.
- Thèmes clair/sombre, réglage « Effets visuels », respect de `prefers-reduced-motion`, navigation mobile dédiée.

## Démarrage rapide (local)

Prérequis : Node.js ≥ 20.9, npm, Docker Desktop.

```bash
npm install
```

```bash
npx supabase start
```

Créer `.env.local` depuis `.env.example` avec `API_URL`, `PUBLISHABLE_KEY`, `SECRET_KEY` de :

```bash
npx supabase status -o env
```

Collecter, puis (facultatif) créer un compte de revue local avec deux projets :

```bash
npm run ingest
```

```bash
npm run seed:local
```

```bash
npm run dev
```

> ⚠️ `next build` / `next start` chargent `.env.production.local` s’il existe (par exemple après `vercel env pull`). Les scripts `ingest`, `github:check` et `seed:local` n’utilisent que `.env.local` sauf `NODE_ENV=production` explicite, et `seed:local` refuse toute base non locale.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` / `npm start` | Build et serveur de production |
| `npm run typecheck` | Types de routes Next + `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest : unitaires + intégration Supabase (ignorée sans environnement local) |
| `npm run test:e2e` | Playwright (desktop + Pixel 7), Supabase local et contenu collecté requis |
| `npm run ingest` | Collecte + recalculs + avis de sécurité, par lots. `-- --force` rend toutes les sources dues |
| `npm run github:check` | Vérifie le jeton GitHub via `/rate_limit` (ne consomme pas le quota principal) et affiche les en-têtes de quota, jamais le jeton |
| `npm run seed:local` | Compte de revue local (`revue@stacksignal.test`), refuse une base non locale |
| `npm run db:types` | Régénère `src/lib/database.types.ts` |

## Configuration des services

### Supabase (hébergé)

1. Appliquer les migrations : `npx supabase link --project-ref <ref>` puis `npx supabase db push`. La migration `20261030000000_v2_reliability_security.sql` est **non destructive** (ajouts de tables, colonnes, index, fonctions ; seule la contrainte `project_feedback.reason` est élargie).
2. Variables : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
3. Auth → URL Configuration : Site URL et Redirect URLs `https://<domaine>/**` ; liens d’e-mail vers `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>&next=<chemin>`.

### Jeton GitHub (`GITHUB_TOKEN`) — **non configuré en production à ce jour**

Constat : `GITHUB_TOKEN` est absent de `.env.local` et des variables de production Vercel. Sans jeton, l’API GitHub limite à 60 requêtes/heure **par IP** (partagée sur Vercel) : releases et avis de sécurité sont alors reportés.

1. GitHub → Settings → Developer settings → **Fine-grained personal access token** : *Repository access* = « Public repositories (read-only) », **aucune** permission de dépôt ni de compte. Expiration courte (90 jours) et rappel de rotation. Suffit pour `GET /repos/{owner}/{repo}/releases` et `GET /advisories`.
2. Vercel → Project → Settings → Environment Variables : `GITHUB_TOKEN` (type *Sensitive*), environnements **Production** (et Preview si souhaité). Jamais de préfixe `NEXT_PUBLIC_`, jamais commité, jamais affiché dans les logs (le client ne l’envoie qu’à `api.github.com`).
3. **Redéployer** : les variables ne s’appliquent qu’aux nouveaux déploiements.
4. Vérifier : `npm run github:check` (avec la variable en local) doit afficher « Appel authentifié : oui » et un quota de 5 000. En production, la page Paramètres → Services indique si le jeton est présent.

Ce secret de déploiement est distinct du `GITHUB_TOKEN` éphémère que GitHub Actions injecte dans les workflows (la CI n’en a pas besoin et n’appelle pas l’API).

### Exploitation (facultatif)

| Variable | Effet |
| --- | --- |
| `OPS_ALERT_WEBHOOK_URL` | Webhook entrant (Slack/Mattermost/Teams `{text}`, Discord `{content}`) : alerte après 3 collectes planifiées consécutives en échec ou incomplètes, au plus une fois par 12 h (table `ops_alerts`), effacée au retour à la normale. |
| `OPS_HEARTBEAT_URL` | URL pinguée après chaque collecte réussie (healthchecks.io, Better Stack…) : le service externe alerte quand les pings cessent — y compris si la tâche planifiée ne démarre jamais. |
| Variable de dépôt GitHub `HEALTHCHECK_URL` | Active `.github/workflows/monitor.yml` (toutes les 6 h) qui interroge `https://<domaine>/api/health/ingestion` ; un échec est notifié par GitHub. |

Sans ces variables, **aucune surveillance n’est active** : le raccordement est livré, il reste à le configurer.

### IA

Voir [IA facultative](#ia-facultative). Sans clé, l’application est complète.

## Planification, collecte et exploitation

- Vercel Cron quotidien (`vercel.json`, `0 5 * * *`) → `GET /api/cron/ingest`, protégé par `CRON_SECRET` (comparaison à temps constant), `409` si une collecte tourne déjà.
- **Lots bornés et reprise** : sources par lots de 4, projets par lots de 5, budget 240 s ; la progression est en base (`sources.next_fetch_at`, `projects.insights_refreshed_at`, `ingestion_runs`), un appel suivant reprend (statut `partial`). Verrou : index unique partiel sur `ingestion_runs (status = 'running')`, repris si le battement de cœur a plus de 10 min. Stockage idempotent (`unique (source_id, external_id)` + `unique (canonical_url)`).
- **Historique** : chaque exécution enregistre début, fin, statut, sources traitées / en échec / **reportées pour quota**, nouveaux contenus, projets recalculés, **avis mis à jour** et erreurs utiles.
- **Client GitHub centralisé** (`src/domain/sources/github.ts`) : hôte fixe, requêtes sérialisées et espacées (250 ms), en-têtes de quota capturés, pagination par `Link`, cache conditionnel `ETag`. Classification (`classifyDenied`) : `401` → jeton invalide/expiré ; `403/429` + `x-ratelimit-remaining: 0` → quota principal (attente jusqu’à `x-ratelimit-reset`) ; `Retry-After` ou message « secondary rate limit » → limite secondaire (≥ 60 s) ; autre `403` → permission. Un quota atteint **reporte toutes les sources GitHub** jusqu’à la réinitialisation, persistée (`ops_state.github_block`, `sources.next_fetch_at`, `last_error_kind`), sans compter d’échec.
- **Recalculs ciblés** : `projects.ranking_signature` = empreinte des règles de classement, du catalogue de technologies/alias et du catalogue de sources. Le planificateur recalcule en arrière-plan les projets dont la signature diffère, en plus de ceux dont le flux a changé ; changement de contexte, de stack ou de retour → recalcul immédiat du projet. Favoris, notes et actions ne sont jamais touchés.
- **Interface** : seule la fraîcheur (« Données du … ») et les sources momentanément indisponibles ou reportées sont affichées ; les diagnostics détaillés restent dans `ingestion_runs`, les journaux et `/api/health/ingestion` (renvoie uniquement `healthy` + date du dernier succès ; `503` au-delà de 36 h).

## Architecture

```
src/
  domain/                  règles métier sans UI (testées)
    vocabulary.ts          types et libellés partagés, sûrs côté client
    ranking.ts             classement déterministe + bornes des retours
    insights.ts            recalcul par projet, signature, ajustements de retours
    ingestion.ts           lots, verrou, reprise, quotas, avis, alertes
    ops.ts                 état d’exploitation, alertes dédupliquées, heartbeat, dernier succès
    dependencies.ts        import package.json / package-lock (pur, exécuté dans le navigateur)
    advisory-match.ts      comparaison semver déterministe
    security.ts            instantanés, constats, synchronisation des avis
    sources/               catalog, http (classification des erreurs), github (client centralisé), rss, safe-fetch (SSRF)
  lib/feed.ts              flux via fonctions SQL (curseur)
  components/              design system, panneau, palette, radar 3D, onglet sécurité…
  app/(app)/@panel/        route interceptée : détail en panneau latéral
  app/(app)/synthese       synthèse hebdomadaire
  app/(app)/moderation     modération des propositions (admins)
  app/api/health/ingestion surveillance du dernier succès
supabase/migrations/       init + v2 (non destructive)
.github/workflows/         ci.yml, monitor.yml
```

## Flux : filtres, recherche et pagination

- `feed_items(...)` (SQL, `security invoker` → RLS) regroupe les analyses par contenu et applique **dans la base** projet, technologie, type, source, période, lecture et recherche (`ILIKE` échappé, index trigrammes `pg_trgm` sur titre et extrait).
- `feed_page(...)` : pagination **keyset** sur `(score, date, id)` (pertinence) ou `(date, id)` ; `id` départage les égalités. Aucun chargement de tout le flux dans le navigateur ; 15 éléments par page.
- **Changement de classement entre pages** : le curseur embarque la version de classement (dernier recalcul des projets concernés). Si elle a changé, un bandeau l’indique et propose « Revenir au début » (stratégie explicite plutôt qu’un mélange silencieux).
- Retour depuis un détail : le détail s’ouvre dans un panneau (route interceptée) au-dessus de la liste ; fermer revient en arrière dans l’historique → filtres, projet sélectionné, position de lecture et focus conservés.

## Classement explicable et retours

Score interne 0–100 par couple projet/contenu (jamais affiché en pourcentage) :

| Facteur | Avec stack | Sans stack | Règle |
| --- | --- | --- | --- |
| Technologies | 0–40 | 0 | Alias dans le titre (×1) ou l’extrait / source dédiée (×0,75), pondéré par le statut ; +5 par technologie supplémentaire |
| Besoins | 0–25 | 0–45 | Mots-clés FR/EN des besoins (72 % puis 100 %) ; intérêts : bonus ≤ 20 % |
| Stade | 0–15 | 0–35 | Adéquation type de contenu / stade ; préversion ×0,6 (×0,3 en production) |
| Source | 0–10 | 0–10 | Officielle = 10, sinon qualité déclarée |
| Fraîcheur | 0–10 | 0–10 | Actualités : 10 → 0 selon l’âge ; ressources de fond : 8 / 5 ; date inconnue = 2 |
| Retours (ce projet seulement) | −24 max | idem | Voir ci-dessous |

**« Peu pertinent »** (raisons facultatives), enregistré au niveau **projet + contenu** avec un instantané des technologies et de la source concernées :

| Raison | Effet (borné, réversible) |
| --- | --- |
| Mauvais sujet | Retire le contenu de ce projet ; −4 par retour sur la technologie concernée, **plafond −8** |
| Mauvais niveau technique | Retire le contenu ; −3 par retour sur ce type de contenu, plafond −6 |
| Déjà connu | Retire le contenu et le marque **lu** pour l’utilisateur ; **aucun effet sur le sujet** |
| Mauvaise source | −10 par retour sur la source pour ce projet, plafond −20, sans la masquer |
| Pas utile pour ce projet / sans préciser | Retire le contenu de **ce projet uniquement** |

Total des pénalités plafonné à −24 : un ou plusieurs clics ne peuvent pas exclure une technologie. Les ajustements apparaissent dans « Critères appliqués » et dans « Pourquoi pour ce projet ? » (« rang abaissé d’après tes retours »), consultables et réinitialisables dans la vue d’ensemble du projet (« Préférences apprises »). Langue : un contenu hors des langues choisies est exclu **sauf** annonce officielle de sécurité ou de changement important. Les préférences de lecture n’altèrent jamais une comparaison de sécurité.

Jeu d’évaluation : `src/domain/relevance.eval.test.ts` (8 cas représentatifs : sécurité officielle vs tutoriel, projet sans stack, technologie envisagée, bornes des retours, « déjà connu », isolation par projet, langue, fraîcheur seule). Embeddings et recherche vectorielle reportés faute de besoin mesuré.

## Sécurité des dépendances

> L’application **compare des dépendances décrites dans un import** à des avis connus. Elle n’audite ni le code exécuté ni le déploiement.

**Formats pris en charge**

| Fichier | Contenu exploité |
| --- | --- |
| `package.json` | `dependencies` (production), `devDependencies`, `optionalDependencies`, `peerDependencies` — plages et versions exactes **déclarées** |
| `package-lock.json` `lockfileVersion` 2 ou 3 | Section `packages` : versions **résolues**, dépendances directes et transitives, plusieurs versions d’un même package, contexte `dev`/`optional`/`peer` quand le lockfile l’établit |

Refusés avec un message clair : lockfile v1, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock`, JSON sans dépendances, fichiers > 10 Mo, > 10 000 entrées.

**Classification** : version exacte déclarée, plage déclarée (`^2.3.0`), version résolue, alias npm, workspace / lien, dépendance locale (`file:`), URL Git, URL d’archive, étiquette (`latest`), non résolue. Aucune version n’est devinée.

**Traitement** : le fichier est lu **dans le navigateur** ; seuls nom, version, déclaration réduite, portée et caractère direct sont envoyés au serveur, re-validés (Zod) puis stockés. Jamais conservés : scripts, `resolved`, `integrity`, identifiants ou paramètres d’URL. Rien n’est installé ni exécuté ; le fichier brut n’est jamais transmis à un LLM. Un aperçu (entrées, ajouts/retraits, versions changées, noms transmis) précède chaque import ; chaque import crée un **instantané daté** et conserve les précédents.

**Avis** : GitHub Global Security Advisories, `type=reviewed`, `ecosystem=npm` (couverture affichée). Transmis à GitHub : **uniquement des noms de packages npm** (paramètre `affects`), jamais les versions, le nom ou la description du projet ; exclusions possibles (`@mon-org/*`) ; dépendances locales, workspaces et Git jamais transmises. Pagination par curseur `Link`, requête séparée `is_withdrawn=true`. Le planificateur re-vérifie quotidiennement les packages suivis avec `modified>=…`, met à jour les avis modifiés ou retirés et recalcule le dernier instantané des projets concernés ; les anciennes conclusions sont **conservées** (`superseded_at`).

**Comparaison** (`advisory-match.ts`, bibliothèque `semver`, testée) : plages GitHub converties (`>= 1.0.0, < 1.2.3` → `>=1.0.0 <1.2.3`), préversions comparées de façon conservatrice. L’IA n’intervient pas.

| État affiché | Signification |
| --- | --- |
| Version importée dans la plage affectée | Risque à examiner — ne démontre pas que les conditions d’exploitation sont réunies |
| Version importée hors de la plage de cet avis | Pour cet avis seulement |
| Version exacte inconnue — à vérifier | Plage déclarée chevauchant la plage affectée, ou dépendance Git/locale/étiquette |
| Analyse indisponible ou incomplète | Quota/erreur GitHub, plage illisible, ou packages non vérifiés |
| Avis retiré | Avis retiré par sa source (conservé pour l’historique) |

L’onglet **Sécurité** du projet présente instantané, date et couverture, packages concernés (regroupés), versions corrigées documentées **par branche** (même majeure ou changement de majeure à vérifier), liens vers l’avis et création d’une tâche de vérification. Aucune mise à jour automatique, pas de recommandation systématique de la dernière majeure. Masquer une alerte exige une raison et elle reste consultable. L’absence de correspondance ne signifie pas que le projet est sécurisé.

## Sources, sources francophones et propositions

Catalogue (`src/domain/sources/catalog.ts`) : 18 flux RSS/Atom et 12 dépôts GitHub. Sources francophones ajoutées après vérification le 2026-10-29 (HTTP 200, flux valide, publications récentes, adéquation aux technologies) :

- **CERT-FR — avis de sécurité** (`https://cert.cyber.gouv.fr/avis/feed/`, officiel ; l’ancienne URL `cert.ssi.gouv.fr` redirige). Retenu uniquement quand un avis cite une technologie de la stack.
- **OCTO Talks** (`https://blog.octo.com/feed/`), architecture et pratiques de développement.

Écartés : LinuxFr (trop généraliste), Journal du hacker (agrégateur de qualité inégale), blog Zenika (langues mélangées), Grafikart et les-enovateurs (flux 404). Le classifieur reconnaît désormais « vulnérabilité(s) ».

**Proposer une source** (Paramètres) : URL https, langue, sujets, justification ; contrôles statiques uniquement, **aucune requête ni collecte** à la soumission, 5 propositions en attente maximum. L’auteur voit le statut (en attente / acceptée / refusée) et le retour.

**Modération** (`/moderation`) : réservée aux membres de `app_admins` (vérifié côté serveur et par RLS). Ajouter un modérateur :

```sql
insert into public.app_admins (user_id) select id from auth.users where email = 'moderateur@exemple.fr';
```

« Vérifier le flux » passe par `safeFetchText` : https et port 443 uniquement, pas d’identifiants dans l’URL, noms internes refusés, **chaque adresse résolue contrôlée au moment de la connexion** (privées, loopback, link-local dont `169.254.169.254`, CGNAT, ULA, multicast…), redirections suivies manuellement et re-validées (3 max), 10 s, 2 Mo ; le XML est refusé s’il déclare des entités. Accepter enregistre la décision ; l’ajout au catalogue partagé reste une modification revue de `catalog.ts`.

## Interface : design system, 3D, interactions

- **Tokens** (`src/app/globals.css`) : fonds, surfaces (`surface`, `surface-raised`), texte, bordures (`border`, `border-strong`), statuts (`success`, `warning`, `destructive`, `info`), accent turquoise réservé aux actions principales et à la sélection, ombres courtes (`elev-1/2/3`) et diffuses (`elev-float`), reflets (`--highlight`), dégradés légers, grille « radar », durées 150/200/260 ms, focus visible. Deux familles (Geist, Geist Mono pour les versions).
- Statuts toujours doublés d’un texte et d’une forme/icône. Cibles tactiles ≥ 40 px sur pointeur grossier ; aucune action ne dépend du survol.
- **Radar 3D** (`components/radar/`) : Three.js (sans R3F), géométrie procédurale (2 disques, 3 anneaux, noyau émissif, balayage). Chargé après le premier rendu dans un chunk séparé (≈ 123 Ko gzip) ; taille réservée (200–210 px desktop, 56 px statique mobile) ; un seul canvas ; DPR ≤ 1,5 ; rendu à la demande (entrée ~0,9 s, inclinaison au survol ±0,14 rad, retour au repos, balayage seulement si une synchronisation est réellement en cours) ; arrêt hors écran et onglet masqué ; libération des ressources ; repli SVG statique si WebGL échoue, sur mobile, avec `prefers-reduced-motion` ou « Effets visuels » désactivé (préférence en base). Purement décoratif (`aria-hidden`).
- Cartes de projet : perspective ≤ 3° sur pointeur précis uniquement.
- **Interactions** : store client partagé (`content-state.tsx`) — mise à jour immédiate, confirmation serveur, compteur par élément contre les réponses dans le désordre, retour arrière + « Réessayer », « Annuler » pour lu / retiré / retour « Peu pertinent ». Notifications `aria-live` qui ne prennent pas le focus.
- **Raccourcis** : `Ctrl/Cmd + K` ou `/` (palette : pages, projets, contenus et liens de l’utilisateur, créer un projet — recherche serveur sous RLS), `?` (aide), `Échap` (panneaux, menus, fenêtres). Les touches simples sont ignorées pendant la saisie.

## IA facultative

Inchangé : fournisseur interchangeable, désactivé par défaut, budget quotidien, données transmises limitées (jamais les notes), sorties validées, citations vérifiées. Un résumé généré pour une source non francophone est marqué « Résumé traduit ».

## Confidentialité et sécurité

- RLS sur toutes les tables. Nouvelles tables privées (`dependency_*`, `finding_dismissals`) : propriétaire du projet uniquement. `security_advisories` : lecture seule. `ops_state`, `ops_alerts`, `advisory_package_checks`, `app_admins` : aucune politique (clé de service seulement). `source_proposals` : l’auteur lit et crée ses propositions **en attente** sans pouvoir les modifier ; seuls les admins modèrent.
- Fonctions du flux en `security invoker` : la RLS s’applique ; recherche échappée.
- Clé de service et `GITHUB_TOKEN` côté serveur uniquement ; aucun secret dans les logs ni dans le dépôt.

## Tests, CI et vérifications réalisées

Exécuté le 2026-10-29, Windows 11, Node 23.6, Supabase CLI local (PostgreSQL 17) :

| Vérification | Résultat |
| --- | --- |
| `npm run typecheck`, `npm run lint` | OK |
| Vitest unitaires (61) | OK — dont import (plage, exacte, plusieurs versions, alias, workspace, Git, URL avec identifiants, fichiers non pris en charge), semver (plages GitHub, branches, préversions, retiré, illisible), classification quotas/permissions, arrêt des appels après quota, pagination des avis et `is_withdrawn`, SSRF, alertes, jeu d’évaluation de pertinence |
| Vitest intégration Supabase (13) | OK — isolation entre comptes (imports, constats, masquages, retours, propositions, tables d’exploitation), politiques de modération, pagination keyset sans doublon ni trou + filtres avant pagination, historique avis corrigé puis retiré, signature de classement, détection d’absence d’exécution planifiée |
| Playwright (7, desktop + Pixel 7) | OK — parcours complet, palette, panneau + Échap + position et focus, effets désactivés + animations réduites, mobile sans débordement ni WebGL |
| `npm run build` | OK |
| Collecte réelle locale | 30/30 sources, 0 échec ; quota GitHub anonyme consommé normalement |
| Connecteur GitHub Advisories (réel, **non authentifié**) | Import d’un lockfile de test : 4 noms transmis (package privé exclu), 47 constats dont branches 0.x/1.x d’axios |
| Revue visuelle | 1440 px clair et sombre, 1280 px, 375 px sombre (mobile) : défauts corrigés (barre de défilement des onglets, conflit `hidden`/`inline-flex`, menu masqué par la carte suivante, élément masqué par l’en-tête collant → `scroll-padding-top`) |

Non vérifié : appel GitHub **authentifié** (aucun jeton disponible), webhook d’alerte et heartbeat réels, workflow `monitor.yml` et CI sur GitHub (fichiers livrés, non exécutés sur GitHub), audit d’accessibilité outillé (axe/Lighthouse), zoom 200 % mesuré, contrastes mesurés à l’outil.

**CI** (`.github/workflows/ci.yml`) : sur push et pull request, `npm ci`, typecheck, lint, tests unitaires, build ; job d’intégration sur un Supabase jetable démarré dans le runner. Aucun secret de production, donc identique pour les contributions externes.

## Mesures de performance

Conditions : `next build` + `next start` en local, Supabase local, même compte de revue (2 projets, mêmes données), page `/veille`, Chromium du panneau, cache chaud, 3 chargements ; tailles JS calculées en gzip (CompressionStream) sur les scripts du HTML initial.

| Mesure | Avant (f834f76) | Après |
| --- | --- | --- |
| JS initial | 14 scripts, 635 Ko bruts, **203 Ko gzip** | 12 scripts, 654 Ko bruts, **208 Ko gzip** |
| Radar 3D | — | chunk différé ≈ 493 Ko bruts / **123 Ko gzip**, chargé après inactivité, jamais sur mobile ni effets désactivés |
| `load` (cache chaud) | 238–253 ms | 178–235 ms |
| Nœuds DOM | 2 154 | 1 087 |
| CLS | 0–0,004 | 0 |
| Mise à jour visuelle après « Enregistrer » | aller-retour serveur + rechargement de la page | 8 ms (optimiste) |

Note : une première build intégrait un polyfill `crypto` (≈ +160 Ko gzip) via un import client de `normalize.ts` ; corrigé en isolant `vocabulary.ts`. Mesures indicatives (machine de développement, pas de bridage réseau) : pas de score synthétique annoncé.

## Limites connues et fonctionnalités reportées

- Classification du type de contenu et besoins par mots-clés.
- Sans `GITHUB_TOKEN`, releases et avis peuvent être reportés (quota anonyme partagé).
- Lockfiles npm v2/v3 uniquement ; pas de détection de l’état déployé.
- La synthèse ne s’envoie pas par e-mail.
- **Reporté** (non affiché comme disponible) : envoi de la synthèse par e-mail (activation volontaire, préférences, désinscription, anti-doublons), recherche sémantique / embeddings, autres lockfiles (yarn, pnpm, bun, v1) et écosystèmes.

## Dépannage

| Symptôme | Piste |
| --- | --- |
| Releases/avis « reportés (quota) » | Configurer `GITHUB_TOKEN` puis redéployer ; `npm run github:check` |
| « Analyse indisponible ou incomplète » | Quota GitHub atteint ou clé de service absente : la synchronisation quotidienne complète l’analyse |
| `next start` local qui contacte la mauvaise base | Supprimer/renommer `.env.production.local` ou exporter les variables locales avant `next build` |
| Cron 401 / 409 | `CRON_SECRET` différent / collecte déjà en cours (verrou repris après 10 min) |
| `/api/health/ingestion` en 503 | Aucune collecte réussie depuis 36 h : vérifier le cron Vercel et `ingestion_runs` |
| Types désynchronisés | `npm run db:types` |

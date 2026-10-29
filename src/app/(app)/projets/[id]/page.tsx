import { Archive, ArchiveRestore, ExternalLink, Pencil, RotateCcw, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  acceptSuggestions,
  addGithubRepo,
  addResource,
  addTechnology,
  deleteAction,
  deleteProject,
  deleteResource,
  removeTechnology,
  resetLearned,
  saveProjectNotes,
  setProjectArchived,
  subscribeSource,
  undoFeedback,
  unsubscribeSource,
  updateActionStatus,
  updateTechnology,
} from "@/app/(app)/mutations";
import { ActionQuickForm } from "@/components/action-quick-form";
import { ConfirmDelete } from "@/components/confirm-delete";
import { FeedView } from "@/components/feed-view";
import { SecurityTab } from "@/components/security-tab";
import { EmptyState, formatDate, formatDateTime, TechBadge } from "@/components/labels";
import { StateForm } from "@/components/state-form";
import { SubmitButton } from "@/components/submit-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ACTION_STATUS_LABELS, ACTION_STATUSES } from "@/domain/actions";
import { FEEDBACK_BOUNDS } from "@/domain/ranking";
import { CONTENT_KIND_LABELS, type ContentKind } from "@/domain/sources/normalize";
import { FEATURE_KEYS, FEATURES, isActive, PROJECT_TYPE_LABELS, STAGE_LABELS, TECH_STATUS_LABELS, TECH_STATUSES, type FeatureKey, type Stage, type TechStatus } from "@/domain/projects";
import { detectTechnologies, foldText, getTechnology, TECH_CATEGORIES, TECH_CATEGORY_LABELS, TECHNOLOGIES, type TechCategory } from "@/domain/technologies";
import { parseFilters } from "@/lib/feed";
import { requireUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const TABS = [
  ["apercu", "Vue d’ensemble"],
  ["veille", "Veille"],
  ["stack", "Stack"],
  ["ressources", "Ressources"],
  ["actions", "Actions"],
  ["securite", "Sécurité"],
] as const;
type Tab = (typeof TABS)[number][0];

const FEEDBACK_LABELS: Record<string, string> = {
  wrong_topic: "Mauvais sujet",
  wrong_level: "Mauvais niveau technique",
  already_known: "Déjà connu",
  wrong_source: "Mauvaise source",
  not_useful: "Pas utile pour ce projet",
  unspecified: "Peu pertinent",
};
const select = "field h-8 w-auto py-0";

export async function generateMetadata({ params }: PageProps<"/projets/[id]">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("projects").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Projet" };
}

export default async function ProjectPage({ params, searchParams }: PageProps<"/projets/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Tab) : "apercu";
  const { supabase, userId } = await requireUser();
  const { data: project } = await supabase.from("projects").select("*, project_technologies(*)").eq("id", id).maybeSingle();
  if (!project) notFound(); // also covers projects owned by someone else (RLS returns nothing)

  const active = isActive(project);
  const used = project.project_technologies.filter((t) => t.status === "used");
  return (
    <>
      <header className="surface relative mb-6 overflow-hidden p-5 sm:p-6">
        <div className="radar-grid pointer-events-none absolute inset-y-0 right-0 w-1/2 [mask-image:linear-gradient(to_left,black,transparent)]" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl space-y-2">
            <p className="text-xs text-muted-foreground">
              <Link href="/projets" className="hover:underline">
                Mes projets
              </Link>{" "}
              / {PROJECT_TYPE_LABELS[project.project_type as keyof typeof PROJECT_TYPE_LABELS]}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-balance">{project.name}</h1>
              <span className="rounded-full border border-primary/30 bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">{STAGE_LABELS[project.stage as Stage]}</span>
              {project.archived_at && <span className="rounded-full border bg-muted px-2 py-0.5 text-xs">archivé le {formatDate(project.archived_at)}</span>}
            </div>
            <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
            {used.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {used.slice(0, 8).map((t) => (
                  <TechBadge key={t.id}>
                    {t.display_name}
                    {t.version ? ` ${t.version}` : ""}
                  </TechBadge>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/projets/${id}/modifier`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Pencil aria-hidden /> Modifier
            </Link>
            <form action={setProjectArchived.bind(null, id, !project.archived_at)}>
              <SubmitButton variant="outline" size="sm">
                {project.archived_at ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                {project.archived_at ? "Réactiver" : "Archiver"}
              </SubmitButton>
            </form>
            <ConfirmDelete
              action={deleteProject.bind(null, id)}
              title="Supprimer ce projet ?"
              description="Sa stack, ses analyses, retours, inventaires de dépendances, ressources et actions seront supprimés. Tes favoris et notes sur les contenus restent dans « Enregistrés ». Action irréversible."
            />
          </div>
        </div>
        <p className="relative mt-4 text-xs text-muted-foreground">
          Analyses du {formatDateTime(project.insights_refreshed_at)} · contexte v{project.context_version}
        </p>
      </header>

      {!active && (
        <p role="status" className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          Projet {project.archived_at ? "archivé" : "en pause"} : il reste consultable mais ne reçoit plus de nouvelles recommandations. {project.archived_at ? "Réactive-le" : "Change son stade"} pour relancer la veille.
        </p>
      )}

      <nav aria-label="Sections du projet" className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b [scrollbar-width:none]">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/projets/${id}?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors", tab === key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "apercu" && (await overview(project))}
      {tab === "veille" && <FeedView db={supabase} filters={parseFilters(sp)} basePath={`/projets/${id}`} fixedProjectId={id} searchParams={sp} />}
      {tab === "stack" && (await stackTab(project))}
      {tab === "ressources" && (await resourcesTab(id))}
      {tab === "actions" && (await actionsTab(id, project.name))}
      {tab === "securite" && <SecurityTab db={supabase} projectId={id} projectName={project.name} />}
    </>
  );

  // ─────────── tabs (closures over supabase) ───────────

  async function overview(project: ProjectWithTechs) {
    const [{ data: prefs }, { data: feedback }, { count }] = await Promise.all([
      supabase.from("preferences").select("languages, interests, excluded_topics").eq("user_id", userId).single(),
      supabase.from("project_feedback").select("id, reason, created_at, tech_keys, source_id, sources(name), content_items(id, title, content_kind)").eq("project_id", id).order("created_at", { ascending: false }),
      supabase.from("project_insights").select("content_item_id", { count: "exact", head: true }).eq("project_id", id),
    ]);
    const used = project.project_technologies.filter((t) => t.status === "used");
    const alternatives = project.project_technologies.filter((t) => t.status !== "used");
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <section aria-labelledby="ctx" className="surface space-y-4 p-5">
          <h2 id="ctx" className="font-semibold">
            Contexte utilisé pour personnaliser la veille
          </h2>
          <dl className="grid gap-3 text-sm">
            <Item term="Description">{project.description}</Item>
            {project.problem && <Item term="Problème à résoudre">{project.problem}</Item>}
            {project.audience && <Item term="Public cible">{project.audience}</Item>}
            <Item term="Stade">{STAGE_LABELS[project.stage as Stage]}</Item>
            <Item term="Stack actuelle">{used.length ? used.map((t) => `${t.display_name}${t.version ? ` ${t.version}` : " (version inconnue)"}`).join(", ") : "Non définie — la veille s’appuie sur les besoins et le stade."}</Item>
            {alternatives.length > 0 && <Item term="Alternatives envisagées">{alternatives.map((t) => `${t.display_name} (${TECH_STATUS_LABELS[t.status as TechStatus].toLowerCase()})`).join(", ")}</Item>}
            <Item term="Besoins suivis">{project.features.length ? project.features.map((f) => FEATURES[f as FeatureKey]?.label ?? f).join(", ") : "Aucun"}</Item>
            {project.constraints && <Item term="Contraintes">{project.constraints}</Item>}
            <Item term="Préférences du compte">
              Langues : {prefs?.languages.join(", ") || "—"} · Intérêts : {prefs?.interests.join(", ") || "—"} · Sujets exclus : {prefs?.excluded_topics.join(", ") || "—"}
            </Item>
          </dl>
          <p className="text-xs text-muted-foreground">
            {count ?? 0} contenu(s) retenu(s) · analyses calculées le {formatDateTime(project.insights_refreshed_at)} · version de contexte {project.context_version}. Les notes personnelles ne sont jamais utilisées.
          </p>
          <Link href={`/projets/${id}?tab=veille`} className={buttonVariants({ size: "sm" })}>
            Voir la veille du projet
          </Link>
        </section>

        <div className="space-y-6">
          <section aria-labelledby="notes" className="space-y-2">
            <h2 id="notes" className="text-sm font-semibold">
              Notes personnelles
            </h2>
            <form action={saveProjectNotes.bind(null, id)} className="grid gap-2">
              <Textarea name="notes" rows={5} defaultValue={project.notes ?? ""} maxLength={10000} aria-label="Notes personnelles" />
              <SubmitButton size="sm" variant="outline">
                Enregistrer les notes
              </SubmitButton>
            </form>
          </section>

          <section aria-labelledby="fb" className="surface space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 id="fb" className="flex items-center gap-2 text-sm font-semibold">
                <SlidersHorizontal className="size-4" aria-hidden /> Préférences apprises
              </h2>
              {(feedback?.length ?? 0) > 0 && (
                <form action={resetLearned.bind(null, id, "all", undefined)}>
                  <Button size="xs" variant="ghost" type="submit">
                    <RotateCcw aria-hidden /> Tout réinitialiser
                  </Button>
                </form>
              )}
            </div>
            {!feedback?.length ? (
              <p className="text-xs text-muted-foreground">Aucun retour. « Peu pertinent » ajuste uniquement ce projet, de façon bornée et réversible : rien n’est exclu définitivement.</p>
            ) : (
              <>
                <ul className="space-y-1.5 text-sm">
                  {learned(feedback).map((l) => (
                    <li key={`${l.scope}-${l.key}`} className="flex items-start justify-between gap-2 rounded-lg border bg-card px-2.5 py-1.5">
                      <span>
                        {l.label}
                        <span className="block text-xs text-muted-foreground">
                          {l.count} retour(s) · −{l.points} points au classement (plafond {l.max})
                        </span>
                      </span>
                      <form action={resetLearned.bind(null, id, l.scope, l.key)}>
                        <Button size="xs" variant="ghost" type="submit" aria-label={`Réinitialiser : ${l.label}`}>
                          Réinitialiser
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Contenus retirés de ce projet ({feedback.filter((f) => f.reason !== "wrong_source").length})</summary>
                  <ul className="mt-2 space-y-1.5">
                    {feedback
                      .filter((f) => f.reason !== "wrong_source")
                      .map((f) => (
                        <li key={f.id} className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block text-xs text-muted-foreground">{FEEDBACK_LABELS[f.reason] ?? f.reason}</span>
                            {f.content_items ? (
                              <Link href={`/contenu/${f.content_items.id}`} className="line-clamp-1 hover:underline">
                                {f.content_items.title}
                              </Link>
                            ) : (
                              "Contenu supprimé"
                            )}
                          </span>
                          <form action={undoFeedback.bind(null, id, f.id)}>
                            <Button size="xs" variant="ghost" type="submit">
                              Annuler
                            </Button>
                          </form>
                        </li>
                      ))}
                  </ul>
                </details>
              </>
            )}
          </section>
        </div>
      </div>
    );
  }

  async function stackTab(project: ProjectWithTechs) {
    const [{ data: subs }, { data: catalog }] = await Promise.all([
      supabase.from("project_sources").select("sources(id, name, kind, key, site_url, last_error, last_success_at, in_catalog)").eq("project_id", id),
      supabase.from("sources").select("id, name, kind, language").eq("in_catalog", true).order("name"),
    ]);
    const subscribed = (subs ?? []).flatMap((s) => (s.sources ? [s.sources] : []));
    const subscribedIds = new Set(subscribed.map((s) => s.id));
    const inStack = new Set(project.project_technologies.map((t) => t.tech_key));
    const contextText = `${project.description} ${project.problem ?? ""} ${project.constraints ?? ""}`;
    const techSuggestions = detectTechnologies(contextText).filter((t) => !inStack.has(t.key));
    const folded = foldText(contextText);
    const featureSuggestions = FEATURE_KEYS.filter((k) => !project.features.includes(k) && FEATURES[k].keywords.some((w) => folded.includes(w)));
    const groups = [
      ["Stack actuelle", project.project_technologies.filter((t) => t.status === "used")],
      ["Alternatives envisagées et pistes à explorer", project.project_technologies.filter((t) => t.status !== "used")],
    ] as const;

    return (
      <div className="space-y-8">
        {groups.map(([title, techs]) => (
          <section key={title} aria-label={title} className="space-y-2">
            <h2 className="font-semibold">{title}</h2>
            {!techs.length ? (
              <p className="text-sm text-muted-foreground">{title === "Stack actuelle" ? "Aucune technologie utilisée déclarée. Une idée sans stack est prise en charge : la veille s’appuie sur les besoins et le stade." : "Aucune alternative."}</p>
            ) : (
              <ul className="divide-y surface">
                {techs.map((t) => {
                  const repo = getTechnology(t.tech_key)?.githubRepo;
                  return (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 p-3">
                      <div className="min-w-32 flex-1">
                        <p className="font-medium">{t.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono">{t.tech_key}</span>
                          {repo && (
                            <>
                              {" · "}
                              <a href={`https://github.com/${repo}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline">
                                dépôt officiel <ExternalLink className="size-3" aria-hidden />
                              </a>
                            </>
                          )}
                        </p>
                      </div>
                      <form action={updateTechnology.bind(null, id, t.id)} className="flex flex-wrap items-center gap-2">
                        <select name="category" defaultValue={t.category} className={select} aria-label={`Catégorie de ${t.display_name}`}>
                          {TECH_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {TECH_CATEGORY_LABELS[c]}
                            </option>
                          ))}
                        </select>
                        <select name="status" defaultValue={t.status} className={select} aria-label={`Statut de ${t.display_name}`}>
                          {TECH_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {TECH_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                        <Input name="version" defaultValue={t.version ?? ""} placeholder="Version" className="h-8 w-24" maxLength={30} aria-label={`Version de ${t.display_name}`} />
                        <SubmitButton size="sm" variant="outline">
                          Enregistrer
                        </SubmitButton>
                      </form>
                      <form action={removeTechnology.bind(null, id, t.id)}>
                        <Button size="sm" variant="ghost" type="submit" aria-label={`Retirer ${t.display_name}`}>
                          Retirer
                        </Button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}

        <section aria-labelledby="add-tech" className="space-y-2 rounded-xl border p-4">
          <h2 id="add-tech" className="font-semibold">
            Ajouter une technologie
          </h2>
          <StateForm action={addTechnology.bind(null, id)} submitLabel="Ajouter" className="sm:grid-cols-4 sm:items-end">
            <label className="grid gap-1 text-xs">
              Nom
              <Input name="name" list="tech-catalog" required maxLength={60} placeholder="ex. Next.js" />
              <datalist id="tech-catalog">
                {TECHNOLOGIES.map((t) => (
                  <option key={t.key} value={t.name} />
                ))}
              </datalist>
            </label>
            <label className="grid gap-1 text-xs">
              Catégorie (si hors catalogue)
              <select name="category" className={select} defaultValue="">
                <option value="">Automatique</option>
                {TECH_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {TECH_CATEGORY_LABELS[c as TechCategory]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              Statut
              <select name="status" className={select} defaultValue="used">
                {TECH_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TECH_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              Version (facultatif)
              <Input name="version" maxLength={30} placeholder="ex. 16.1" />
            </label>
          </StateForm>
        </section>

        {(techSuggestions.length > 0 || featureSuggestions.length > 0) && (
          <section aria-labelledby="sugg" className="space-y-2 rounded-xl border border-dashed p-4">
            <h2 id="sugg" className="font-semibold">
              Pistes repérées dans ta description
            </h2>
            <p className="text-xs text-muted-foreground">Rien n’est ajouté sans ta validation. Les technologies acceptées sont ajoutées comme « envisagées ».</p>
            <form action={acceptSuggestions.bind(null, id)} className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {techSuggestions.map((t) => (
                  <label key={t.key} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm has-checked:border-primary">
                    <input type="checkbox" name="techs" value={t.key} /> {t.name}
                  </label>
                ))}
                {featureSuggestions.map((k) => (
                  <label key={k} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm has-checked:border-primary">
                    <input type="checkbox" name="features" value={k} /> Besoin : {FEATURES[k].label}
                  </label>
                ))}
              </div>
              <SubmitButton size="sm" variant="outline">
                Valider la sélection
              </SubmitButton>
            </form>
          </section>
        )}

        <section aria-labelledby="sources" className="space-y-3">
          <h2 id="sources" className="font-semibold">
            Sources suivies par ce projet
          </h2>
          {!subscribed.length ? (
            <p className="text-sm text-muted-foreground">Aucune source : ajoute-en depuis le catalogue ci-dessous.</p>
          ) : (
            <ul className="divide-y surface text-sm">
              {subscribed.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span>
                    <span className="font-medium">{s.name}</span> <span className="text-xs text-muted-foreground">({s.kind === "github" ? "releases GitHub" : "flux RSS/Atom"})</span>
                    {s.last_error ? (
                      <span className="block text-xs text-warning">Indisponible : {s.last_error}</span>
                    ) : (
                      <span className="block text-xs text-muted-foreground">Dernière collecte réussie : {formatDateTime(s.last_success_at)}</span>
                    )}
                  </span>
                  <form action={unsubscribeSource.bind(null, id, s.id)}>
                    <Button size="xs" variant="ghost" type="submit">
                      Ne plus suivre
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer text-sm font-medium">Catalogue de sources vérifiées</summary>
            <ul className="mt-3 grid gap-1 sm:grid-cols-2">
              {(catalog ?? [])
                .filter((s) => !subscribedIds.has(s.id))
                .map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                    <span>
                      {s.name} <span className="text-xs text-muted-foreground">({s.kind === "github" ? "GitHub" : "RSS"}, {s.language})</span>
                    </span>
                    <form action={subscribeSource.bind(null, id, s.id)}>
                      <Button size="xs" variant="outline" type="submit">
                        Suivre
                      </Button>
                    </form>
                  </li>
                ))}
            </ul>
          </details>

          <div className="rounded-xl border p-4">
            <h3 className="mb-2 text-sm font-medium">Suivre les releases d’un dépôt GitHub public</h3>
            <StateForm action={addGithubRepo.bind(null, id)} submitLabel="Ajouter le dépôt">
              <label className="grid gap-1 text-xs">
                Dépôt (owner/repo)
                <Input name="repo" required placeholder="ex. vercel/next.js" maxLength={150} pattern="[^\s]+/[^\s]+" />
              </label>
            </StateForm>
          </div>
        </section>
      </div>
    );
  }

  async function resourcesTab(projectId: string) {
    const [{ data: resources }, { data: favs }] = await Promise.all([
      supabase.from("project_resources").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
      supabase.from("user_content_state").select("note, content_items!inner(id, title, canonical_url, project_insights!inner(project_id))").eq("user_id", userId).eq("is_favorite", true).eq("content_items.project_insights.project_id", projectId),
    ]);
    return (
      <div className="space-y-8">
        <section aria-labelledby="links" className="space-y-3">
          <h2 id="links" className="font-semibold">
            Liens ajoutés manuellement
          </h2>
          {!resources?.length ? (
            <p className="text-sm text-muted-foreground">Aucun lien pour l’instant.</p>
          ) : (
            <ul className="divide-y surface text-sm">
              {resources.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 p-3">
                  <div>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                      {r.title}
                    </a>
                    <p className="break-all text-xs text-muted-foreground">{r.url}</p>
                    {r.note && <p className="mt-1 whitespace-pre-wrap">{r.note}</p>}
                  </div>
                  <form action={deleteResource.bind(null, r.id)}>
                    <Button size="xs" variant="ghost" type="submit">
                      Supprimer
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-xl border p-4">
            <h3 className="mb-2 text-sm font-medium">Ajouter un lien</h3>
            <p className="mb-3 text-xs text-muted-foreground">Le lien est conservé tel que saisi : StackSignal ne va pas le récupérer automatiquement.</p>
            <StateForm action={addResource} submitLabel="Ajouter">
              <input type="hidden" name="project_id" value={projectId} />
              <label className="grid gap-1 text-xs">
                URL
                <Input name="url" type="url" required maxLength={2000} placeholder="https://…" />
              </label>
              <label className="grid gap-1 text-xs">
                Titre
                <Input name="title" required maxLength={300} />
              </label>
              <label className="grid gap-1 text-xs">
                Note (facultatif)
                <Textarea name="note" rows={2} maxLength={5000} />
              </label>
            </StateForm>
          </div>
        </section>

        <section aria-labelledby="favs" className="space-y-3">
          <h2 id="favs" className="font-semibold">
            Contenus enregistrés liés à ce projet
          </h2>
          {!favs?.length ? (
            <p className="text-sm text-muted-foreground">Aucun favori parmi les contenus de ce projet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {favs.map((f) => (
                <li key={f.content_items.id}>
                  <Link href={`/contenu/${f.content_items.id}?projet=${projectId}`} className="underline">
                    {f.content_items.title}
                  </Link>
                  {f.note && <p className="text-xs text-muted-foreground">{f.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  async function actionsTab(projectId: string, projectName: string) {
    const { data: actions } = await supabase.from("project_actions").select("*, content_items(id, title)").eq("project_id", projectId).order("created_at", { ascending: false });
    return (
      <div className="space-y-6">
        <div className="rounded-xl border p-4">
          <h2 className="mb-2 text-sm font-medium">Nouvelle action</h2>
          <ActionQuickForm projects={[{ id: projectId, name: projectName }]} />
        </div>
        {!actions?.length ? (
          <EmptyState title="Aucune action">Crée une action depuis une information de la veille ou ci-dessus.</EmptyState>
        ) : (
          <ul className="divide-y surface">
            {actions.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className={cn("font-medium", (a.status === "done" || a.status === "dropped") && "text-muted-foreground line-through")}>{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Créée le {formatDate(a.created_at)}
                    {a.content_items && (
                      <>
                        {" · d’après "}
                        <Link href={`/contenu/${a.content_items.id}`} className="underline">
                          {a.content_items.title}
                        </Link>
                      </>
                    )}
                  </p>
                  {a.note && <p className="mt-1 whitespace-pre-wrap">{a.note}</p>}
                </div>
                <form action={updateActionStatus.bind(null, a.id)} className="flex items-center gap-1">
                  <select name="status" defaultValue={a.status} className={select} aria-label={`Statut de « ${a.title} »`}>
                    {ACTION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {ACTION_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <SubmitButton size="sm" variant="outline">
                    OK
                  </SubmitButton>
                </form>
                <form action={deleteAction.bind(null, a.id)}>
                  <Button size="xs" variant="ghost" type="submit">
                    Supprimer
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
}

type ProjectWithTechs = {
  id: string;
  name: string;
  description: string;
  problem: string | null;
  audience: string | null;
  stage: string;
  features: string[];
  constraints: string | null;
  notes: string | null;
  context_version: number;
  insights_refreshed_at: string | null;
  project_technologies: { id: string; tech_key: string; display_name: string; category: string; status: string; version: string | null }[];
};

type FeedbackRow = { reason: string; tech_keys: string[]; source_id: string | null; sources: { name: string } | null; content_items: { content_kind: string } | null };

/** Aggregated, explainable adjustments learned from feedback (same bounds as the ranking engine). */
function learned(feedback: FeedbackRow[]) {
  const out = new Map<string, { scope: "source" | "tech" | "kind"; key: string; label: string; count: number; points: number; max: number }>();
  const add = (scope: "source" | "tech" | "kind", key: string | null | undefined, label: string, per: number, max: number) => {
    if (!key) return;
    const e = out.get(`${scope}:${key}`) ?? { scope, key, label, count: 0, points: 0, max };
    e.count++;
    e.points = Math.min(max, e.count * per);
    out.set(`${scope}:${key}`, e);
  };
  const B = FEEDBACK_BOUNDS;
  for (const f of feedback) {
    if (f.reason === "wrong_source") add("source", f.source_id, `Source moins mise en avant : ${f.sources?.name ?? "source"}`, B.source.per, B.source.max);
    if (f.reason === "wrong_topic") for (const t of f.tech_keys) add("tech", t, `Sujet moins mis en avant : ${getTechnology(t)?.name ?? t}`, B.tech.per, B.tech.max);
    if (f.reason === "wrong_level" && f.content_items) add("kind", f.content_items.content_kind, `Type moins mis en avant : ${CONTENT_KIND_LABELS[f.content_items.content_kind as ContentKind] ?? f.content_items.content_kind}`, B.kind.per, B.kind.max);
  }
  return [...out.values()];
}

function Item({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}


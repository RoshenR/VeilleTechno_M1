import { AlertTriangle, ArrowRight, BookOpen, CircleSlash, FolderPlus, Newspaper, RefreshCw, Search, ShieldAlert, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { manualRefresh } from "@/app/(app)/mutations";
import { FeedItem } from "@/components/feed-item";
import { EmptyState, formatDateTime } from "@/components/labels";
import { Radar } from "@/components/radar/radar";
import { SubmitButton } from "@/components/submit-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { CONTENT_KIND_LABELS, CONTENT_KINDS } from "@/domain/sources/normalize";
import { getTechnology } from "@/domain/technologies";
import { loadFeed, loadSyncStatus, type FeedFilters, type Section } from "@/lib/feed";
import type { requireUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type Db = Awaited<ReturnType<typeof requireUser>>["supabase"];

const REFRESH_MESSAGES: Record<string, string> = {
  ok: "Sources actualisées.",
  partiel: "Actualisation terminée, mais certaines sources n’ont pas répondu.",
  "trop-tot": "Actualisation déjà faite il y a moins de 10 minutes : le cache est encore valide.",
  "collecte-indisponible": "La collecte n’est pas configurée sur ce serveur : classement recalculé sur les contenus existants.",
};

const SECTION_TABS: [Section, string, string | undefined, React.ComponentType<{ className?: string }>][] = [
  ["news", "Actualités", undefined, Newspaper],
  ["security", "Sécurité", "securite", ShieldAlert],
  ["background", "Ressources de fond", "fond", BookOpen],
];

const PERIODS: Record<string, string> = { "7": "7 derniers jours", "30": "30 derniers jours", "90": "3 derniers mois", "365": "12 derniers mois" };

export async function FeedView({
  db,
  filters,
  basePath,
  fixedProjectId,
  searchParams,
  effects = true,
}: {
  db: Db;
  filters: FeedFilters;
  basePath: string;
  fixedProjectId?: string;
  searchParams: Record<string, string | string[] | undefined>;
  effects?: boolean;
}) {
  const f = fixedProjectId ? { ...filters, project: fixedProjectId } : filters;
  const [feed, sync, { data: projects }, { data: sources }] = await Promise.all([
    loadFeed(db, f),
    loadSyncStatus(db),
    db.from("projects").select("id, name, archived_at, project_technologies(tech_key, display_name)").order("name"),
    db.from("project_sources").select("sources(id, name)"),
  ]);
  const sourceOptions = [...new Map((sources ?? []).filter((s) => s.sources).map((s) => [s.sources!.id, s.sources!.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const techOptions = [...new Map((projects ?? []).filter((p) => !fixedProjectId || p.id === fixedProjectId).flatMap((p) => p.project_technologies.map((t) => [t.tech_key, getTechnology(t.tech_key)?.name ?? t.display_name] as const))).entries()];
  const activeProjects = (projects ?? []).filter((p) => !p.archived_at);
  const projectName = (id?: string) => projects?.find((p) => p.id === id)?.name;

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && v) p.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("actualisation");
    if (!("apres" in patch)) p.delete("apres");
    const qs = p.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const detail = (id: string) => `/contenu/${id}${f.project ? `?projet=${f.project}` : ""}`;
  const refreshMsg = typeof searchParams.actualisation === "string" ? REFRESH_MESSAGES[searchParams.actualisation] : undefined;
  const syncing = sync.lastRun?.status === "running";

  // Active filters as removable chips (the selected project is shown in the header selector instead).
  const chips: [string, string][] = [];
  if (f.q) chips.push([`« ${f.q} »`, "q"]);
  if (f.tech) chips.push([`Techno : ${techOptions.find(([k]) => k === f.tech)?.[1] ?? f.tech}`, "techno"]);
  if (f.kind) chips.push([`Type : ${CONTENT_KIND_LABELS[f.kind]}`, "type"]);
  if (f.source) chips.push([`Source : ${sourceOptions.find(([id]) => id === f.source)?.[1] ?? "?"}`, "source"]);
  if (f.period) chips.push([PERIODS[f.period], "periode"]);
  if (f.read) chips.push([f.read === "unread" ? "Non lus" : "Lus", "lecture"]);
  if (f.sort === "date") chips.push(["Tri : date", "tri"]);
  const resetHref = fixedProjectId ? `${basePath}?tab=veille` : f.project ? `${basePath}?projet=${f.project}` : basePath;

  if (!activeProjects.length)
    return (
      <EmptyState
        icon={<FolderPlus aria-hidden />}
        title="Commence par décrire un projet"
        action={
          <>
            <Link href="/projets/nouveau" className={buttonVariants()}>
              Créer mon premier projet
            </Link>
            <Link href="/demo" className={buttonVariants({ variant: "outline" })}>
              Voir la démonstration
            </Link>
          </>
        }
      >
        <p>StackSignal sélectionne les actualités et ressources utiles à partir de la description, de la stack et du stade de tes projets. Une idée sans stack suffit pour démarrer.</p>
      </EmptyState>
    );

  const freshness = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>
        Données du <strong className="font-medium text-foreground">{formatDateTime(sync.lastRun?.finished_at ?? sync.lastRun?.started_at)}</strong>
      </span>
      {syncing && <span className="text-primary">· synchronisation en cours</span>}
      {sync.lastRun?.status === "partial" && <span>· collecte partielle, reprise au prochain passage</span>}
      {sync.failing.length > 0 && (
        <details className="relative">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-warning [&::-webkit-details-marker]:hidden">
            <AlertTriangle className="size-3.5" aria-hidden /> {sync.failing.length} source(s) momentanément indisponible(s)
          </summary>
          <ul className="surface-raised absolute left-0 z-30 mt-2 w-72 space-y-1.5 p-3 text-xs">
            {sync.failing.map((s) => (
              <li key={s.name}>
                <span className="font-medium text-foreground">{s.name}</span>
                <span className="block text-muted-foreground">
                  {s.deferred ? `Reportée (quota), nouvelle tentative le ${formatDateTime(s.nextAttempt)}` : `Indisponible, dernier succès : ${formatDateTime(s.lastSuccess)}`}
                </span>
              </li>
            ))}
            <li className="pt-1 text-muted-foreground">Les autres sources continuent d’être collectées.</li>
          </ul>
        </details>
      )}
      <form action={manualRefresh} className="ml-auto">
        <SubmitButton size="xs" variant="ghost" pendingLabel="Actualisation…">
          <RefreshCw aria-hidden /> Actualiser
        </SubmitButton>
      </form>
      {refreshMsg && (
        <p role="status" className="w-full text-primary">
          {refreshMsg}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* À retenir — up to three real priorities, never padded; radar is decorative */}
      {feed.isFirstPage && (
        <section aria-labelledby="highlights" className="surface relative overflow-hidden">
          <div className="radar-grid pointer-events-none absolute inset-y-0 right-0 hidden w-80 [mask-image:linear-gradient(to_left,black,transparent)] md:block" aria-hidden />
          <div className="relative grid gap-4 p-4 sm:p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div className="min-w-0 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="highlights" className="pr-16 text-sm font-semibold md:pr-0">
                  À retenir {f.project && !fixedProjectId ? <span className="font-normal text-muted-foreground">· {projectName(f.project)}</span> : null}
                </h2>
              </div>
              {feed.priorities.length ? (
                <ol className="grid gap-2">
                  {feed.priorities.map((e, i) => (
                    <li key={e.item.id}>
                      <Link href={detail(e.item.id)} scroll={false} className="group flex items-start gap-3 rounded-lg border border-transparent px-2 py-1.5 -mx-2 transition-colors hover:border-border hover:bg-card">
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/12 font-mono text-[0.7rem] font-semibold text-primary ring-1 ring-primary/25">{i + 1}</span>
                        <span className="min-w-0">
                          <span className="line-clamp-1 text-sm font-medium group-hover:underline">{e.item.title}</span>
                          <span className="line-clamp-1 text-xs text-muted-foreground">
                            {e.projects[0]?.projectName} · {e.projects[0]?.why}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">Rien d’urgent : aucune information non lue n’atteint le seuil de priorité. Le flux ci-dessous reste à jour.</p>
              )}
              {freshness}
            </div>
            {!fixedProjectId && <Radar effects={effects} syncing={syncing} className="absolute top-3 right-3 size-14 shrink-0 md:relative md:top-auto md:right-auto md:mx-auto md:size-[200px] lg:size-[210px]" />}
          </div>
        </section>
      )}

      {/* Search, grouped filters, active chips */}
      <section aria-label="Recherche et filtres" className="space-y-3">
        <form method="get" action={basePath} className="flex flex-wrap items-center gap-2">
          {fixedProjectId && <input type="hidden" name="tab" value="veille" />}
          {!fixedProjectId && f.project && <input type="hidden" name="projet" value={f.project} />}
          {f.section !== "news" && <input type="hidden" name="section" value={f.section === "security" ? "securite" : "fond"} />}
          <label className="relative min-w-0 flex-1 basis-60">
            <span className="sr-only">Rechercher dans la veille</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input name="q" defaultValue={f.q ?? ""} maxLength={100} placeholder="Rechercher un titre, un extrait…" className="field pl-9" />
          </label>
          <details className="group relative" open={undefined}>
            <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-border-strong bg-card px-3 text-sm shadow-xs hover:bg-muted [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal className="size-4" aria-hidden /> Filtres
              {chips.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[0.7rem] font-semibold text-primary-foreground">{chips.length}</span>}
            </summary>
            <div className="surface-raised absolute right-0 z-30 mt-2 grid w-[min(36rem,calc(100vw-2rem))] gap-3 p-4 sm:grid-cols-2">
              <Select label="Technologie" name="techno" value={f.tech} options={techOptions} all="Toutes" />
              <Select label="Type de contenu" name="type" value={f.kind} options={CONTENT_KINDS.map((k) => [k, CONTENT_KIND_LABELS[k]] as const)} all="Tous" />
              <Select label="Source" name="source" value={f.source} options={sourceOptions} all="Toutes" />
              <Select label="Publication" name="periode" value={f.period} options={Object.entries(PERIODS)} all="Toutes dates (y compris inconnues)" />
              <Select
                label="Lecture"
                name="lecture"
                value={f.read}
                options={[
                  ["unread", "Non lus"],
                  ["read", "Lus"],
                ]}
                all="Tout"
              />
              <Select label="Tri" name="tri" value={f.sort === "date" ? "date" : undefined} options={[["date", "Date de publication"]]} all="Pertinence" />
              <div className="flex items-end gap-2 sm:col-span-2">
                <Button type="submit" size="sm">
                  Appliquer
                </Button>
                <Link href={resetHref} className={buttonVariants({ size: "sm", variant: "ghost" })}>
                  Tout réinitialiser
                </Link>
              </div>
            </div>
          </details>
          <Button type="submit" size="sm" variant="outline" className="h-9 max-sm:sr-only">
            Rechercher
          </Button>
        </form>
        {chips.length > 0 && (
          <ul className="flex flex-wrap items-center gap-1.5" aria-label="Filtres actifs">
            {chips.map(([label, key]) => (
              <li key={key}>
                <Link href={href({ [key]: undefined })} className="inline-flex h-7 items-center gap-1 rounded-full border border-primary/30 bg-accent px-2.5 text-xs text-accent-foreground hover:border-primary/60 pointer-coarse:h-9">
                  {label} <X className="size-3" aria-hidden />
                  <span className="sr-only">(retirer ce filtre)</span>
                </Link>
              </li>
            ))}
            <li>
              <Link href={resetHref} className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
                Réinitialiser
              </Link>
            </li>
          </ul>
        )}
      </section>

      <section aria-labelledby="flux" className="space-y-4">
        <h2 id="flux" className="sr-only">
          Flux
        </h2>
        <nav aria-label="Sections du flux" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b [scrollbar-width:none]">
          {SECTION_TABS.map(([key, label, param, Icon]) => (
            <Link
              key={key}
              aria-current={f.section === key ? "page" : undefined}
              href={href({ section: param, apres: undefined })}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
                f.section === key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden /> {label}
              <span className="rounded-full bg-muted px-1.5 font-mono text-[0.7rem] text-muted-foreground tabular-nums">{feed.counts[key]}</span>
            </Link>
          ))}
        </nav>

        {f.section === "security" && (
          <p className="flex gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Publications de sécurité des sources suivies. Pour comparer tes dépendances aux avis connus, importe un package.json ou un lockfile dans l’onglet « Sécurité » d’un projet.
          </p>
        )}

        {feed.rankingChanged && (
          <p role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-sm">
            Le classement a été recalculé depuis le début de ta lecture : quelques éléments ont pu changer de place.
            <Link href={href({ apres: undefined })} className="font-medium underline">
              Revenir au début
            </Link>
          </p>
        )}

        {feed.entries.length === 0 ? (
          <EmptyState icon={<CircleSlash aria-hidden />} title={chips.length ? "Aucun contenu pour ces filtres" : "Rien de pertinent pour l’instant"}>
            {chips.length ? (
              <p>
                Élargis la recherche ou{" "}
                <Link href={resetHref} className="underline">
                  réinitialise les filtres
                </Link>
                .
              </p>
            ) : (
              <p>Seul ce qui correspond à ta stack ou à tes besoins est affiché : rien n’est ajouté pour remplir la page. Ajoute des technologies, des besoins ou des sources au projet pour élargir la veille.</p>
            )}
          </EmptyState>
        ) : (
          <div className="grid gap-[var(--row-gap)]">
            {feed.entries.map((e) => (
              <FeedItem key={e.item.id} entry={e} detailHref={detail(e.item.id)} showProjects={!fixedProjectId} />
            ))}
          </div>
        )}

        {(feed.next || !feed.isFirstPage) && (
          <nav aria-label="Pagination" className="flex items-center justify-center gap-2 pt-2 text-sm">
            {!feed.isFirstPage && (
              <Link href={href({ apres: undefined })} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Revenir au début
              </Link>
            )}
            {feed.next && (
              <Link href={href({ apres: feed.next })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Éléments suivants <ArrowRight aria-hidden />
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}

function Select({ label, name, value, options, all }: { label: string; name: string; value?: string; options: readonly (readonly [string, string])[]; all: string }) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <select name={name} defaultValue={value ?? ""} className="field text-foreground">
        <option value="">{all}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

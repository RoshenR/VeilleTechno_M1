import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { manualRefresh } from "@/app/(app)/mutations";
import { FeedItem } from "@/components/feed-item";
import { EmptyState, formatDateTime } from "@/components/labels";
import { SubmitButton } from "@/components/submit-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { CONTENT_KIND_LABELS, CONTENT_KINDS } from "@/domain/sources/normalize";
import { getTechnology } from "@/domain/technologies";
import { loadFeed, loadSyncStatus, type FeedFilters } from "@/lib/feed";
import type { requireUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type Db = Awaited<ReturnType<typeof requireUser>>["supabase"];

const REFRESH_MESSAGES: Record<string, string> = {
  ok: "Sources actualisées.",
  partiel: "Actualisation terminée, mais certaines sources n’ont pas répondu.",
  "trop-tot": "Actualisation déjà faite il y a moins de 10 minutes : le cache est encore valide.",
  "collecte-indisponible": "La collecte n’est pas configurée sur ce serveur : classement recalculé sur les contenus existants.",
};

const select = "h-8 w-full rounded-lg border bg-background px-2 text-sm";

export async function FeedView({
  db,
  filters,
  basePath,
  fixedProjectId,
  searchParams,
}: {
  db: Db;
  filters: FeedFilters;
  basePath: string;
  fixedProjectId?: string;
  searchParams: Record<string, string | string[] | undefined>;
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

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && v) p.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("actualisation");
    const qs = p.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const detail = (id: string) => `/contenu/${id}${fixedProjectId ? `?projet=${fixedProjectId}` : f.project ? `?projet=${f.project}` : ""}`;
  const refreshMsg = typeof searchParams.actualisation === "string" ? REFRESH_MESSAGES[searchParams.actualisation] : undefined;
  const hasFilters = Boolean(f.tech || f.kind || f.source || f.period || f.read || (!fixedProjectId && f.project));

  return (
    <div className="space-y-6">
      {/* Sync status */}
      <section aria-label="État de la collecte" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
        <div className="space-y-0.5">
          <p>
            Dernière collecte : <strong className="font-medium">{formatDateTime(sync.lastRun?.finished_at ?? sync.lastRun?.started_at)}</strong>
            {sync.lastRun?.status === "running" && <span className="ml-2 text-primary">· synchronisation en cours…</span>}
            {sync.lastRun?.status === "partial" && <span className="ml-2 text-muted-foreground">· partielle, reprise au prochain passage</span>}
          </p>
          <p className="text-xs text-muted-foreground">La veille couvre uniquement les sources configurées, pas tout le web.</p>
        </div>
        <form action={manualRefresh}>
          <SubmitButton size="sm" variant="outline" pendingLabel="Actualisation…">
            <RefreshCw aria-hidden /> Actualiser
          </SubmitButton>
        </form>
        {refreshMsg && (
          <p role="status" className="w-full text-xs text-primary">
            {refreshMsg}
          </p>
        )}
        {sync.failing.length > 0 && (
          <details className="w-full text-xs">
            <summary className="flex cursor-pointer items-center gap-1 text-warning">
              <AlertTriangle className="size-3.5" aria-hidden /> {sync.failing.length} source(s) indisponible(s) : les autres continuent d’être collectées.
            </summary>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {sync.failing.map((s) => (
                <li key={s.name}>
                  <strong className="font-medium text-foreground">{s.name}</strong> — {s.error} (dernier succès : {formatDateTime(s.lastSuccess)})
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Filters */}
      <details className="group rounded-xl border bg-card md:open:pb-0" open={hasFilters || undefined}>
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          Filtres et tri {hasFilters && <span className="text-primary">· actifs</span>}
        </summary>
        <form method="get" action={basePath} className="grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-4">
          {!fixedProjectId && (
            <label className="grid gap-1 text-xs">
              Projet
              <select name="projet" defaultValue={f.project ?? ""} className={select}>
                <option value="">Tous mes projets</option>
                {(projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.archived_at ? " (archivé)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-xs">
            Technologie
            <select name="techno" defaultValue={f.tech ?? ""} className={select}>
              <option value="">Toutes</option>
              {techOptions.map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            Type de contenu
            <select name="type" defaultValue={f.kind ?? ""} className={select}>
              <option value="">Tous</option>
              {CONTENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CONTENT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            Source
            <select name="source" defaultValue={f.source ?? ""} className={select}>
              <option value="">Toutes</option>
              {sourceOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            Publication
            <select name="periode" defaultValue={f.period ?? ""} className={select}>
              <option value="">Toutes dates (y compris inconnues)</option>
              <option value="7">7 derniers jours</option>
              <option value="30">30 derniers jours</option>
              <option value="90">3 derniers mois</option>
              <option value="365">12 derniers mois</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            Lecture
            <select name="lecture" defaultValue={f.read ?? ""} className={select}>
              <option value="">Tout</option>
              <option value="unread">Non lus</option>
              <option value="read">Lus</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            Tri
            <select name="tri" defaultValue={f.sort} className={select}>
              <option value="relevance">Pertinence</option>
              <option value="date">Date de publication</option>
            </select>
          </label>
          {fixedProjectId && <input type="hidden" name="tab" value="veille" />}
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm">
              Appliquer
            </Button>
            <Link href={fixedProjectId ? `${basePath}?tab=veille` : basePath} className={buttonVariants({ size: "sm", variant: "ghost" })}>
              Réinitialiser
            </Link>
          </div>
        </form>
      </details>

      {!activeProjects.length ? (
        <EmptyState title="Aucun projet actif">
          <p>Décris un projet pour recevoir une sélection adaptée.</p>
          <div className="mt-3 flex justify-center gap-2">
            <Link href="/projets/nouveau" className={buttonVariants()}>
              Créer mon premier projet
            </Link>
            <Link href="/demo" className={buttonVariants({ variant: "outline" })}>
              Voir la démonstration
            </Link>
          </div>
        </EmptyState>
      ) : (
        <>
          {feed.priorities.length > 0 && f.page === 1 && (
            <section aria-labelledby="prio" className="space-y-3">
              <h2 id="prio" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Prioritaires ({feed.priorities.length})
              </h2>
              <div className="grid gap-3">
                {feed.priorities.map((e) => (
                  <FeedItem key={e.item.id} entry={e} detailHref={detail(e.item.id)} showProjects={!fixedProjectId} />
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="flux" className="space-y-3">
            <h2 id="flux" className="sr-only">
              Flux
            </h2>
            <div role="tablist" aria-label="Type de flux" className="flex gap-1 border-b">
              {(
                [
                  ["news", "Actualités récentes", feed.counts.news, undefined],
                  ["background", "Ressources de fond", feed.counts.background, "fond"],
                ] as const
              ).map(([key, label, count, param]) => (
                <Link
                  key={key}
                  role="tab"
                  aria-selected={f.section === key}
                  href={href({ section: param, page: undefined })}
                  className={cn("-mb-px border-b-2 px-3 py-2 text-sm", f.section === key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}
                >
                  {label} <span className="text-xs text-muted-foreground">({count})</span>
                </Link>
              ))}
            </div>

            {feed.entries.length === 0 ? (
              <EmptyState title="Aucune information pertinente pour l’instant">
                {hasFilters ? (
                  <p>Aucun contenu ne correspond à ces filtres. Essaie de les élargir.</p>
                ) : (
                  <p>Nous n’affichons que ce qui correspond à ta stack ou à tes besoins : rien n’est ajouté pour remplir la page. Ajoute des technologies, des besoins ou des sources au projet pour élargir la veille.</p>
                )}
              </EmptyState>
            ) : (
              <div className="grid gap-3">
                {feed.entries.map((e) => (
                  <FeedItem key={e.item.id} entry={e} detailHref={detail(e.item.id)} showProjects={!fixedProjectId} />
                ))}
              </div>
            )}

            {feed.pages > 1 && (
              <nav aria-label="Pagination" className="flex items-center justify-center gap-2 pt-2 text-sm">
                {f.page > 1 && (
                  <Link href={href({ page: String(f.page - 1) })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Précédent
                  </Link>
                )}
                <span aria-current="page">
                  Page {f.page} / {feed.pages}
                </span>
                {f.page < feed.pages && (
                  <Link href={href({ page: String(f.page + 1) })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Suivant
                  </Link>
                )}
              </nav>
            )}
            {feed.capped && <p className="text-center text-xs text-muted-foreground">Affichage limité aux 800 analyses les plus pertinentes.</p>}
          </section>
        </>
      )}
    </div>
  );
}

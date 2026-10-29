import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageHeader, TechBadge } from "@/components/labels";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STAGE_LABELS, TECH_STATUS_LABELS, type Stage, type TechStatus } from "@/domain/projects";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Mes projets" };

export default async function ProjectsPage({ searchParams }: PageProps<"/projets">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const showArchived = sp.archives === "1";

  let query = supabase
    .from("projects")
    .select("id, name, description, stage, archived_at, updated_at, project_technologies(tech_key, display_name, status), project_insights(content_item_id)")
    .order("updated_at", { ascending: false });
  query = showArchived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%_,()]/g, " ")}%,description.ilike.%${q.replace(/[%_,()]/g, " ")}%`);
  const [{ data: projects }, { data: read }] = await Promise.all([query, supabase.from("user_content_state").select("content_item_id").eq("is_read", true)]);
  const readIds = new Set((read ?? []).map((r) => r.content_item_id));

  return (
    <>
      <PageHeader title="Mes projets" description="Chaque projet a son propre contexte de veille.">
        <Link href="/projets/nouveau" className={buttonVariants()}>
          <Plus aria-hidden /> Nouveau projet
        </Link>
      </PageHeader>

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Rechercher un projet
        </label>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2 top-2 size-4 text-muted-foreground" aria-hidden />
          <Input id="q" name="q" defaultValue={q} placeholder="Rechercher…" className="pl-8" />
        </div>
        {showArchived && <input type="hidden" name="archives" value="1" />}
        <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Rechercher
        </button>
        <Link href={showArchived ? "/projets" : "/projets?archives=1"} className="ml-auto text-sm underline">
          {showArchived ? "Voir les projets actifs" : "Voir les projets archivés"}
        </Link>
      </form>

      {!projects?.length ? (
        q || showArchived ? (
          <EmptyState title={showArchived ? "Aucun projet archivé" : "Aucun projet ne correspond à cette recherche"} />
        ) : (
          <EmptyState title="Bienvenue sur StackSignal">
            <p>Décris un projet — même une simple idée — pour recevoir une veille adaptée.</p>
            <div className="mt-3 flex justify-center gap-2">
              <Link href="/projets/nouveau" className={buttonVariants()}>
                Créer mon premier projet
              </Link>
              <Link href="/demo" className={buttonVariants({ variant: "outline" })}>
                Voir la démonstration
              </Link>
            </div>
          </EmptyState>
        )
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => {
            const unread = p.project_insights.filter((i) => !readIds.has(i.content_item_id)).length;
            const used = p.project_technologies.filter((t) => t.status === "used");
            const other = p.project_technologies.filter((t) => t.status !== "used");
            return (
              <li key={p.id}>
                <Link href={`/projets/${p.id}`} className="block h-full rounded-xl border bg-card p-4 hover:border-primary/50">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-medium">{p.name}</h2>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">{STAGE_LABELS[p.stage as Stage]}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {used.map((t) => (
                      <TechBadge key={t.tech_key}>{t.display_name}</TechBadge>
                    ))}
                    {other.map((t) => (
                      <TechBadge key={t.tech_key}>
                        {t.display_name} · {TECH_STATUS_LABELS[t.status as TechStatus].toLowerCase()}
                      </TechBadge>
                    ))}
                    {!p.project_technologies.length && <span className="text-xs text-muted-foreground">Stack non définie</span>}
                  </div>
                  <p className="mt-3 text-sm">
                    {p.stage === "paused" || p.archived_at ? (
                      <span className="text-muted-foreground">Pas de nouvelles recommandations ({p.archived_at ? "archivé" : "en pause"})</span>
                    ) : unread ? (
                      <span className="text-primary">{unread} élément(s) utile(s) non lu(s)</span>
                    ) : (
                      <span className="text-muted-foreground">Rien de nouveau</span>
                    )}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

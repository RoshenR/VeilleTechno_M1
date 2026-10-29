import { BookOpen, CalendarRange, ListChecks, Newspaper, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { formatDate, PageHeader, PriorityBadge } from "@/components/labels";
import { StatusBadge } from "@/components/security-tab";
import { ACTION_STATUS_LABELS, type ActionStatus } from "@/domain/actions";
import type { FindingStatus } from "@/domain/advisory-match";
import type { Priority } from "@/domain/ranking";
import type { ProjectInsightView } from "@/lib/feed";
import { requireUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Synthèse de la semaine" };

const DAY = 86_400_000;
/** The digest period: the seven days ending now (request time). */
const lastSevenDays = () => ({ now: Date.now(), since: new Date(Date.now() - 7 * DAY).toISOString() });

/** Last seven days, from existing data and analyses only: an empty block says so, nothing is padded. */
export default async function DigestPage({ searchParams }: PageProps<"/synthese">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const project = typeof sp.projet === "string" && /^[0-9a-f-]{36}$/i.test(sp.projet) ? sp.projet : undefined;
  const { now, since } = lastSevenDays();
  const base = { p_project: project, p_since: since };

  let findingsQ = supabase
    .from("dependency_findings")
    .select("id, package, version, declared, status, ghsa_id, computed_at, project_id, projects(name), security_advisories(summary, html_url)")
    .is("superseded_at", null)
    .in("status", ["affected", "unknown_version", "withdrawn"])
    .gte("computed_at", since)
    .order("computed_at", { ascending: false })
    .limit(8);
  let actionsQ = supabase.from("project_actions").select("id, title, status, created_at, project_id, projects(name)").in("status", ["to_study", "todo"]).order("created_at", { ascending: true }).limit(10);
  if (project) {
    findingsQ = findingsQ.eq("project_id", project);
    actionsQ = actionsQ.eq("project_id", project);
  }

  const [{ data: projects }, { data: news }, { data: security }, { data: resources }, { data: findings }, { data: actions }] = await Promise.all([
    supabase.from("projects").select("id, name").is("archived_at", null).order("name"),
    supabase.rpc("feed_items", base).eq("section", "news").eq("is_prerelease", false).order("best_score", { ascending: false }).order("sort_date", { ascending: false }).limit(5),
    supabase.rpc("feed_items", base).eq("section", "security").order("best_score", { ascending: false }).limit(5),
    supabase.rpc("feed_items", base).eq("section", "background").order("best_score", { ascending: false }).limit(4),
    findingsQ,
    actionsQ,
  ]);
  const period = `du ${formatDate(since)} au ${formatDate(new Date(now).toISOString())}`;
  const detail = (id: string) => `/contenu/${id}${project ? `?projet=${project}` : ""}`;

  return (
    <>
      <PageHeader eyebrow={<span className="inline-flex items-center gap-1.5"><CalendarRange className="size-3.5" aria-hidden /> Sept derniers jours</span>} title="Synthèse de la semaine" description={`Période ${period}. Construite à partir des contenus collectés et des analyses existantes.`}>
        <nav aria-label="Filtrer par projet" className="flex flex-wrap gap-1">
          {[{ id: undefined, name: "Tous les projets" }, ...(projects ?? [])].map((p) => (
            <Link
              key={p.id ?? "all"}
              href={p.id ? `/synthese?projet=${p.id}` : "/synthese"}
              aria-current={p.id === project ? "page" : undefined}
              className={cn("rounded-full border px-3 py-1 text-xs transition-colors pointer-coarse:py-2", p.id === project ? "border-primary/40 bg-accent text-accent-foreground" : "hover:bg-muted")}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Block icon={Newspaper} title="Informations utiles" note="Jusqu’à cinq, par pertinence">
          {news?.length ? (
            <ol className="space-y-3">
              {news.map((n, i) => {
                const top = (n.projects as unknown as ProjectInsightView[])[0];
                return (
                  <li key={n.id} className="flex gap-3">
                    <span className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 space-y-1">
                      <Link href={detail(n.id)} scroll={false} className="font-medium hover:underline">
                        {n.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {n.source_name} · {formatDate(n.published_at)} · {top?.projectName}
                      </p>
                      {top && <p className="text-sm text-foreground/85">{top.why}</p>}
                      {top && <PriorityBadge priority={top.priority as Priority} />}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <Empty>Aucune actualité pertinente publiée sur la période.</Empty>
          )}
        </Block>

        <div className="space-y-6">
          <Block icon={ShieldAlert} title="Sécurité" note="Selon l’état réel des analyses">
            {findings?.length ? (
              <ul className="space-y-2.5">
                {findings.map((f) => (
                  <li key={f.id} className="space-y-1 text-sm">
                    <StatusBadge status={f.status as FindingStatus} />
                    <p>
                      <span className="font-mono">
                        {f.package}
                        {f.version ? `@${f.version}` : ""}
                      </span>{" "}
                      ·{" "}
                      <a href={f.security_advisories?.html_url} target="_blank" rel="noopener noreferrer" className="underline">
                        {f.ghsa_id}
                      </a>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <Link href={`/projets/${f.project_id}?tab=securite`} className="hover:underline">
                        {f.projects?.name}
                      </Link>{" "}
                      · analysé le {formatDate(f.computed_at)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Aucun changement de résultat sur les dépendances importées cette semaine.</Empty>
            )}
            {(security?.length ?? 0) > 0 && (
              <div className="mt-4 border-t pt-3">
                <p className="eyebrow mb-2">Publications de sécurité suivies</p>
                <ul className="space-y-1.5 text-sm">
                  {security!.map((s) => (
                    <li key={s.id}>
                      <Link href={detail(s.id)} scroll={false} className="hover:underline">
                        {s.title}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {s.source_name} · {formatDate(s.published_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Block>

          <Block icon={BookOpen} title="Ressources intéressantes">
            {resources?.length ? (
              <ul className="space-y-2 text-sm">
                {resources.map((r) => (
                  <li key={r.id}>
                    <Link href={detail(r.id)} scroll={false} className="hover:underline">
                      {r.title}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {r.source_name} · {formatDate(r.published_at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Aucune nouvelle ressource de fond retenue sur la période.</Empty>
            )}
          </Block>
        </div>
      </div>

      <Block icon={ListChecks} title="Actions encore ouvertes" note="Pas des nouveautés : rappel de ce qui reste à faire" className="mt-6">
        {actions?.length ? (
          <ul className="divide-y">
            {actions.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {a.title}
                  <span className="block text-xs text-muted-foreground">
                    {a.projects?.name} · créée le {formatDate(a.created_at)}
                  </span>
                </span>
                <span className="rounded-full border px-2 py-0.5 text-xs">{ACTION_STATUS_LABELS[a.status as ActionStatus]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Aucune action ouverte.</Empty>
        )}
      </Block>
      <p className="mt-6 text-xs text-muted-foreground">L’envoi de cette synthèse par e-mail n’est pas encore disponible.</p>
    </>
  );
}

function Block({ icon: Icon, title, note, children, className }: { icon: React.ComponentType<{ className?: string }>; title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("surface p-5", className)} aria-label={title}>
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon className="size-4 text-primary" aria-hidden /> {title}
        </h2>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

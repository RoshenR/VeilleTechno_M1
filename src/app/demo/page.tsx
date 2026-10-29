import Link from "next/link";
import { FeedItem } from "@/components/feed-item";
import { DemoBadge, KindBadge, PriorityBadge, PublishedDate } from "@/components/labels";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_PROJECTS, demoItems } from "@/demo/fixtures";
import { rankItem, type RankResult } from "@/domain/ranking";
import { isNewsKind } from "@/domain/sources/normalize";
import { suggestedAction } from "@/domain/suggestions";
import type { FeedEntry } from "@/lib/feed";
import { cn } from "@/lib/utils";

export const metadata = { title: "Démonstration" };

// Isolated demo: fixtures ranked in memory by the real engine. No account, no database, no paid call.
export default async function DemoPage({ searchParams }: PageProps<"/demo">) {
  const sp = await searchParams;
  const projectId = DEMO_PROJECTS.some((p) => p.id === sp.projet) ? (sp.projet as string) : undefined;
  const items = demoItems();
  const projects = projectId ? DEMO_PROJECTS.filter((p) => p.id === projectId) : DEMO_PROJECTS;

  const results = items.map((it) => ({ it, ranks: projects.map((p) => ({ p, r: rankItem(p.rank, it) })) }));
  const entries: FeedEntry[] = results
    .map(({ it, ranks }) => {
      const included = ranks.filter((x): x is { p: (typeof projects)[number]; r: Extract<RankResult, { included: true }> } => x.r.included);
      return {
        item: { id: it.id, title: it.title, url: it.url, excerpt: it.excerpt, kind: it.kind, isPrerelease: it.isPrerelease, releaseTag: it.releaseTag, publishedAt: it.publishedAt, sourceId: it.sourceId, sourceName: it.source.name, isDemo: true },
        projects: included.map(({ p, r }) => ({ projectId: p.id, projectName: p.name, score: r.score, priority: r.priority, why: r.why, matchedTechs: r.matchedTechs })),
        bestScore: Math.max(0, ...included.map((x) => x.r.score)),
        isRead: false,
        isFavorite: false,
      };
    })
    .filter((e) => e.projects.length)
    .sort((a, b) => b.bestScore - a.bestScore);
  const rejected = results.filter(({ ranks }) => ranks.every((x) => !x.r.included));
  const selected = typeof sp.item === "string" ? results.find((x) => x.it.id === sp.item) : undefined;
  const href = (o: { projet?: string; item?: string }) => `/demo?${new URLSearchParams(Object.entries({ projet: projectId, ...o }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <div className="flex-1">
      <div role="note" className="sticky top-0 z-30 border-b border-warning/40 bg-warning/15 px-4 py-2 text-center text-sm">
        <strong>Mode démonstration</strong> — projets et contenus fictifs (« Donnée de démonstration »), classés par le vrai moteur de règles. Aucune connexion à un compte, aucun appel payant.{" "}
        <Link href="/inscription" className="font-medium underline">
          Créer un compte
        </Link>
      </div>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Stack<span className="text-primary">Signal</span> · démo
            </h1>
            <p className="text-sm text-muted-foreground">Un même contenu reçoit une explication différente selon le projet.</p>
          </div>
          <ThemeToggle />
        </div>

        <nav aria-label="Projets de démonstration" className="flex flex-wrap gap-2">
          <Link href="/demo" className={buttonVariants({ size: "sm", variant: projectId ? "outline" : "default" })} aria-current={!projectId ? "page" : undefined}>
            Tous les projets
          </Link>
          {DEMO_PROJECTS.map((p) => (
            <Link key={p.id} href={`/demo?projet=${p.id}`} className={buttonVariants({ size: "sm", variant: projectId === p.id ? "default" : "outline" })} aria-current={projectId === p.id ? "page" : undefined}>
              {p.name.replace("Démo — ", "")}
            </Link>
          ))}
        </nav>

        <div className="grid gap-3 sm:grid-cols-3">
          {projects.map((p) => (
            <div key={p.id} className="rounded-xl border bg-card p-3 text-sm">
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.description}</p>
            </div>
          ))}
        </div>

        <div className={cn("grid gap-6", selected && "lg:grid-cols-[1fr_24rem]")}>
          <div className="space-y-6">
            {(["news", "background"] as const).map((section) => {
              const list = entries.filter((e) => isNewsKind(e.item.kind) === (section === "news"));
              return (
                <section key={section} className="space-y-3" aria-labelledby={`s-${section}`}>
                  <h2 id={`s-${section}`} className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {section === "news" ? "Actualités récentes" : "Ressources de fond"} ({list.length})
                  </h2>
                  {list.map((e) => (
                    <FeedItem key={e.item.id} entry={e} demo detailHref={href({ item: e.item.id })} showProjects={!projectId} />
                  ))}
                  {!list.length && <p className="text-sm text-muted-foreground">Aucune information pertinente.</p>}
                </section>
              );
            })}
            {rejected.length > 0 && (
              <section aria-labelledby="rej" className="space-y-2 rounded-xl border border-dashed p-4 text-sm">
                <h2 id="rej" className="font-medium">
                  Contenus collectés mais non retenus
                </h2>
                <p className="text-xs text-muted-foreground">La sélection n’est jamais complétée artificiellement : ces contenus ne correspondent ni à la stack ni aux besoins.</p>
                {rejected.map(({ it, ranks }) => (
                  <p key={it.id}>
                    <DemoBadge /> {it.title} — <span className="text-muted-foreground">{ranks[0].r.included ? "" : ranks[0].r.excludedBy}</span>
                  </p>
                ))}
              </section>
            )}
          </div>

          {selected && (
            <aside aria-label="Détail" className="h-fit space-y-4 rounded-xl border bg-card p-4 lg:sticky lg:top-14">
              <div className="flex items-center justify-between">
                <DemoBadge />
                <Link href={href({})} className="text-xs underline">
                  Fermer
                </Link>
              </div>
              <h2 className="font-semibold">{selected.it.title}</h2>
              <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                <KindBadge kind={selected.it.kind} prerelease={selected.it.isPrerelease} />
                <span>{selected.it.source.name}</span>·<PublishedDate iso={selected.it.publishedAt} />
              </div>
              <p className="rounded-lg bg-muted p-3 text-sm">{selected.it.excerpt ?? "Titre seulement : aucun résumé n’est proposé pour ne rien supposer."}</p>
              {selected.ranks.map(({ p, r }) => (
                <div key={p.id} className="space-y-1 border-t pt-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{p.name}</p>
                    {r.included && <PriorityBadge priority={r.priority} />}
                  </div>
                  {r.included ? (
                    <>
                      <p>{r.why}</p>
                      <ul className="list-inside list-disc text-xs text-muted-foreground">
                        {r.reasons.map((x, i) => (
                          <li key={i}>{x.label}</li>
                        ))}
                      </ul>
                      <p className="text-xs">
                        <span className="font-medium">Action suggérée : </span>
                        {suggestedAction(r.priority, selected.it.kind, p.rank.techs.filter((t) => r.matchedTechs.includes(t.key)).map((t) => t.name), p.rank.techs.filter((t) => r.matchedTechs.includes(t.key) && t.status === "used" && !t.version).map((t) => t.name)) ?? "Aucune action nécessaire."}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Non retenu : {r.excludedBy}</p>
                  )}
                </div>
              ))}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

import { Bookmark, BookmarkCheck, Check, ExternalLink, ThumbsDown, Undo2 } from "lucide-react";
import Link from "next/link";
import { giveFeedback, setFavorite, setRead } from "@/app/(app)/mutations";
import { ActionQuickForm } from "@/components/action-quick-form";
import { DemoBadge, KindBadge, PriorityBadge, PublishedDate, TechBadge } from "@/components/labels";
import { Button, buttonVariants } from "@/components/ui/button";
import { getTechnology } from "@/domain/technologies";
import type { FeedEntry } from "@/lib/feed";
import { cn } from "@/lib/utils";

const FEEDBACK_REASONS = [
  ["wrong_topic", "Mauvais sujet"],
  ["wrong_level", "Mauvais niveau"],
  ["already_known", "Déjà connu"],
  ["wrong_source", "Mauvaise source"],
] as const;

const menu = "absolute right-0 z-20 mt-1 w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg";
const summaryBtn =
  "inline-flex h-7 cursor-pointer list-none items-center gap-1 rounded-md px-2 text-[0.8rem] hover:bg-muted [&::-webkit-details-marker]:hidden";

export function FeedItem({ entry, detailHref, demo, showProjects = true }: { entry: FeedEntry; detailHref: string; demo?: boolean; showProjects?: boolean }) {
  const { item } = entry;
  const techs = [...new Set(entry.projects.flatMap((p) => p.matchedTechs))];
  const top = [...entry.projects].sort((a, b) => b.score - a.score)[0];
  return (
    <article className={cn("rounded-xl border bg-card p-4 transition-colors", entry.isRead && "opacity-75")} aria-labelledby={`t-${item.id}`}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {top && <PriorityBadge priority={top.priority} />}
        <KindBadge kind={item.kind} prerelease={item.isPrerelease} />
        {item.isDemo && <DemoBadge />}
        <span>{item.sourceName}</span>
        <span aria-hidden>·</span>
        <PublishedDate iso={item.publishedAt} />
        {entry.isRead && <span className="rounded bg-muted px-1.5">Lu</span>}
      </div>
      <h3 id={`t-${item.id}`} className="mt-2 font-medium leading-snug">
        <Link href={detailHref} className="hover:underline">
          {item.title}
        </Link>
      </h3>
      {item.excerpt && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.excerpt}</p>}
      {!item.excerpt && <p className="mt-1 text-xs italic text-muted-foreground">Titre seulement : pas d’extrait fourni par la source.</p>}

      <div className="mt-3 space-y-1">
        {entry.projects.map((p) => (
          <p key={p.projectId} className="text-sm">
            <span className="font-medium">{showProjects ? `Pourquoi pour ${p.projectName} ?` : "Pourquoi pour ce projet ?"}</span> <span className="text-muted-foreground">{p.why}</span>
          </p>
        ))}
      </div>
      {techs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {techs.map((t) => (
            <TechBadge key={t}>{getTechnology(t)?.name ?? t}</TechBadge>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1">
        <a href={item.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "ghost" })}>
          <ExternalLink aria-hidden /> Ouvrir<span className="sr-only"> la source originale (nouvel onglet)</span>
        </a>
        <Link href={detailHref} className={buttonVariants({ size: "sm", variant: "ghost" })}>
          Détail
        </Link>
        {!demo && (
          <>
            <form action={setFavorite.bind(null, item.id, !entry.isFavorite)}>
              <Button size="sm" variant="ghost" type="submit" aria-pressed={entry.isFavorite}>
                {entry.isFavorite ? <BookmarkCheck aria-hidden className="text-primary" /> : <Bookmark aria-hidden />}
                {entry.isFavorite ? "Enregistré" : "Enregistrer"}
              </Button>
            </form>
            <form action={setRead.bind(null, item.id, !entry.isRead)}>
              <Button size="sm" variant="ghost" type="submit">
                {entry.isRead ? <Undo2 aria-hidden /> : <Check aria-hidden />}
                {entry.isRead ? "Marquer non lu" : "Marquer comme lu"}
              </Button>
            </form>
            <details className="relative">
              <summary className={summaryBtn}>Créer une action</summary>
              <div className={menu}>
                <ActionQuickForm compact itemId={item.id} projects={entry.projects.map((p) => ({ id: p.projectId, name: p.projectName }))} defaultTitle={`Étudier : ${item.title}`.slice(0, 300)} />
              </div>
            </details>
            <details className="relative">
              <summary className={summaryBtn}>
                <ThumbsDown aria-hidden className="size-3.5" /> Peu pertinent
              </summary>
              <div className={menu}>
                {entry.projects.map((p) => (
                  <div key={p.projectId} className="mb-2 last:mb-0">
                    {entry.projects.length > 1 && <p className="mb-1 text-xs font-medium">{p.projectName}</p>}
                    <div className="flex flex-wrap gap-1">
                      {FEEDBACK_REASONS.map(([reason, label]) => (
                        <form key={reason} action={giveFeedback.bind(null, p.projectId, item.id, reason)}>
                          <Button size="xs" variant="outline" type="submit">
                            {label}
                          </Button>
                        </form>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="mt-2 text-xs text-muted-foreground">Réversible depuis la vue d’ensemble du projet. « Mauvaise source » baisse cette source pour ce projet, sans la masquer.</p>
              </div>
            </details>
          </>
        )}
      </div>
    </article>
  );
}

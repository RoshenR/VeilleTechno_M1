"use client";

import { Bookmark, BookmarkCheck, Check, ExternalLink, ListPlus, MoreHorizontal, ThumbsDown, Undo2 } from "lucide-react";
import Link from "next/link";
import { ActionQuickForm } from "@/components/action-quick-form";
import { changeItemState, dismissForProject, useDismissed, useItemState } from "@/components/content-state";
import { DemoBadge, KindBadge, PriorityBadge, PublishedDate, TechBadge } from "@/components/labels";
import { Popover } from "@/components/popover";
import { getTechnology } from "@/domain/technologies";
import type { FeedEntry } from "@/lib/feed";
import { cn } from "@/lib/utils";

export const FEEDBACK_REASONS = [
  ["wrong_topic", "Mauvais sujet", "Abaisse légèrement ce sujet pour ce projet (borné, réversible)."],
  ["wrong_level", "Mauvais niveau technique", "Abaisse légèrement ce type de contenu pour ce projet."],
  ["already_known", "Déjà connu", "Marque le contenu comme lu, sans pénaliser le sujet."],
  ["wrong_source", "Mauvaise source", "Abaisse cette source pour ce projet, sans la masquer."],
  ["not_useful", "Pas utile pour ce projet", "Retire ce contenu de ce projet uniquement."],
] as const;

const action =
  "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.8rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:min-h-10 [&_svg]:size-3.5";

export function FeedItem({ entry, detailHref, demo, showProjects = true, compact }: { entry: FeedEntry; detailHref: string; demo?: boolean; showProjects?: boolean; compact?: boolean }) {
  const { item } = entry;
  const state = useItemState(item.id, { read: entry.isRead, favorite: entry.isFavorite });
  const gone = useDismissed(
    entry.projects.map((p) => p.projectId),
    item.id,
  );
  const projects = entry.projects.filter((p) => !gone.includes(p.projectId));
  if (!projects.length) return null;
  const techs = [...new Set(projects.flatMap((p) => p.matchedTechs))].slice(0, 3);
  const top = projects[0];

  return (
    <article
      aria-labelledby={`t-${item.id}`}
      className={cn("group surface relative animate-rise p-4 has-[[aria-expanded=true]]:z-20 transition-[border-color,box-shadow] duration-200 pointer-fine:hover:border-border-strong pointer-fine:hover:shadow-sm sm:p-5", state.read && "bg-none bg-muted/40 dark:bg-card/60")}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {top && <PriorityBadge priority={top.priority} />}
        <KindBadge kind={item.kind} prerelease={item.isPrerelease} />
        {item.isDemo && <DemoBadge />}
        <span className="truncate">{item.sourceName}</span>
        <span aria-hidden>·</span>
        <PublishedDate iso={item.publishedAt} />
        {state.read && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Check className="size-3" aria-hidden /> Lu
          </span>
        )}
      </div>

      <h3 id={`t-${item.id}`} className={cn("mt-2 text-[0.975rem] leading-snug font-semibold tracking-[-0.01em] text-balance", state.read && "font-medium text-foreground/80")}>
        <Link href={detailHref} scroll={false} className="decoration-primary/60 hover:underline">
          {item.title}
        </Link>
      </h3>
      {!compact &&
        (item.excerpt ? (
          <p className="mt-1.5 line-clamp-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{item.excerpt}</p>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground italic">Titre seulement : la source ne fournit pas d’extrait.</p>
        ))}

      <div className="mt-3 space-y-1.5">
        {projects.map((p) => (
          <p key={p.projectId} className="rounded-lg border-l-2 border-primary/70 bg-accent/50 px-3 py-1.5 text-sm leading-snug dark:bg-accent/30">
            <span className="font-medium text-accent-foreground">{showProjects && projects.length > 1 ? `Pour ${p.projectName} : ` : "Pour ton projet : "}</span>
            <span className="text-foreground/85">{p.why}</span>
          </p>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1">
        {techs.map((t) => (
          <TechBadge key={t}>{getTechnology(t)?.name ?? t}</TechBadge>
        ))}
        <span className="flex-1" />
        {!demo && (
          <>
            <button type="button" className={action} aria-pressed={state.favorite} onClick={() => changeItemState(item.id, "favorite", !state.favorite)}>
              {state.favorite ? <BookmarkCheck className="text-primary" aria-hidden /> : <Bookmark aria-hidden />}
              {state.favorite ? "Enregistré" : "Enregistrer"}
            </button>
            <button type="button" className={action} aria-pressed={state.read} onClick={() => changeItemState(item.id, "read", !state.read, { undo: state.read ? undefined : "Marqué comme lu." })}>
              {state.read ? <Undo2 aria-hidden /> : <Check aria-hidden />}
              {state.read ? "Non lu" : "Marquer comme lu"}
            </button>
          </>
        )}
        <a href={item.url} target="_blank" rel="noopener noreferrer" className={action}>
          <ExternalLink aria-hidden /> Source<span className="sr-only"> originale (nouvel onglet)</span>
        </a>
        {!demo && (
          <Popover
            label={
              <>
                <MoreHorizontal aria-hidden /> <span className="sr-only">Plus d’actions pour « {item.title} »</span>
              </>
            }
          >
            {(close) => (
              <div className="space-y-3">
                <details className="group/act">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-1 py-1 font-medium hover:bg-muted [&::-webkit-details-marker]:hidden">
                    <ListPlus className="size-4" aria-hidden /> Créer une action
                  </summary>
                  <div className="mt-2">
                    <ActionQuickForm compact itemId={item.id} projects={projects.map((p) => ({ id: p.projectId, name: p.projectName }))} defaultTitle={`Étudier : ${item.title}`.slice(0, 300)} />
                  </div>
                </details>
                <div>
                  <p className="mb-1.5 flex items-center gap-2 px-1 font-medium">
                    <ThumbsDown className="size-4" aria-hidden /> Peu pertinent
                  </p>
                  {projects.map((p) => (
                    <div key={p.projectId} className="mb-2 last:mb-0">
                      {projects.length > 1 && <p className="mb-1 px-1 text-xs text-muted-foreground">{p.projectName}</p>}
                      <ul className="grid gap-0.5">
                        {FEEDBACK_REASONS.map(([reason, label, effect]) => (
                          <li key={reason}>
                            <button
                              type="button"
                              title={effect}
                              className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted pointer-coarse:min-h-10"
                              onClick={() => {
                                close();
                                dismissForProject(p.projectId, item.id, reason, label);
                              }}
                            >
                              {label}
                              <span className="block text-xs text-muted-foreground">{effect}</span>
                            </button>
                          </li>
                        ))}
                        <li>
                          <button
                            type="button"
                            className="w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted pointer-coarse:min-h-10"
                            onClick={() => {
                              close();
                              dismissForProject(p.projectId, item.id, "unspecified", "Peu pertinent");
                            }}
                          >
                            Sans préciser
                          </button>
                        </li>
                      </ul>
                    </div>
                  ))}
                  <p className="mt-2 px-1 text-xs text-muted-foreground">Ne concerne que ce projet. Préférences apprises consultables et réinitialisables dans la vue d’ensemble du projet.</p>
                </div>
              </div>
            )}
          </Popover>
        )}
      </div>
    </article>
  );
}

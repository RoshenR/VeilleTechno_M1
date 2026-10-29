"use client";

import { Bookmark, BookmarkCheck, BookmarkX, Check, Undo2 } from "lucide-react";
import { changeItemState, dismissForProject, useDismissed, useItemState } from "@/components/content-state";
import { FEEDBACK_REASONS } from "@/components/feed-item";
import { Button } from "@/components/ui/button";

/** Save / read buttons bound to the shared optimistic store (same state as the feed rows). */
export function ItemStateButtons({ id, read, favorite }: { id: string; read: boolean; favorite: boolean }) {
  const s = useItemState(id, { read, favorite });
  return (
    <>
      <Button size="sm" variant="outline" aria-pressed={s.favorite} onClick={() => changeItemState(id, "favorite", !s.favorite)}>
        {s.favorite ? <BookmarkCheck aria-hidden className="text-primary" /> : <Bookmark aria-hidden />}
        {s.favorite ? "Enregistré" : "Enregistrer"}
      </Button>
      <Button size="sm" variant="outline" aria-pressed={s.read} onClick={() => changeItemState(id, "read", !s.read, { undo: s.read ? undefined : "Marqué comme lu." })}>
        {s.read ? <Undo2 aria-hidden /> : <Check aria-hidden />}
        {s.read ? "Marquer non lu" : "Marquer comme lu"}
      </Button>
    </>
  );
}

/** Remove from favourites (Enregistrés page): immediate, with « Annuler ». */
export function UnfavoriteButton({ id }: { id: string }) {
  const s = useItemState(id, { read: false, favorite: true });
  return (
    <Button size="sm" variant="ghost" aria-pressed={!s.favorite} onClick={() => changeItemState(id, "favorite", !s.favorite, { undo: s.favorite ? "Retiré des enregistrés." : undefined })}>
      {s.favorite ? <BookmarkX aria-hidden /> : <Bookmark aria-hidden />}
      {s.favorite ? "Retirer des enregistrés" : "Enregistrer à nouveau"}
    </Button>
  );
}

export function DetailFeedback({ projectId, itemId }: { projectId: string; itemId: string }) {
  const gone = useDismissed([projectId], itemId).length > 0;
  if (gone) return <p className="text-sm text-muted-foreground">Retour enregistré pour ce projet.</p>;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="mr-1 text-muted-foreground">Peu pertinent :</span>
      {FEEDBACK_REASONS.map(([reason, label, effect]) => (
        <Button key={reason} size="xs" variant="outline" title={effect} onClick={() => dismissForProject(projectId, itemId, reason, label)}>
          {label}
        </Button>
      ))}
    </div>
  );
}

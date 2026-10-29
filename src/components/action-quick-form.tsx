"use client";

import { useActionState } from "react";
import { createAction } from "@/app/(app)/mutations";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Create an action linked to a content item (or standalone when itemId is omitted). */
export function ActionQuickForm({ itemId, projects, defaultTitle, compact }: { itemId?: string; projects: { id: string; name: string }[]; defaultTitle?: string; compact?: boolean }) {
  const [state, action] = useActionState(createAction, undefined);
  const uid = `${itemId ?? "new"}-${compact ? "c" : "f"}`;
  if (!projects.length) return <p className="text-sm text-muted-foreground">Crée d’abord un projet pour y rattacher des actions.</p>;
  return (
    <form action={action} className="grid gap-2">
      {itemId && <input type="hidden" name="content_item_id" value={itemId} />}
      {projects.length === 1 ? (
        <input type="hidden" name="project_id" value={projects[0].id} />
      ) : (
        <div className="grid gap-1">
          <Label htmlFor={`p-${uid}`}>Projet</Label>
          <select id={`p-${uid}`} name="project_id" className="h-8 rounded-lg border bg-background px-2 text-sm" required>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid gap-1">
        <Label htmlFor={`t-${uid}`}>Action</Label>
        <Input id={`t-${uid}`} name="title" defaultValue={defaultTitle} required maxLength={300} />
      </div>
      {!compact && (
        <div className="grid gap-1">
          <Label htmlFor={`n-${uid}`}>Note (facultatif)</Label>
          <Textarea id={`n-${uid}`} name="note" rows={2} maxLength={5000} />
        </div>
      )}
      <div className="flex items-center gap-3">
        <SubmitButton size="sm">Créer l’action</SubmitButton>
        <p aria-live="polite" className="text-xs">
          {state?.error && <span className="text-destructive">{state.error}</span>}
          {state?.message && <span className="text-primary">{state.message}</span>}
        </p>
      </div>
    </form>
  );
}

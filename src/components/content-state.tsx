"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { giveFeedback, setFavorite, setRead, undoFeedbackForItem } from "@/app/(app)/mutations";

// Client-side store shared by every view of a content item (feed row, highlight, detail panel…).
// Optimistic: the override is applied at once, confirmed by the server, rolled back on failure.
// Each (item, field) keeps a request counter, so a slow response never overwrites a newer click.

type Field = "read" | "favorite";
const overrides = new Map<string, boolean>();
const seq = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const useStoreVersion = () => useSyncExternalStore(subscribe, () => version, () => 0);

export function useItemState(id: string, initial: { read: boolean; favorite: boolean }) {
  useStoreVersion();
  return { read: overrides.get(`${id}:read`) ?? initial.read, favorite: overrides.get(`${id}:favorite`) ?? initial.favorite };
}

/** Optimistic update with server confirmation, ordered responses and rollback + retry on failure. */
export async function changeItemState(id: string, field: Field, value: boolean, opts: { undo?: string } = {}): Promise<void> {
  const key = `${id}:${field}`;
  const previous = overrides.get(key) ?? !value;
  const n = (seq.get(key) ?? 0) + 1;
  seq.set(key, n);
  overrides.set(key, value);
  emit();
  let ok = false;
  try {
    ok = (await (field === "favorite" ? setFavorite(id, value) : setRead(id, value))).ok;
  } catch {
    ok = false;
  }
  if (seq.get(key) !== n) return; // superseded by a newer click: its own response decides
  if (!ok) {
    overrides.set(key, previous);
    emit();
    toast({ message: field === "favorite" ? "L’enregistrement n’a pas abouti." : "Le changement de lecture n’a pas abouti.", action: { label: "Réessayer", run: () => changeItemState(id, field, value, opts) } });
    return;
  }
  if (opts.undo) toast({ message: opts.undo, action: { label: "Annuler", run: () => changeItemState(id, field, !value) } });
}

// « Peu pertinent »: hidden at once for that project, restored if the server refuses or on « Annuler ».
const dismissed = new Set<string>();
export function useDismissed(projectIds: string[], itemId: string) {
  useStoreVersion();
  return projectIds.filter((p) => dismissed.has(`${p}:${itemId}`));
}
export async function dismissForProject(projectId: string, itemId: string, reason: string, label: string) {
  const key = `${projectId}:${itemId}`;
  dismissed.add(key);
  if (reason === "already_known") overrides.set(`${itemId}:read`, true);
  emit();
  const res = await giveFeedback(projectId, itemId, reason).catch(() => ({ ok: false }));
  if (!res.ok) {
    dismissed.delete(key);
    emit();
    toast({ message: "Le retour n’a pas pu être enregistré.", action: { label: "Réessayer", run: () => dismissForProject(projectId, itemId, reason, label) } });
    return;
  }
  toast({
    message: `Retour « ${label} » enregistré pour ce projet.`,
    action: {
      label: "Annuler",
      run: async () => {
        dismissed.delete(key);
        emit();
        const r = await undoFeedbackForItem(projectId, itemId).catch(() => ({ ok: false }));
        if (!r.ok) {
          dismissed.add(key);
          emit();
          toast({ message: "Annulation impossible pour le moment." });
        }
      },
    },
  });
}

// ───────────────────────── Notifications (never take focus) ─────────────────────────

type Toast = { id: number; message: string; action?: { label: string; run: () => void } };
let toasts: Toast[] = [];
let nextId = 1;
const toastListeners = new Set<() => void>();
export function toast(t: Omit<Toast, "id">) {
  toasts = [...toasts.slice(-2), { ...t, id: nextId++ }];
  for (const l of toastListeners) l();
}
const dismissToast = (id: number) => {
  toasts = toasts.filter((t) => t.id !== id);
  for (const l of toastListeners) l();
};

export function ToastViewport() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
    () => toasts,
  );
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6">
      {list.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}

function ToastItem({ t }: { t: Toast }) {
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (paused) return;
    timer.current = setTimeout(() => dismissToast(t.id), 6000);
    return () => clearTimeout(timer.current);
  }, [paused, t.id]);
  return (
    <div
      className="surface-raised pointer-events-auto flex w-full max-w-sm animate-rise items-center gap-3 px-4 py-2.5 text-sm"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p className="flex-1">{t.message}</p>
      {t.action && (
        <button
          type="button"
          className="rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-accent pointer-coarse:min-h-10"
          onClick={() => {
            dismissToast(t.id);
            t.action!.run();
          }}
        >
          {t.action.label}
        </button>
      )}
      <button type="button" aria-label="Fermer la notification" className="rounded-md p-1 text-muted-foreground hover:bg-muted pointer-coarse:min-h-10" onClick={() => dismissToast(t.id)}>
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

"use client";

import { Maximize2, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Side panel for a content detail opened from a list (intercepted route). Modal <dialog>: focus is
 * contained, Échap closes, focus returns to the trigger; closing goes back in history, so filters,
 * selected project and scroll position of the list are untouched. Full screen on small viewports.
 */
export function DetailSheet({ children, titleId }: { children: React.ReactNode; titleId: string }) {
  const path = usePathname();
  // A soft navigation elsewhere keeps the slot's last state: the panel only exists on /contenu/… URLs.
  if (!path.startsWith("/contenu/")) return null;
  return (
    <Sheet key={path} titleId={titleId} path={path}>
      {children}
    </Sheet>
  );
}

function Sheet({ children, titleId, path }: { children: React.ReactNode; titleId: string; path: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    // The element that opened the panel: the focused link, or (mouse click without focus) the link to this URL.
    const active = document.activeElement;
    // (The loading skeleton is its own panel: focus inside a dialog is never the opener.)
    opener.current = active && active !== document.body && !active.closest("dialog") ? active : document.querySelector(`main a[href^="${path}"]`);
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const restore = opener.current;
    return () => {
      // After the router has finished restoring the list (it may move focus itself).
      if (restore instanceof HTMLElement) setTimeout(() => restore.isConnected && restore.focus({ preventScroll: true }), 60);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- captured once, when the panel opens
  }, []);

  const close = () => router.back();

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => e.target === ref.current && close()}
      className="m-0 ml-auto h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 backdrop:bg-background/50 backdrop:backdrop-blur-[2px] md:w-[min(44rem,92vw)]"
    >
      <div className="flex h-full flex-col border-l border-border-strong bg-background shadow-float [animation:sheet-in_var(--dur-slow)_var(--ease-out-soft)_both]">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <p className="eyebrow">Détail</p>
          <div className="flex items-center gap-1">
            {/* Full load on purpose: a soft navigation would be intercepted into the panel again. */}
            <a href={path} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground pointer-coarse:min-h-10">
              <Maximize2 className="size-3.5" aria-hidden /> Pleine page
            </a>
            <button type="button" onClick={close} aria-label="Fermer le détail (Échap)" className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-6 md:px-8">{children}</div>
      </div>
    </dialog>
  );
}

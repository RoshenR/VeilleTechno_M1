"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Small disclosure menu: click/tap to open (never hover-only), Échap or click outside to close,
 * focus returns to the trigger. Content stays in the DOM order for keyboard and screen readers.
 */
export function Popover({ label, children, className, align = "end", triggerClassName }: { label: React.ReactNode; children: (close: () => void) => React.ReactNode; className?: string; align?: "start" | "end"; triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const triggerId = `${id}-trigger`;
  const close = useCallback(
    (refocus = true) => {
      setOpen(false);
      if (refocus) document.getElementById(triggerId)?.focus();
    },
    [triggerId],
  );
  const closeAndFocus = useCallback(() => close(true), [close]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, close]);
  return (
    <div ref={root} className="relative">
      <button
        id={triggerId}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.8rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground pointer-coarse:min-h-10 [&_svg]:size-3.5",
          triggerClassName,
        )}
      >
        {label}
      </button>
      {open && (
        <div id={id} className={cn("surface-raised absolute z-40 mt-1.5 w-72 animate-rise p-3 text-sm", align === "end" ? "right-0" : "left-0", className)}>
          {children(closeAndFocus)}
        </div>
      )}
    </div>
  );
}

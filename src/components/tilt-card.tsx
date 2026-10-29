"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

const MAX_DEG = 3;

/** Light perspective on precise pointers only (mouse/trackpad); text stays flat enough to read and select. Disabled by reduced motion and the effects setting (CSS). */
export function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--ry", `${(((e.clientX - r.left) / r.width) * 2 - 1) * MAX_DEG}deg`);
    ref.current.style.setProperty("--rx", `${-(((e.clientY - r.top) / r.height) * 2 - 1) * MAX_DEG}deg`);
  };
  const reset = () => {
    ref.current?.style.setProperty("--rx", "0deg");
    ref.current?.style.setProperty("--ry", "0deg");
  };
  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={reset} className={cn("tilt-card h-full", className)}>
      {children}
    </div>
  );
}

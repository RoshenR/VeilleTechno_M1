"use client";

import { useEffect, useRef, useState } from "react";
import type { RadarHandle } from "./radar-scene";

/**
 * Decorative radar. The static SVG is the default and the fallback (no WebGL, effects disabled,
 * reduced motion, small screens); the WebGL scene is loaded lazily after first paint, in its own chunk,
 * into a box whose size is reserved up front (no layout shift). One canvas at most on the page.
 */
export function Radar({ effects, syncing, className }: { effects: boolean; syncing: boolean; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<RadarHandle | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!effects || !canvas.current || !box.current) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(max-width: 767px)").matches) return;
    let cancelled = false;
    const el = canvas.current;
    const root = box.current;
    const idle = (cb: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 300));
    let io: IntersectionObserver | undefined;
    const onVisibility = () => handle.current?.setActive(document.visibilityState === "visible");
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = root.getBoundingClientRect();
      handle.current?.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
    };
    const onLeave = () => handle.current?.leave();

    idle(async () => {
      try {
        const { createRadar } = await import("./radar-scene");
        if (cancelled) return;
        handle.current = createRadar(el, { dark: document.documentElement.classList.contains("dark"), syncing });
        setLive(true);
        io = new IntersectionObserver(([entry]) => handle.current?.setActive(entry.isIntersecting && document.visibilityState === "visible"));
        io.observe(root);
        document.addEventListener("visibilitychange", onVisibility);
        root.addEventListener("pointermove", onMove);
        root.addEventListener("pointerleave", onLeave);
      } catch {
        // WebGL unavailable or blocked: the static rendering stays.
        setLive(false);
      }
    });
    return () => {
      cancelled = true;
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      handle.current?.dispose();
      handle.current = null;
      setLive(false);
    };
    // The scene is created once per mount; `syncing` updates go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effects]);

  useEffect(() => {
    handle.current?.setSyncing(syncing);
  }, [syncing]);

  return (
    <div ref={box} aria-hidden className={className ?? "relative"}>
      <StaticRadar className={live ? "opacity-0 transition-opacity duration-300" : "opacity-100"} syncing={syncing && !live} />
      <canvas ref={canvas} className={`absolute inset-0 size-full transition-opacity duration-300 ${live ? "opacity-100" : "opacity-0"}`} />
    </div>
  );
}

/** Static rendering: same composition, flat. Elegant on its own when effects are off. */
export function StaticRadar({ className = "", syncing = false }: { className?: string; syncing?: boolean }) {
  return (
    <svg viewBox="0 0 200 200" className={`absolute inset-0 size-full ${className}`}>
      <defs>
        <radialGradient id="rg-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--glow)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--glow)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rg-disc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--card)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--muted)" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <g transform="translate(100 108) scale(1 0.56)">
        <ellipse r="82" fill="url(#rg-disc)" stroke="var(--border-strong)" strokeWidth="1.6" />
        <ellipse r="56" fill="none" stroke="var(--border-strong)" strokeWidth="1.6" />
        <ellipse r="29" fill="none" stroke="var(--glow)" strokeWidth="2.4" />
        <path d="M0 0 L82 0 A82 82 0 0 0 63 -52 Z" fill="var(--glow)" opacity="0.14">
          {syncing && <animateTransform attributeName="transform" type="rotate" from="0" to="-360" dur="3s" repeatCount="indefinite" />}
        </path>
        <line x1="-82" y1="0" x2="82" y2="0" stroke="var(--grid-line)" strokeWidth="1.2" />
        <line x1="0" y1="-82" x2="0" y2="82" stroke="var(--grid-line)" strokeWidth="1.2" />
      </g>
      <circle cx="100" cy="100" r="26" fill="url(#rg-core)" />
      <circle cx="100" cy="100" r="7" fill="var(--glow)" />
    </svg>
  );
}

"use client";

import { ChevronDown, CircleHelp, FolderKanban, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { openPalette, openShortcuts } from "@/components/command-palette";
import { Popover } from "@/components/popover";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";

/** Reflects the « Effets visuels » preference on <html> so CSS can turn motion off globally. */
export function EffectsAttr({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    document.documentElement.dataset.effects = enabled ? "on" : "off";
  }, [enabled]);
  return null;
}

export function BrandMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeOpacity=".6" strokeWidth="1.5" />
      <path d="M12 12 L21.5 9 A10 10 0 0 0 17 3.3 Z" fill="var(--glow)" opacity=".5" />
      <circle cx="12" cy="12" r="2.3" fill="var(--glow)" />
    </svg>
  );
}

/** Top bar: project selection, search (opens the palette), primary actions, help. */
export function AppHeader({ projects }: { projects: { id: string; name: string; archived: boolean }[] }) {
  const params = useParams<{ id?: string }>();
  const path = usePathname();
  const sp = useSearchParams();
  const currentId = path.startsWith("/projets/") ? params.id : (sp.get("projet") ?? undefined);
  const current = projects.find((p) => p.id === currentId);
  const active = projects.filter((p) => !p.archived);

  return (
    <div className="flex h-14 items-center gap-2 px-4 md:px-6">
      <Popover
        align="start"
        triggerClassName="h-9 max-w-[11rem] gap-2 border border-border-strong bg-card px-3 text-foreground shadow-xs hover:bg-muted sm:max-w-[14rem]"
        label={
          <>
            <FolderKanban aria-hidden className="text-primary" />
            <span className="truncate">{current?.name ?? "Tous mes projets"}</span>
            <ChevronDown aria-hidden />
            <span className="sr-only"> — changer de projet</span>
          </>
        }
      >
        {(close) => (
          <nav aria-label="Choisir un projet" className="-m-1">
            <p className="eyebrow px-2 pt-1 pb-2">Projet affiché</p>
            <ul className="grid gap-0.5">
              <li>
                <Link onClick={close} href="/veille" className="block rounded-md px-2 py-1.5 hover:bg-muted pointer-coarse:py-2.5" aria-current={!current ? "true" : undefined}>
                  Tous mes projets
                </Link>
              </li>
              {active.map((p) => (
                <li key={p.id}>
                  <Link onClick={close} href={`/veille?projet=${p.id}`} className="block truncate rounded-md px-2 py-1.5 hover:bg-muted aria-[current=true]:bg-accent aria-[current=true]:text-accent-foreground pointer-coarse:py-2.5" aria-current={p.id === current?.id ? "true" : undefined}>
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
            {!active.length && <p className="px-2 py-2 text-xs text-muted-foreground">Aucun projet actif pour l’instant.</p>}
            <div className="mt-2 border-t pt-2">
              <Link onClick={close} href="/projets" className="block rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted">
                Gérer mes projets
              </Link>
            </div>
          </nav>
        )}
      </Popover>

      <button
        type="button"
        onClick={openPalette}
        className="ml-auto flex size-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-card/70 text-sm text-muted-foreground shadow-xs transition-colors hover:border-border-strong hover:text-foreground md:ml-2 md:w-72 md:justify-start md:px-3"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="hidden truncate md:inline">Rechercher…</span>
        <span className="sr-only md:hidden">Rechercher</span>
        <span className="ml-auto hidden items-center gap-0.5 md:flex">
          <kbd className="kbd">Ctrl</kbd>
          <kbd className="kbd">K</kbd>
        </span>
      </button>

      <div className="flex items-center gap-1 md:ml-auto">
        <Link href="/projets/nouveau" className={buttonVariants({ size: "sm", className: "h-9 px-3 max-sm:hidden" })}>
          <Plus aria-hidden /> Nouveau projet
        </Link>
        <button type="button" onClick={openShortcuts} className={buttonVariants({ variant: "ghost", size: "icon", className: "max-md:hidden" })} aria-label="Aide : raccourcis clavier">
          <CircleHelp aria-hidden />
        </button>
        <ThemeToggle />
      </div>
    </div>
  );
}

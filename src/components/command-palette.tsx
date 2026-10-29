"use client";

import { ArrowRight, CornerDownLeft, ExternalLink, FileText, FolderKanban, Keyboard, Link2, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { searchPalette, type PaletteHit } from "@/app/(app)/mutations";
import { NAV } from "@/components/app-nav";

type Entry = { id: string; group: string; title: string; hint?: string; href: string; external?: boolean; icon: React.ComponentType<{ className?: string }> };

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function openPalette() {
  window.dispatchEvent(new Event("stacksignal:palette"));
}
export function openShortcuts() {
  window.dispatchEvent(new Event("stacksignal:shortcuts"));
}

/** Ctrl/Cmd + K: pages, the user's own projects and contents (searched server-side under RLS), create a project. */
export function CommandPalette({ projects }: { projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const help = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PaletteHit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const reqId = useRef(0);

  useEffect(() => {
    const open = () => {
      if (!dialog.current?.open) {
        setQ("");
        setHits([]);
        setActive(0);
        dialog.current?.showModal();
        input.current?.focus();
      }
    };
    const openHelp = () => help.current?.showModal();
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      } else if (e.key === "?" && !isTyping(e.target) && !e.metaKey && !e.ctrlKey && !dialog.current?.open) {
        e.preventDefault();
        openHelp();
      } else if (e.key === "/" && !isTyping(e.target) && !dialog.current?.open) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("stacksignal:palette", open);
    window.addEventListener("stacksignal:shortcuts", openHelp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("stacksignal:palette", open);
      window.removeEventListener("stacksignal:shortcuts", openHelp);
    };
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const id = ++reqId.current;
    const t = setTimeout(() => {
      start(async () => {
        const res = await searchPalette(term).catch(() => []);
        if (id === reqId.current) setHits(res); // ignore out-of-order responses
      });
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const entries = useMemo<Entry[]>(() => {
    const term = q.trim().toLowerCase();
    const match = (s: string) => !term || s.toLowerCase().includes(term);
    const local: Entry[] = [
      ...NAV.filter((n) => match(n.label)).map((n) => ({ id: n.href, group: "Pages", title: n.label, href: n.href, icon: n.icon })),
      ...(match("créer un projet nouveau") ? [{ id: "new", group: "Actions", title: "Créer un projet", href: "/projets/nouveau", icon: Plus }] : []),
      ...(term ? [] : projects.slice(0, 6).map((p) => ({ id: `p-${p.id}`, group: "Projets", title: p.name, href: `/projets/${p.id}`, icon: FolderKanban }))),
    ];
    const remote: Entry[] = (term.length < 2 ? [] : hits).map((h) => ({
      id: `${h.kind}-${h.id}`,
      group: h.kind === "project" ? "Projets" : h.kind === "content" ? "Contenus" : "Ressources",
      title: h.title,
      hint: h.hint,
      href: h.href,
      external: h.external,
      icon: h.kind === "project" ? FolderKanban : h.kind === "content" ? FileText : Link2,
    }));
    return [...local, ...remote];
  }, [q, hits, projects]);

  const go = (e: Entry) => {
    dialog.current?.close();
    if (e.external) window.open(e.href, "_blank", "noopener,noreferrer");
    else router.push(e.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(entries.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && entries[active]) {
      e.preventDefault();
      go(entries[active]);
    }
  };

  let lastGroup = "";
  return (
    <>
      <dialog
        ref={dialog}
        aria-label="Palette de commandes"
        className="surface-raised m-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] p-0 text-foreground backdrop:bg-background/60 backdrop:backdrop-blur-sm open:animate-rise"
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={entries[active] ? `pal-${entries[active].id}` : undefined}
            aria-label="Rechercher un projet, une page ou un contenu"
            placeholder="Rechercher un projet, une page, un contenu…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="kbd">Échap</kbd>
        </div>
        <ul id="palette-list" role="listbox" aria-label="Résultats" className="max-h-[50vh] overflow-y-auto p-2">
          {entries.map((e, i) => {
            const header = e.group !== lastGroup ? e.group : null;
            lastGroup = e.group;
            return (
              <li key={e.id} role="presentation">
                {header && <p className="eyebrow px-2 pt-2 pb-1">{header}</p>}
                <div
                  id={`pal-${e.id}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(e)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
                >
                  <e.icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{e.title}</span>
                  {e.hint && <span className="truncate text-xs text-muted-foreground">{e.hint}</span>}
                  {e.external ? <ExternalLink className="size-3.5 text-muted-foreground" /> : i === active ? <CornerDownLeft className="size-3.5 text-muted-foreground" /> : <ArrowRight className="size-3.5 opacity-0" />}
                </div>
              </li>
            );
          })}
          {!entries.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{pending ? "Recherche…" : "Aucun résultat dans tes projets."}</li>}
        </ul>
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> naviguer · <kbd className="kbd">Entrée</kbd> ouvrir · recherche limitée à tes propres données
        </p>
      </dialog>

      <dialog ref={help} aria-labelledby="shortcuts-title" className="surface-raised m-auto w-[min(26rem,calc(100vw-2rem))] p-5 text-foreground backdrop:bg-background/60 backdrop:backdrop-blur-sm" onClick={(e) => e.target === help.current && help.current?.close()}>
        <h2 id="shortcuts-title" className="flex items-center gap-2 font-semibold">
          <Keyboard className="size-4" aria-hidden /> Raccourcis clavier
        </h2>
        <dl className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-sm">
          <dt>
            <kbd className="kbd">Ctrl</kbd> <kbd className="kbd">K</kbd> <span className="text-xs text-muted-foreground">ou</span> <kbd className="kbd">/</kbd>
          </dt>
          <dd>Palette de commandes</dd>
          <dt>
            <kbd className="kbd">Échap</kbd>
          </dt>
          <dd>Fermer un panneau, un menu ou une fenêtre</dd>
          <dt>
            <kbd className="kbd">?</kbd>
          </dt>
          <dd>Afficher cette aide</dd>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">Les raccourcis à une touche sont ignorés pendant la saisie dans un champ.</p>
        <form method="dialog" className="mt-4 text-right">
          <button className="rounded-lg border border-border-strong bg-card px-3 py-1.5 text-sm hover:bg-muted pointer-coarse:min-h-10">Fermer</button>
        </form>
      </dialog>
    </>
  );
}

"use client";

import { Bookmark, CalendarRange, FolderKanban, ListChecks, Radar, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/veille", label: "Ma veille", short: "Veille", icon: Radar },
  { href: "/synthese", label: "Synthèse de la semaine", short: "Synthèse", icon: CalendarRange },
  { href: "/projets", label: "Mes projets", short: "Projets", icon: FolderKanban },
  { href: "/enregistres", label: "Enregistrés", short: "Enregistrés", icon: Bookmark },
  { href: "/actions", label: "Actions", short: "Actions", icon: ListChecks },
  { href: "/parametres", label: "Paramètres", short: "Réglages", icon: Settings },
] as const;

export function AppNav({ variant, isAdmin = false }: { variant: "sidebar" | "bar"; isAdmin?: boolean }) {
  const path = usePathname();
  const items = [...NAV.filter((n) => variant === "sidebar" || n.href !== "/actions"), ...(isAdmin && variant === "sidebar" ? [{ href: "/moderation", label: "Modération", short: "Modération", icon: ShieldCheck }] : [])];
  return (
    <ul className={variant === "sidebar" ? "grid gap-0.5" : "grid grid-cols-5"}>
      {items.map(({ href, label, short, icon: Icon }) => {
        const active = path === href || path.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                variant === "sidebar"
                  ? "relative flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors duration-150 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                  : "flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[0.7rem]",
                active
                  ? variant === "sidebar"
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-xs before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:rounded-full before:bg-primary"
                    : "font-medium text-primary"
                  : "text-muted-foreground",
              )}
            >
              <Icon className={cn("size-4", active && "text-primary")} aria-hidden />
              {variant === "sidebar" ? label : short}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

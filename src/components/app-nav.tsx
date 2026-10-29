"use client";

import { Bookmark, FolderKanban, ListChecks, Radar, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/veille", label: "Ma veille", icon: Radar },
  { href: "/projets", label: "Mes projets", icon: FolderKanban },
  { href: "/enregistres", label: "Enregistrés", icon: Bookmark },
  { href: "/actions", label: "Actions", icon: ListChecks },
  { href: "/parametres", label: "Paramètres", icon: Settings },
] as const;

export function AppNav({ variant }: { variant: "sidebar" | "bar" }) {
  const path = usePathname();
  return (
    <ul className={variant === "sidebar" ? "grid gap-0.5" : "flex justify-around"}>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                variant === "sidebar"
                  ? "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent"
                  : "flex flex-col items-center gap-0.5 px-2 py-1.5 text-[0.7rem]",
                active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

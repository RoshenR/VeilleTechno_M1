import { LogOut } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/(auth)/actions";
import { AppHeader, BrandMark, EffectsAttr } from "@/components/app-header";
import { AppNav } from "@/components/app-nav";
import { CommandPalette } from "@/components/command-palette";
import { ToastViewport } from "@/components/content-state";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children, panel }: { children: React.ReactNode; panel: React.ReactNode }) {
  const { email, supabase, userId } = await requireUser();
  const [{ data: projects }, { data: prefs }, { data: isAdmin }] = await Promise.all([
    supabase.from("projects").select("id, name, archived_at").order("name"),
    supabase.from("preferences").select("visual_effects").eq("user_id", userId).maybeSingle(),
    supabase.rpc("is_admin"),
  ]);
  const list = (projects ?? []).map((p) => ({ id: p.id, name: p.name, archived: Boolean(p.archived_at) }));
  return (
    <div className="flex min-h-dvh flex-1">
      <EffectsAttr enabled={prefs?.visual_effects ?? true} />
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:shadow-md">
        Aller au contenu
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 md:flex">
        <Link href="/veille" className="mb-6 flex items-center gap-2 px-3 text-[0.95rem] font-semibold tracking-tight text-foreground">
          <BrandMark className="size-6 text-foreground" />
          Stack<span className="-ml-2 text-primary">Signal</span>
        </Link>
        <nav aria-label="Navigation principale">
          <AppNav variant="sidebar" isAdmin={isAdmin === true} />
        </nav>
        <div className="mt-auto space-y-1 border-t border-sidebar-border pt-3">
          <p className="truncate px-3 text-xs text-muted-foreground" title={email ?? undefined}>
            {email}
          </p>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start px-3 text-muted-foreground">
              <LogOut aria-hidden /> Déconnexion
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
          <Suspense fallback={<div className="h-14" />}>
            <AppHeader projects={list} />
          </Suspense>
        </header>
        <main id="contenu" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 outline-none md:px-8 md:pb-12">
          {children}
        </main>
        <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
          <AppNav variant="bar" />
        </nav>
      </div>
      {panel}
      <CommandPalette projects={list.filter((p) => !p.archived)} />
      <ToastViewport />
    </div>
  );
}

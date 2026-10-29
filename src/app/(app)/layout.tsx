import { LogOut } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { AppNav } from "@/components/app-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireUser();
  return (
    <div className="flex min-h-dvh flex-1">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-background focus:p-2">
        Aller au contenu
      </a>
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r bg-sidebar p-3 md:flex">
        <Link href="/veille" className="mb-4 px-3 py-2 text-lg font-semibold tracking-tight">
          Stack<span className="text-primary">Signal</span>
        </Link>
        <nav aria-label="Navigation principale">
          <AppNav variant="sidebar" />
        </nav>
        <div className="mt-auto space-y-2 border-t pt-3">
          <p className="truncate px-3 text-xs text-muted-foreground" title={email ?? undefined}>
            {email}
          </p>
          <div className="flex items-center gap-1 px-1">
            <ThemeToggle />
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                <LogOut aria-hidden /> Déconnexion
              </Button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/95 px-4 py-2 backdrop-blur md:hidden">
          <Link href="/veille" className="font-semibold">
            Stack<span className="text-primary">Signal</span>
          </Link>
          <div className="flex items-center">
            <ThemeToggle />
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="icon" aria-label="Déconnexion">
                <LogOut aria-hidden />
              </Button>
            </form>
          </div>
        </header>
        <main id="contenu" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">
          {children}
        </main>
        <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur md:hidden">
          <AppNav variant="bar" />
        </nav>
      </div>
    </div>
  );
}

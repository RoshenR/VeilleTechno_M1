import Link from "next/link";
import { BrandMark } from "@/components/app-header";
import { StaticRadar } from "@/components/radar/radar";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="radar-grid relative flex flex-1 items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute -top-24 -right-24 size-[420px] opacity-60" aria-hidden>
        <StaticRadar />
      </div>
      <div className="relative w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <p className="inline-flex items-center gap-2 text-xl font-semibold tracking-tight">
            <BrandMark className="size-7" />
            Stack<span className="-ml-2 text-primary">Signal</span>
          </p>
          <p className="text-sm text-muted-foreground">Transforme tes idées de projet en veille utile pour les concrétiser et les faire évoluer.</p>
        </div>
        <div className="surface-raised p-6">{children}</div>
        <p className="text-center text-sm text-muted-foreground">
          Envie de voir avant de t’inscrire ?{" "}
          <Link href="/demo" className="font-medium text-foreground underline">
            Voir la démonstration
          </Link>
        </p>
      </div>
    </main>
  );
}

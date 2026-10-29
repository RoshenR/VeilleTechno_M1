import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <p className="text-xl font-semibold tracking-tight">
            Stack<span className="text-primary">Signal</span>
          </p>
          <p className="text-sm text-muted-foreground">Transforme tes idées de projet en veille utile pour les concrétiser et les faire évoluer.</p>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">{children}</div>
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

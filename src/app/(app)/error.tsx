"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md space-y-3 rounded-xl border p-6 text-center">
      <p className="font-medium">Une erreur est survenue.</p>
      <p className="text-sm text-muted-foreground">Tes données ne sont pas perdues. Réessaie ; si le problème persiste, vérifie la configuration de Supabase.</p>
      {error.digest && <p className="font-mono text-xs text-muted-foreground">Référence : {error.digest}</p>}
      <Button onClick={reset}>Réessayer</Button>
    </div>
  );
}

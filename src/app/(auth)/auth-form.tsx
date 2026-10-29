"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthState } from "./actions";

export function AuthForm({
  action,
  fields,
  submitLabel,
}: {
  action: (s: AuthState, f: FormData) => Promise<AuthState>;
  fields: ("email" | "password" | "new-password")[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const pwd = fields.includes("password") ? "password" : fields.includes("new-password") ? "new-password" : null;
  return (
    <form action={formAction} className="grid gap-4">
      {fields.includes("email") && (
        <div className="grid gap-1.5">
          <Label htmlFor="email">Adresse e-mail</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
      )}
      {pwd && (
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{pwd === "new-password" ? "Mot de passe (8 caractères minimum)" : "Mot de passe"}</Label>
            {pwd === "password" && (
              <Link href="/mot-de-passe" className="text-xs text-muted-foreground underline">
                Mot de passe oublié ?
              </Link>
            )}
          </div>
          <Input id="password" name="password" type="password" minLength={8} autoComplete={pwd === "password" ? "current-password" : "new-password"} required />
        </div>
      )}
      <div aria-live="polite" className="text-sm">
        {state?.error && <p className="text-destructive">{state.error}</p>}
        {state?.message && <p className="text-primary">{state.message}</p>}
      </div>
      <SubmitButton pendingLabel="Patiente…">{submitLabel}</SubmitButton>
    </form>
  );
}

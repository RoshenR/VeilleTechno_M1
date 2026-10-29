"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(app)/mutations";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/utils";

/** Form wired to a (state, formData) server action, with an accessible status line. */
export function StateForm({ action, submitLabel, children, className }: { action: (s: FormState, f: FormData) => Promise<FormState>; submitLabel: string; children: React.ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={cn("grid gap-3", className)}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="sm">{submitLabel}</SubmitButton>
        <p aria-live="polite" className="text-xs">
          {state?.error && <span className="text-destructive">{state.error}</span>}
          {state?.message && <span className="text-primary">{state.message}</span>}
        </p>
      </div>
    </form>
  );
}

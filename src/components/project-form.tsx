"use client";

import { Sparkles } from "lucide-react";
import { useActionState, useMemo, useState, useTransition } from "react";
import { suggestTagsWithAi, type FormState } from "@/app/(app)/mutations";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FEATURE_KEYS, FEATURES, PROJECT_TYPE_LABELS, PROJECT_TYPES, STAGE_LABELS, STAGES, type FeatureKey } from "@/domain/projects";
import { detectTechnologies, getTechnology } from "@/domain/technologies";

const EXAMPLES = [
  "SaaS de réservation pour salons de coiffure : agenda en ligne, rappels par SMS et paiement d’un acompte. Next.js et PostgreSQL.",
  "Application mobile de liste de courses partagée qui doit fonctionner hors ligne et se synchroniser ensuite. Expo envisagé.",
  "Idée : une plateforme de cours vidéo pour artisans, avec abonnement mensuel. Pas encore de stack choisie.",
];

type Defaults = {
  name?: string;
  description?: string;
  problem?: string | null;
  audience?: string | null;
  project_type?: string;
  stage?: string;
  features?: string[];
  constraints?: string | null;
  notes?: string | null;
};

const select = "h-9 w-full rounded-lg border bg-background px-2 text-sm";

export function ProjectForm({ action, defaults = {}, mode, aiAvailable }: { action: (s: FormState, f: FormData) => Promise<FormState>; defaults?: Defaults; mode: "create" | "edit"; aiAvailable: boolean }) {
  const [state, formAction] = useActionState(action, undefined);
  const [description, setDescription] = useState(defaults.description ?? "");
  const [features, setFeatures] = useState<Set<string>>(new Set(defaults.features ?? []));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [aiTechs, setAiTechs] = useState<string[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPending, startAi] = useTransition();

  // Deterministic suggestions from the alias catalog: proposals only, the user ticks what applies.
  const detected = useMemo(() => [...new Set([...detectTechnologies(description).map((t) => t.key), ...aiTechs])], [description, aiTechs]);
  const toggle = (set: Set<string>, key: string, update: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    update(next);
  };

  function askAi() {
    setAiError(null);
    startAi(async () => {
      const res = await suggestTagsWithAi(description);
      if ("error" in res) setAiError(res.error);
      else {
        setAiTechs(res.technologies);
        // Suggested needs are shown pre-highlighted but still need the user's tick.
        setAiError(res.features.length ? `Besoins suggérés (à cocher si pertinents) : ${res.features.map((f) => FEATURES[f as FeatureKey]?.label ?? f).join(", ")}.` : null);
      }
    });
  }

  return (
    <form action={formAction} className="grid gap-6">
      <div className="grid gap-1.5">
        <Label htmlFor="name">Nom du projet *</Label>
        <Input id="name" name="name" required maxLength={120} defaultValue={defaults.name} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="description">Courte description *</Label>
        <Textarea id="description" name="description" required maxLength={2000} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} aria-describedby="desc-help" />
        <p id="desc-help" className="text-xs text-muted-foreground">
          Ce que tu construis, pour qui, et ce qui compte. Une idée sans stack suffit.
        </p>
        {mode === "create" && !description && (
          <div className="flex flex-wrap gap-1.5" aria-label="Exemples de descriptions">
            {EXAMPLES.map((ex, i) => (
              <Button key={i} type="button" size="xs" variant="outline" onClick={() => setDescription(ex)}>
                Exemple {i + 1}
              </Button>
            ))}
          </div>
        )}
      </div>

      {mode === "create" && (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Stack (facultatif)</legend>
          {detected.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Technologies repérées dans ta description — à confirmer :</p>
              <div className="flex flex-wrap gap-1.5">
                {detected.map((k) => (
                  <label key={k} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-sm has-checked:border-primary has-checked:bg-accent">
                    <input type="checkbox" name="techs" value={k} checked={picked.has(k)} onChange={() => toggle(picked, k, setPicked)} />
                    {getTechnology(k)?.name ?? k}
                    {aiTechs.includes(k) && <span className="text-xs text-muted-foreground">(IA)</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
          <Input name="custom_techs" placeholder="Autres technologies, séparées par des virgules (ex. Next.js, htmx)" aria-label="Autres technologies" maxLength={600} />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" name="stack_status" value="used" defaultChecked /> Stack actuelle
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" name="stack_status" value="considered" /> Stack envisagée
            </label>
            {aiAvailable && (
              <Button type="button" size="sm" variant="outline" onClick={askAi} disabled={aiPending || description.trim().length < 10}>
                <Sparkles aria-hidden /> {aiPending ? "Analyse…" : "Suggérer avec l’IA"}
              </Button>
            )}
          </div>
          {aiAvailable && <p className="text-xs text-muted-foreground">La suggestion IA transmet uniquement la description au fournisseur configuré. Rien n’est ajouté sans ta validation.</p>}
          {aiError && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {aiError}
            </p>
          )}
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="stage">Stade</Label>
          <select id="stage" name="stage" defaultValue={defaults.stage ?? "idea"} className={select}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="project_type">Type</Label>
          <select id="project_type" name="project_type" defaultValue={defaults.project_type ?? "other"} className={select}>
            {PROJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {PROJECT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Fonctionnalités et sujets suivis (facultatif)</legend>
        <div className="flex flex-wrap gap-1.5">
          {FEATURE_KEYS.map((k) => (
            <label key={k} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-sm has-checked:border-primary has-checked:bg-accent">
              <input type="checkbox" name="features" value={k} checked={features.has(k)} onChange={() => toggle(features, k, setFeatures)} />
              {FEATURES[k].label}
            </label>
          ))}
        </div>
      </fieldset>

      <details className="rounded-lg border p-4" open={Boolean(defaults.problem || defaults.audience || defaults.constraints) || undefined}>
        <summary className="cursor-pointer text-sm font-medium">Réglages avancés</summary>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="problem">Problème à résoudre</Label>
            <Textarea id="problem" name="problem" rows={2} maxLength={2000} defaultValue={defaults.problem ?? ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="audience">Public cible</Label>
            <Input id="audience" name="audience" maxLength={500} defaultValue={defaults.audience ?? ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="constraints">Contraintes (budget, hébergement, technologies imposées, délai…)</Label>
            <Textarea id="constraints" name="constraints" rows={2} maxLength={2000} defaultValue={defaults.constraints ?? ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="notes">Notes personnelles</Label>
            <Textarea id="notes" name="notes" rows={3} maxLength={10000} defaultValue={defaults.notes ?? ""} aria-describedby="notes-help" />
            <p id="notes-help" className="text-xs text-muted-foreground">
              Privées : jamais utilisées pour le classement ni transmises à l’IA.
            </p>
          </div>
        </div>
      </details>

      <div className="flex items-center gap-3">
        <SubmitButton>{mode === "create" ? "Créer le projet" : "Enregistrer"}</SubmitButton>
        <p aria-live="polite" className="text-sm text-destructive">
          {state?.error}
        </p>
      </div>
    </form>
  );
}

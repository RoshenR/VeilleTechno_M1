"use client";

import { FileJson, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { importDependencies } from "@/app/(app)/mutations";
import { toast } from "@/components/content-state";
import { Button } from "@/components/ui/button";
import { applyExclusions, diffInventories, ImportError, MAX_IMPORT_BYTES, parseDependencyFile, RESOLUTION_LABELS, transmittable, type Inventory, type Resolution } from "@/domain/dependencies";

type Current = { name: string; version: string | null; declared: string | null; scope: string }[];

/**
 * Paste or pick a package.json / package-lock.json. Parsing happens here, in the browser: the raw file is
 * never uploaded; only the reduced inventory (names, versions, scopes) is sent after the preview is confirmed.
 */
export function DependencyImport({ projectId, current }: { projectId: string; current: Current }) {
  const router = useRouter();
  const id = useId();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [excluded, setExcluded] = useState("");
  const [inv, setInv] = useState<Inventory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const analyze = (raw: string, name: string | null) => {
    setError(null);
    setInv(null);
    try {
      setInv(parseDependencyFile(raw, name));
    } catch (e) {
      setError(e instanceof ImportError ? e.message : "Lecture impossible : vérifie le fichier.");
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_IMPORT_BYTES) return setError(`Fichier trop volumineux (max ${MAX_IMPORT_BYTES / 1_000_000} Mo).`);
    const raw = await f.text();
    setFileName(f.name.slice(0, 200));
    setText("");
    analyze(raw, f.name.slice(0, 200));
  };

  const patterns = excluded.split(/[\s,]+/).filter(Boolean);
  const entries = inv ? applyExclusions(inv.entries, patterns) : [];
  const diff = inv ? diffInventories(current, entries) : null;
  const transmitted = [...new Set(entries.filter(transmittable).map((e) => e.name))];
  const byResolution = entries.reduce<Record<string, number>>((m, e) => ((m[e.resolution] = (m[e.resolution] ?? 0) + 1), m), {});

  const confirm = () =>
    start(async () => {
      if (!inv) return;
      const res = await importDependencies(projectId, JSON.stringify({ ...inv, entries: inv.entries }), excluded).catch(() => ({ ok: false as const, error: "Envoi impossible : réessaie." }));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast({ message: res.unchecked ? `Inventaire enregistré. ${res.unchecked} package(s) n’ont pas pu être vérifiés : analyse incomplète.` : "Inventaire enregistré et comparé aux avis connus." });
      setInv(null);
      setText("");
      setFileName(null);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground" htmlFor={`${id}-paste`}>
          Coller le contenu
          <textarea
            id={`${id}-paste`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFileName(null);
            }}
            onBlur={() => text.trim() && analyze(text, null)}
            rows={6}
            spellCheck={false}
            placeholder='{ "name": "mon-app", "dependencies": { … } }'
            className="field h-auto py-2 font-mono text-xs"
          />
        </label>
        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Ou choisir un fichier</span>
          <label className="radar-grid flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong p-4 text-center text-sm hover:border-primary/50">
            <Upload className="size-5 text-primary" aria-hidden />
            <span>
              <span className="font-medium">package.json</span> ou <span className="font-medium">package-lock.json</span>
            </span>
            <span className="text-xs text-muted-foreground">lockfileVersion 2 ou 3 · 10 Mo max · lu dans ton navigateur</span>
            <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {text.trim() && (
            <Button size="sm" variant="outline" type="button" onClick={() => analyze(text, null)}>
              <FileJson aria-hidden /> Analyser le texte collé
            </Button>
          )}
        </div>
      </div>

      <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
        Dépendances privées à ne pas transmettre (facultatif)
        <input value={excluded} onChange={(e) => setExcluded(e.target.value)} placeholder="ex. @mon-entreprise/*, outil-interne" className="field" maxLength={1000} />
        <span className="font-normal">Ces noms restent dans l’inventaire mais ne sont jamais envoyés au service d’avis.</span>
      </label>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {inv && diff && (
        <section aria-label="Aperçu avant remplacement" className="surface space-y-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">Aperçu — {inv.origin}{fileName ? ` (${fileName})` : ""}</h3>
            {inv.lockfileVersion && <span className="font-mono text-xs text-muted-foreground">lockfileVersion {inv.lockfileVersion}</span>}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Entrées" value={entries.length} />
            <Stat label="Directes" value={entries.filter((e) => e.isDirect).length} />
            <Stat label="Ajoutées / modifiées" value={`${diff.added.length}`} />
            <Stat label="Retirées" value={diff.removed.length} />
          </dl>
          <p className="text-xs text-muted-foreground">
            {Object.entries(byResolution)
              .map(([r, n]) => `${RESOLUTION_LABELS[r as Resolution]} : ${n}`)
              .join(" · ")}
          </p>
          {diff.changed.length > 0 && (
            <p className="text-xs">
              Versions changées : <span className="font-mono">{diff.changed.slice(0, 12).join(", ")}</span>
              {diff.changed.length > 12 ? "…" : ""}
            </p>
          )}
          {inv.warnings.length > 0 && (
            <ul className="list-inside list-disc text-xs text-warning">
              {inv.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <p className="rounded-lg bg-muted px-3 py-2 text-xs">
            <strong>Transmis à GitHub Advisories :</strong> {transmitted.length} nom(s) de package npm, sans version ni nom de projet. Non transmis : dépendances exclues, locales, workspaces, URL Git.
          </p>
          <p className="text-xs text-muted-foreground">Un nouvel instantané daté sera créé ; les précédents restent consultables. Un lockfile décrit une résolution à un instant donné, pas forcément l’état déployé.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={confirm} disabled={pending} aria-busy={pending}>
              {pending ? "Analyse en cours…" : "Enregistrer et comparer"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setInv(null)} disabled={pending}>
              Annuler
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-lg tabular-nums">{value}</dd>
    </div>
  );
}

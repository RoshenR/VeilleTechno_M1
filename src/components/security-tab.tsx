import { CircleAlert, CircleCheck, CircleDashed, CircleHelp, CircleMinus, ExternalLink, History, Info, PackageSearch } from "lucide-react";
import { dismissFinding, reanalyzeSnapshot, restoreFinding } from "@/app/(app)/mutations";
import { ActionQuickForm } from "@/components/action-quick-form";
import { EmptyState, formatDateTime } from "@/components/labels";
import { SubmitButton } from "@/components/submit-button";
import { DependencyImport } from "@/components/dependency-import";
import { FINDING_LABELS, type FindingStatus, type PatchInfo } from "@/domain/advisory-match";
import { SCOPE_LABELS, type Scope } from "@/domain/dependencies";
import type { requireUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type Db = Awaited<ReturnType<typeof requireUser>>["supabase"];

const STATUS_STYLE: Record<FindingStatus, { icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  affected: { icon: CircleAlert, cls: "text-destructive border-destructive/40 bg-destructive/10" },
  unknown_version: { icon: CircleHelp, cls: "text-warning border-warning/40 bg-warning/10" },
  incomplete: { icon: CircleDashed, cls: "text-info border-info/40 bg-info/10" },
  withdrawn: { icon: CircleMinus, cls: "text-muted-foreground border-border bg-muted" },
  not_affected: { icon: CircleCheck, cls: "text-success border-success/40 bg-success/10" },
};
const ORDER: FindingStatus[] = ["affected", "unknown_version", "incomplete", "withdrawn", "not_affected"];
const SEVERITY: Record<string, string> = { critical: "critique", high: "élevée", medium: "moyenne", low: "faible", unknown: "non précisée" };

export function StatusBadge({ status }: { status: FindingStatus }) {
  const { icon: Icon, cls } = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", cls)}>
      <Icon className="size-3.5" aria-hidden /> {FINDING_LABELS[status]}
    </span>
  );
}

export async function SecurityTab({ db, projectId, projectName }: { db: Db; projectId: string; projectName: string }) {
  const { data: snapshots } = await db.from("dependency_snapshots").select("*").eq("project_id", projectId).order("imported_at", { ascending: false }).limit(10);
  const latest = snapshots?.[0];
  const [{ data: entries }, { data: findings }, { data: dismissals }, { data: history }] = await Promise.all([
    latest ? db.from("dependency_entries").select("name, version, declared, scope").eq("snapshot_id", latest.id).limit(10000) : Promise.resolve({ data: [] }),
    latest ? db.from("dependency_findings").select("*, security_advisories(summary, severity, html_url, cve_id, withdrawn_at, updated_at)").eq("snapshot_id", latest.id).is("superseded_at", null) : Promise.resolve({ data: [] }),
    db.from("finding_dismissals").select("*").eq("project_id", projectId),
    db.from("dependency_findings").select("ghsa_id, package, status, computed_at, superseded_at, snapshot_id").eq("project_id", projectId).not("superseded_at", "is", null).order("computed_at", { ascending: false }).limit(20),
  ]);
  const stats = (latest?.stats ?? {}) as { total?: number; direct?: number; transmitted?: number; excluded?: number; uncheckedCount?: number; counts?: Record<string, number>; warnings?: string[] };
  const hidden = new Map((dismissals ?? []).map((d) => [`${d.ghsa_id}|${d.package}`, d]));
  const all = (findings ?? []).sort((a, b) => ORDER.indexOf(a.status as FindingStatus) - ORDER.indexOf(b.status as FindingStatus));
  const visible = all.filter((f) => f.status !== "not_affected" && f.status !== "withdrawn" && !hidden.has(`${f.ghsa_id}|${f.package}`));
  const withdrawn = all.filter((f) => f.status === "withdrawn" && !hidden.has(`${f.ghsa_id}|${f.package}`));
  const masked = all.filter((f) => hidden.has(`${f.ghsa_id}|${f.package}`));
  const outside = all.filter((f) => f.status === "not_affected" && !hidden.has(`${f.ghsa_id}|${f.package}`));

  return (
    <div className="space-y-8">
      <p className="flex gap-2 rounded-xl border border-info/30 bg-info/5 px-4 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
        <span>
          Comparaison des dépendances <strong>déclarées dans un import</strong> avec les avis de sécurité connus (GitHub Advisory Database, avis <em>reviewed</em>, écosystème npm). Ce n’est pas un audit du code exécuté ni du déploiement :
          une plage affectée signale un risque à examiner, et l’absence de correspondance ne garantit pas que le projet est sûr.
        </span>
      </p>

      {latest ? (
        <section aria-labelledby="snap" className="surface space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="snap" className="font-semibold">
                Instantané analysé
              </h2>
              <p className="text-sm text-muted-foreground">
                {latest.origin}
                {latest.file_name ? ` · ${latest.file_name}` : ""}
                {latest.lockfile_version ? ` · lockfileVersion ${latest.lockfile_version}` : ""} · importé le {formatDateTime(latest.imported_at)} · analysé le {formatDateTime(latest.analyzed_at)}
              </p>
            </div>
            <form action={reanalyzeSnapshot.bind(null, projectId, latest.id)}>
              <SubmitButton size="sm" variant="outline" pendingLabel="Comparaison…">
                Recomparer avec les avis enregistrés
              </SubmitButton>
            </form>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            {(
              [
                ["Dépendances", stats.total],
                ["Directes", stats.direct],
                ["Noms transmis", stats.transmitted],
                ["Exclues (privées)", stats.excluded],
                ["Non vérifiées", stats.uncheckedCount ?? 0],
              ] as const
            ).map(([l, v]) => (
              <div key={l} className="rounded-lg border bg-card px-3 py-2">
                <dt className="text-xs text-muted-foreground">{l}</dt>
                <dd className="font-mono text-lg tabular-nums">{v ?? "—"}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            Couverture : avis GitHub <em>reviewed</em> pour npm uniquement. {latest.analysis_status === "complete" ? "Tous les noms transmis ont été vérifiés." : <StatusBadge status="incomplete" />}{" "}
            {latest.analysis_error && <span className="text-warning">{latest.analysis_error}</span>}
          </p>
        </section>
      ) : (
        <EmptyState icon={<PackageSearch aria-hidden />} title="Aucun inventaire de dépendances">
          <p>Importe un package.json (plages déclarées) ou, mieux, un package-lock.json (versions résolues) pour comparer les versions aux avis de sécurité connus.</p>
        </EmptyState>
      )}

      {latest && (
        <section aria-labelledby="findings" className="space-y-3">
          <h2 id="findings" className="font-semibold">
            Packages concernés ({groupByPackage(visible).length}) · {visible.length} avis
          </h2>
          {!visible.length ? (
            <p className="text-sm text-muted-foreground">Aucune version importée n’est dans une plage affectée ni à vérifier d’après les avis enregistrés. Cela ne signifie pas que tout le projet est sécurisé.</p>
          ) : (
            <ul className="grid gap-3">
              {groupByPackage(visible).map(([label, list], i) => (
                <li key={label}>
                  <details open={i < 2} className="group/pkg surface overflow-hidden">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                      <span className="font-mono text-sm font-medium">{label}</span>
                      {ORDER.filter((s) => list.some((f) => f.status === s)).map((s) => (
                        <span key={s} className="text-xs text-muted-foreground">
                          {list.filter((f) => f.status === s).length} × <StatusBadge status={s} />
                        </span>
                      ))}
                      <span className="ml-auto text-xs text-muted-foreground group-open/pkg:hidden">Afficher</span>
                    </summary>
                    <ul className="grid gap-3 border-t p-3">
                      {list.map((f) => (
                        <FindingCard key={f.id} f={f} projectId={projectId} projectName={projectName} />
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          )}
          {withdrawn.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Avis retirés par leur source ({withdrawn.length}) — conservés pour l’historique</summary>
              <ul className="mt-2 divide-y rounded-xl border bg-card">
                {withdrawn.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                    <span className="font-mono">
                      {f.package}@{f.version ?? f.declared}
                    </span>
                    <a href={f.security_advisories?.html_url} target="_blank" rel="noopener noreferrer" className="underline">
                      {f.ghsa_id}
                    </a>
                    <StatusBadge status="withdrawn" />
                  </li>
                ))}
              </ul>
            </details>
          )}
          {outside.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Avis examinés dont la version importée est hors plage ({outside.length})</summary>
              <ul className="mt-2 divide-y rounded-xl border bg-card">
                {outside.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                    <span className="font-mono">
                      {f.package}@{f.version ?? f.declared}
                    </span>
                    <a href={f.security_advisories?.html_url} target="_blank" rel="noopener noreferrer" className="underline">
                      {f.ghsa_id}
                    </a>
                    <StatusBadge status="not_affected" />
                  </li>
                ))}
              </ul>
            </details>
          )}
          {masked.length > 0 && (
            <details className="text-sm" open>
              <summary className="cursor-pointer text-muted-foreground">Alertes masquées ({masked.length}) — toujours consultables</summary>
              <ul className="mt-2 divide-y rounded-xl border bg-card">
                {masked.map((f) => {
                  const d = hidden.get(`${f.ghsa_id}|${f.package}`)!;
                  return (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                      <span>
                        <span className="font-mono">
                          {f.package}@{f.version ?? f.declared ?? "?"}
                        </span>{" "}
                        · {f.ghsa_id} · <StatusBadge status={f.status as FindingStatus} />
                        <span className="block text-muted-foreground">Masquée le {formatDateTime(d.created_at)} : « {d.reason} »</span>
                      </span>
                      <form action={restoreFinding.bind(null, projectId, f.ghsa_id, f.package)}>
                        <SubmitButton size="xs" variant="ghost">
                          Réafficher
                        </SubmitButton>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </section>
      )}

      <section aria-labelledby="import" className="space-y-3">
        <h2 id="import" className="font-semibold">
          {latest ? "Importer un inventaire plus récent" : "Importer un inventaire"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Formats pris en charge : <strong>package.json</strong> (plages et versions exactes déclarées) et <strong>package-lock.json</strong> v2/v3 (versions résolues, dépendances directes et transitives). Non pris en charge pour l’instant : lockfile v1,
          yarn.lock, pnpm-lock.yaml, bun.lock, autres écosystèmes. Aucun package n’est installé ni exécuté.
        </p>
        <DependencyImport projectId={projectId} current={(entries ?? []).map((e) => ({ name: e.name, version: e.version, declared: e.declared, scope: e.scope }))} />
      </section>

      {((snapshots?.length ?? 0) > 1 || (history?.length ?? 0) > 0) && (
        <section aria-labelledby="hist" className="space-y-3">
          <h2 id="hist" className="flex items-center gap-2 font-semibold">
            <History className="size-4" aria-hidden /> Historique
          </h2>
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {snapshots!.map((s) => {
              const st = (s.stats ?? {}) as { total?: number; counts?: Record<string, number> };
              return (
                <li key={s.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                  <span>
                    {formatDateTime(s.imported_at)} · {s.origin} · {st.total ?? "?"} entrées
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {st.counts?.affected ?? 0} dans une plage affectée · {st.counts?.unknown_version ?? 0} à vérifier
                  </span>
                </li>
              );
            })}
          </ul>
          {(history?.length ?? 0) > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Conclusions antérieures (avis corrigés, retirés ou nouvel import)</summary>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {history!.map((h, i) => (
                  <li key={i}>
                    {formatDateTime(h.computed_at)} → remplacée le {formatDateTime(h.superseded_at)} : <span className="font-mono">{h.package}</span> · {h.ghsa_id} · {FINDING_LABELS[h.status as FindingStatus]}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </div>
  );
}

function groupByPackage(list: FindingRow[]) {
  const m = new Map<string, FindingRow[]>();
  for (const f of list) {
    const k = `${f.package}${f.version ? `@${f.version}` : f.declared ? ` (${f.declared})` : ""}`;
    m.set(k, [...(m.get(k) ?? []), f]);
  }
  return [...m.entries()];
}

type FindingRow = {
  id: string;
  ghsa_id: string;
  package: string;
  version: string | null;
  declared: string | null;
  is_direct: boolean;
  scope: string;
  status: string;
  matched_range: string | null;
  patched: unknown;
  security_advisories: { summary: string; severity: string; html_url: string; cve_id: string | null; withdrawn_at: string | null; updated_at: string | null } | null;
};

function FindingCard({ f, projectId, projectName }: { f: FindingRow; projectId: string; projectName: string }) {
  const adv = f.security_advisories;
  const patches = (f.patched as PatchInfo[]) ?? [];
  const applicable = patches.filter((p) => p.applies);
  return (
    <li className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={f.status as FindingStatus} />
        <span className="text-xs text-muted-foreground">Sévérité publiée : {SEVERITY[adv?.severity ?? "unknown"] ?? adv?.severity}</span>
      </div>
      <p className="font-medium">
        <span className="font-mono">{f.package}</span>{" "}
        <span className="font-mono text-sm text-muted-foreground">{f.version ? `@${f.version}` : f.declared ? `(déclaré ${f.declared})` : "(version inconnue)"}</span>
      </p>
      <p className="text-sm text-muted-foreground">{adv?.summary}</p>
      <dl className="grid gap-1 text-xs sm:grid-cols-2">
        <div>
          <dt className="inline text-muted-foreground">Avis : </dt>
          <dd className="inline">
            <a href={adv?.html_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono underline">
              {f.ghsa_id} <ExternalLink className="size-3" aria-hidden />
            </a>
            {adv?.cve_id && <span className="ml-2 font-mono">{adv.cve_id}</span>}
          </dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Contexte : </dt>
          <dd className="inline">
            {f.is_direct ? "dépendance directe" : "dépendance transitive"} · {SCOPE_LABELS[f.scope as Scope] ?? f.scope}
          </dd>
        </div>
        {f.matched_range && (
          <div>
            <dt className="inline text-muted-foreground">Plage affectée : </dt>
            <dd className="inline font-mono">{f.matched_range}</dd>
          </div>
        )}
      </dl>
      {patches.length > 0 && (
        <div className="rounded-lg border bg-card px-3 py-2 text-xs">
          <p className="mb-1 font-medium">Versions corrigées documentées</p>
          <ul className="space-y-0.5">
            {patches.map((p, i) => (
              <li key={i} className={cn(p.applies && "font-medium")}>
                Branche <span className="font-mono">{p.range}</span> → {p.patched ? <span className="font-mono">{p.patched}</span> : "aucun correctif documenté"}
                {p.applies && p.patched && (p.sameMajor ? " · même version majeure que l’import" : " · changement de version majeure : vérifier la compatibilité")}
              </li>
            ))}
          </ul>
          {f.status === "affected" && !applicable.some((p) => p.patched) && <p className="mt-1 text-warning">Aucun correctif documenté pour la branche importée.</p>}
          <p className="mt-1 text-muted-foreground">Aucune mise à jour n’est faite automatiquement ; la dernière version majeure n’est pas forcément la bonne cible.</p>
        </div>
      )}
      <div className="flex flex-wrap gap-4 border-t pt-3 text-sm">
        <details>
          <summary className="cursor-pointer">Créer une tâche de vérification</summary>
          <div className="mt-2 w-80 max-w-full">
            <ActionQuickForm projects={[{ id: projectId, name: projectName }]} defaultTitle={`Vérifier ${f.package}${f.version ? `@${f.version}` : ""} — ${f.ghsa_id}`.slice(0, 300)} />
          </div>
        </details>
        <details>
          <summary className="cursor-pointer text-muted-foreground">Masquer cette alerte</summary>
          <form action={dismissFinding.bind(null, projectId, f.ghsa_id, f.package)} className="mt-2 flex w-80 max-w-full gap-2">
            <input name="reason" required maxLength={300} placeholder="Raison (ex. fonction non utilisée)" className="field h-8 flex-1" aria-label="Raison du masquage" />
            <SubmitButton size="sm" variant="outline">
              Masquer
            </SubmitButton>
          </form>
        </details>
      </div>
    </li>
  );
}

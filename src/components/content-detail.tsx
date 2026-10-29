import { ExternalLink, Lightbulb, ListChecks, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { generateAnalysis, saveItemNote, undoFeedback } from "@/app/(app)/mutations";
import { ActionQuickForm } from "@/components/action-quick-form";
import { AiAnalysis } from "@/components/ai-analysis";
import { DetailFeedback, ItemStateButtons } from "@/components/item-actions";
import { formatDateTime, KindBadge, PriorityBadge, PublishedDate } from "@/components/labels";
import { SubmitButton } from "@/components/submit-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AI_MIN_SCORE, getAiProvider, type StoredAnalysis } from "@/domain/ai";
import type { Priority, Reason } from "@/domain/ranking";
import type { ContentKind } from "@/domain/sources/normalize";
import { suggestedAction } from "@/domain/suggestions";
import { requireUser } from "@/lib/supabase/server";

const AI_MESSAGES: Record<string, string> = {
  ok: "Analyse IA générée.",
  erreur: "Le fournisseur IA n’a pas répondu correctement : les explications issues des règles restent valables.",
  budget: "Budget IA quotidien atteint. Réessaie demain.",
  indisponible: "Enrichissement IA indisponible (non configuré ou désactivé dans tes paramètres).",
  score: "L’enrichissement IA est réservé aux contenus les plus pertinents.",
  introuvable: "Analyse introuvable pour ce projet.",
};

/**
 * Content detail, shared by the full page and the side panel. Three distinct zones:
 * verifiable facts (from the source), interest for each project (deterministic rules), suggested action.
 */
export async function ContentDetail({ id, focus, ia, titleId = "detail-title" }: { id: string; focus?: string; ia?: string; titleId?: string }) {
  const { supabase, userId } = await requireUser();
  const { data: item } = await supabase.from("content_items").select("*, sources(name, site_url, is_official, kind)").eq("id", id).maybeSingle();
  if (!item) notFound();

  const [{ data: insights }, { data: state }, { data: feedback }, { data: prefs }] = await Promise.all([
    supabase.from("project_insights").select("*, projects(id, name, context_version, project_technologies(tech_key, display_name, status, version))").eq("content_item_id", id).order("score", { ascending: false }),
    supabase.from("user_content_state").select("*").eq("content_item_id", id).maybeSingle(),
    supabase.from("project_feedback").select("id, project_id, reason").eq("content_item_id", id),
    supabase.from("preferences").select("ai_enabled").eq("user_id", userId).single(),
  ]);
  const aiReady = Boolean(getAiProvider() && prefs?.ai_enabled);
  const kind = item.content_kind as ContentKind;
  const ordered = [...(insights ?? [])].sort((a, b) => Number(b.project_id === focus) - Number(a.project_id === focus));
  const iaMsg = ia ? AI_MESSAGES[ia] : undefined;

  return (
    <article className="space-y-6" aria-labelledby={titleId}>
      {/* Facts */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <KindBadge kind={kind} prerelease={item.is_prerelease} />
          <span>{item.sources?.name}</span>
          {item.sources?.is_official && <span>· source officielle</span>}
          <span aria-hidden>·</span>
          <PublishedDate iso={item.published_at} />
        </div>
        <h1 id={titleId} className="max-w-[40ch] text-2xl leading-tight font-semibold tracking-[-0.02em] text-balance">
          {item.title}
        </h1>
        <div className="flex flex-wrap gap-2">
          <a href={item.canonical_url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm" })}>
            <ExternalLink aria-hidden /> Lire la source originale<span className="sr-only"> (nouvel onglet)</span>
          </a>
          <ItemStateButtons id={id} read={Boolean(state?.is_read)} favorite={Boolean(state?.is_favorite)} />
        </div>
      </header>

      <section aria-labelledby={`${titleId}-facts`} className="surface space-y-3 p-5">
        <h2 id={`${titleId}-facts`} className="eyebrow">
          Faits — d’après la source
        </h2>
        <p className="max-w-[68ch] text-[0.95rem] leading-relaxed">{item.excerpt ?? "La source ne fournit que le titre : aucun résumé n’est proposé pour ne rien supposer."}</p>
        <dl className="grid gap-x-6 gap-y-1 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <dt className="inline">Publication : </dt>
            <dd className="inline">
              <PublishedDate iso={item.published_at} />
            </dd>
          </div>
          <div>
            <dt className="inline">Collecté le : </dt>
            <dd className="inline">{formatDateTime(item.collected_at)}</dd>
          </div>
          <div>
            <dt className="inline">Dernière vérification : </dt>
            <dd className="inline">{formatDateTime(item.last_seen_at)}</dd>
          </div>
          {item.release_tag && (
            <div>
              <dt className="inline">Tag : </dt>
              <dd className="inline font-mono">{item.release_tag}</dd>
            </div>
          )}
        </dl>
        <p className="text-xs text-muted-foreground">{item.excerpt ? "Extrait borné : le texte complet n’est jamais recopié." : null}</p>
        {(kind === "security" || kind === "breaking") && (
          <p className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            Une {kind === "security" ? "information de sécurité" : "annonce de changement"} ne signifie pas que ton projet est concerné. Cette veille n’est pas un audit : vérifie les versions et conditions dans la source.
          </p>
        )}
      </section>

      {iaMsg && (
        <p role="status" className="surface px-4 py-2 text-sm">
          {iaMsg}
        </p>
      )}

      {/* Interest per project + suggested action */}
      <section aria-labelledby={`${titleId}-interp`} className="space-y-4">
        <h2 id={`${titleId}-interp`} className="eyebrow">
          Intérêt pour tes projets
        </h2>
        {!ordered.length && <p className="text-sm text-muted-foreground">Ce contenu n’est retenu pour aucun de tes projets actifs.</p>}
        {ordered.map((ins) => {
          const p = ins.projects;
          if (!p) return null;
          const reasons = ins.reasons as unknown as Reason[];
          const matched = p.project_technologies.filter((t) => ins.matched_techs.includes(t.tech_key));
          const unknownVersions = matched.filter((t) => t.status === "used" && !t.version).map((t) => t.display_name);
          const suggestion = suggestedAction(ins.priority as Priority, kind, matched.map((t) => t.display_name), unknownVersions);
          const ai = ins.ai as unknown as StoredAnalysis | null;
          const aiFresh = ai && ins.ai_context_version === p.context_version && ins.ai_content_hash === item.content_hash;
          const fb = feedback?.find((f) => f.project_id === p.id);
          return (
            <div key={ins.project_id} className="surface space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">
                  <Link href={`/projets/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>
                </h3>
                <PriorityBadge priority={ins.priority as Priority} />
              </div>
              <p className="max-w-[68ch] rounded-lg border-l-2 border-primary/70 bg-accent/50 px-3 py-2 text-sm leading-relaxed dark:bg-accent/30">
                <span className="font-medium text-accent-foreground">Pour ce projet : </span>
                {ins.why}
              </p>
              <details className="text-sm">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Critères appliqués au classement ({reasons.length})</summary>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {reasons.map((r, i) => (
                    <li key={i} className="flex justify-between gap-4">
                      <span>{r.label}</span>
                      <span className="font-mono text-xs tabular-nums">{r.points > 0 ? `+${r.points}` : r.points}</span>
                    </li>
                  ))}
                </ul>
              </details>
              {unknownVersions.length > 0 && <p className="text-xs text-warning">Version inconnue pour {unknownVersions.join(", ")} : l’applicabilité ne peut pas être confirmée.</p>}
              <div className="flex gap-3 rounded-lg border bg-card p-3 text-sm">
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <div>
                  <p className="eyebrow mb-0.5">Action suggérée</p>
                  <p>{suggestion ?? "Aucune action nécessaire : information utile à connaître."}</p>
                </div>
              </div>

              {aiFresh ? (
                <AiAnalysis analysis={ai} sourceLanguage={item.language} />
              ) : (
                <div className="text-xs text-muted-foreground">
                  {ai && <p>Une analyse IA précédente a été invalidée (contexte du projet ou contenu modifié).</p>}
                  {aiReady && ins.score >= AI_MIN_SCORE ? (
                    <form action={generateAnalysis.bind(null, p.id, id)} className="mt-1 space-y-1">
                      <SubmitButton size="sm" variant="outline" pendingLabel="Analyse en cours…">
                        <Sparkles aria-hidden /> {ai ? "Régénérer l’analyse IA" : "Enrichir avec l’IA"}
                      </SubmitButton>
                      <p>Transmet au fournisseur IA : titre et extrait du contenu, stade, type, besoins, stack et contraintes du projet. Jamais tes notes.</p>
                    </form>
                  ) : (
                    <p>{aiReady ? "Enrichissement IA réservé aux contenus les plus pertinents." : "Explications issues des règles (IA désactivée ou non configurée)."}</p>
                  )}
                </div>
              )}

              <div className="space-y-3 border-t pt-3">
                <details>
                  <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <ListChecks className="size-4" aria-hidden /> Créer une action
                  </summary>
                  <div className="mt-2 max-w-sm">
                    <ActionQuickForm itemId={id} projects={[{ id: p.id, name: p.name }]} defaultTitle={(suggestion ?? `Étudier : ${item.title}`).slice(0, 300)} />
                  </div>
                </details>
                {fb ? (
                  <form action={undoFeedback.bind(null, p.id, fb.id)} className="flex items-center gap-2 text-sm text-muted-foreground">
                    Marqué peu pertinent pour ce projet.
                    <Button size="xs" variant="ghost" type="submit">
                      Annuler
                    </Button>
                  </form>
                ) : (
                  <DetailFeedback projectId={p.id} itemId={id} />
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section aria-labelledby={`${titleId}-note`} className="space-y-2">
        <h2 id={`${titleId}-note`} className="eyebrow">
          Ma note personnelle
        </h2>
        <form action={saveItemNote.bind(null, id)} className="grid max-w-xl gap-2">
          <Textarea name="note" rows={3} defaultValue={state?.note ?? ""} maxLength={5000} aria-label="Note personnelle sur ce contenu" />
          <div>
            <SubmitButton size="sm" variant="outline">
              Enregistrer la note
            </SubmitButton>
          </div>
        </form>
      </section>
    </article>
  );
}

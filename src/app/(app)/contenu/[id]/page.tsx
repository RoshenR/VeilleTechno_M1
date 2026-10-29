import { Bookmark, BookmarkCheck, Check, ExternalLink, Sparkles, Undo2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { generateAnalysis, giveFeedback, saveItemNote, setFavorite, setRead, undoFeedback } from "@/app/(app)/mutations";
import { ActionQuickForm } from "@/components/action-quick-form";
import { AiAnalysis } from "@/components/ai-analysis";
import { formatDateTime, KindBadge, PriorityBadge, PublishedDate } from "@/components/labels";
import { SubmitButton } from "@/components/submit-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AI_MIN_SCORE, getAiProvider, type StoredAnalysis } from "@/domain/ai";
import type { Priority, Reason } from "@/domain/ranking";
import type { ContentKind } from "@/domain/sources/normalize";
import { suggestedAction } from "@/domain/suggestions";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Détail" };

const AI_MESSAGES: Record<string, string> = {
  ok: "Analyse IA générée.",
  erreur: "Le fournisseur IA n’a pas répondu correctement : les explications ci-dessus, issues des règles, restent valables.",
  budget: "Budget IA quotidien atteint. Réessaie demain.",
  indisponible: "Enrichissement IA indisponible (non configuré ou désactivé dans tes paramètres).",
  score: "L’enrichissement IA est réservé aux contenus les plus pertinents.",
  introuvable: "Analyse introuvable pour ce projet.",
};
const FEEDBACK = [
  ["wrong_topic", "Mauvais sujet"],
  ["wrong_level", "Mauvais niveau"],
  ["already_known", "Déjà connu"],
  ["wrong_source", "Mauvaise source"],
] as const;

export default async function ContentPage({ params, searchParams }: PageProps<"/contenu/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, userId } = await requireUser();
  const { data: item } = await supabase.from("content_items").select("*, sources(name, site_url, is_official, kind)").eq("id", id).maybeSingle();
  if (!item) notFound();

  const [{ data: insights }, { data: state }, { data: feedback }, { data: prefs }] = await Promise.all([
    supabase
      .from("project_insights")
      .select("*, projects(id, name, context_version, project_technologies(tech_key, display_name, status, version))")
      .eq("content_item_id", id)
      .order("score", { ascending: false }),
    supabase.from("user_content_state").select("*").eq("content_item_id", id).maybeSingle(),
    supabase.from("project_feedback").select("id, project_id, reason").eq("content_item_id", id),
    supabase.from("preferences").select("ai_enabled").eq("user_id", userId).single(),
  ]);
  const aiReady = Boolean(getAiProvider() && prefs?.ai_enabled);
  const kind = item.content_kind as ContentKind;
  const focus = typeof sp.projet === "string" ? sp.projet : undefined;
  const ordered = [...(insights ?? [])].sort((a, b) => Number(b.project_id === focus) - Number(a.project_id === focus));
  const iaMsg = typeof sp.ia === "string" ? AI_MESSAGES[sp.ia] : undefined;

  return (
    <article className="space-y-6">
      <p className="text-xs">
        <Link href={focus ? `/projets/${focus}?tab=veille` : "/veille"} className="underline">
          ← Retour à la veille
        </Link>
      </p>

      {/* Verifiable facts */}
      <header className="space-y-3 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <KindBadge kind={kind} prerelease={item.is_prerelease} />
          <span>{item.sources?.name}</span>
          {item.sources?.is_official && <span>· source officielle</span>}
        </div>
        <h1 className="text-xl font-semibold leading-snug">{item.title}</h1>
        <dl className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
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
        <div className="rounded-lg bg-muted p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{item.excerpt ? "Extrait de la source (le texte complet n’est pas recopié)" : "Aucun extrait"}</p>
          <p>{item.excerpt ?? "La source ne fournit que le titre : aucun résumé n’est proposé pour ne rien supposer."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={item.canonical_url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm" })}>
            <ExternalLink aria-hidden /> Lire la source originale
          </a>
          <form action={setFavorite.bind(null, id, !state?.is_favorite)}>
            <Button size="sm" variant="outline" type="submit" aria-pressed={Boolean(state?.is_favorite)}>
              {state?.is_favorite ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />}
              {state?.is_favorite ? "Enregistré" : "Enregistrer"}
            </Button>
          </form>
          <form action={setRead.bind(null, id, !state?.is_read)}>
            <Button size="sm" variant="outline" type="submit">
              {state?.is_read ? <Undo2 aria-hidden /> : <Check aria-hidden />}
              {state?.is_read ? "Marquer non lu" : "Marquer comme lu"}
            </Button>
          </form>
        </div>
        {(kind === "security" || kind === "breaking") && (
          <p className="text-xs text-muted-foreground">
            Une {kind === "security" ? "information de sécurité" : "annonce de changement"} ne signifie pas que ton projet est concerné. Cette veille n’est pas un audit de sécurité : vérifie les versions et conditions dans la source.
          </p>
        )}
      </header>

      {iaMsg && (
        <p role="status" className="rounded-lg border px-3 py-2 text-sm">
          {iaMsg}
        </p>
      )}

      {/* Per-project interpretation */}
      <section aria-labelledby="interp" className="space-y-4">
        <h2 id="interp" className="font-semibold">
          Intérêt pour tes projets
        </h2>
        {!ordered.length && <p className="text-sm text-muted-foreground">Ce contenu n’est retenu pour aucun de tes projets actifs.</p>}
        {ordered.map((ins) => {
          const p = ins.projects;
          if (!p) return null;
          const reasons = ins.reasons as unknown as Reason[];
          const matchedNames = p.project_technologies.filter((t) => ins.matched_techs.includes(t.tech_key));
          const unknownVersions = matchedNames.filter((t) => t.status === "used" && !t.version).map((t) => t.display_name);
          const action = suggestedAction(ins.priority as Priority, kind, matchedNames.map((t) => t.display_name), unknownVersions);
          const ai = ins.ai as unknown as StoredAnalysis | null;
          const aiFresh = ai && ins.ai_context_version === p.context_version && ins.ai_content_hash === item.content_hash;
          const fb = feedback?.find((f) => f.project_id === p.id);
          return (
            <div key={ins.project_id} className="space-y-3 rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">
                  <Link href={`/projets/${p.id}`} className="underline">
                    {p.name}
                  </Link>
                </h3>
                <PriorityBadge priority={ins.priority as Priority} />
              </div>
              <p className="text-sm">
                <span className="font-medium">Pourquoi pour ce projet ?</span> {ins.why}
              </p>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Critères appliqués (règles déterministes)</p>
                <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                  {reasons.map((r, i) => (
                    <li key={i}>{r.label}</li>
                  ))}
                </ul>
              </div>
              {unknownVersions.length > 0 && <p className="text-xs text-warning">Version inconnue pour {unknownVersions.join(", ")} : l’applicabilité ne peut pas être confirmée.</p>}
              <div className="rounded-lg bg-accent/50 p-3 text-sm">
                <p className="text-xs font-medium text-muted-foreground">Action suggérée</p>
                <p>{action ?? "Aucune action nécessaire : information utile à connaître."}</p>
              </div>

              {aiFresh ? (
                <AiAnalysis analysis={ai} />
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
                    <p>{aiReady ? "Enrichissement IA réservé aux contenus les plus pertinents." : "Enrichissement IA indisponible ou désactivé : les explications ci-dessus proviennent des règles."}</p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-start gap-4 border-t pt-3">
                <details>
                  <summary className="cursor-pointer text-sm">Créer une action</summary>
                  <div className="mt-2 w-72">
                    <ActionQuickForm itemId={id} projects={[{ id: p.id, name: p.name }]} defaultTitle={(action ?? `Étudier : ${item.title}`).slice(0, 300)} />
                  </div>
                </details>
                {fb ? (
                  <form action={undoFeedback.bind(null, p.id, fb.id)} className="flex items-center gap-2 text-sm">
                    Marqué peu pertinent.
                    <Button size="xs" variant="ghost" type="submit">
                      Annuler
                    </Button>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-1 text-sm">
                    <span className="mr-1">Peu pertinent :</span>
                    {FEEDBACK.map(([r, label]) => (
                      <form key={r} action={giveFeedback.bind(null, p.id, id, r)}>
                        <Button size="xs" variant="outline" type="submit">
                          {label}
                        </Button>
                      </form>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="note" className="space-y-2">
        <h2 id="note" className="font-semibold">
          Ma note personnelle
        </h2>
        <form action={saveItemNote.bind(null, id)} className="grid max-w-xl gap-2">
          <Textarea name="note" rows={3} defaultValue={state?.note ?? ""} maxLength={5000} aria-label="Note personnelle sur ce contenu" />
          <SubmitButton size="sm" variant="outline">
            Enregistrer la note
          </SubmitButton>
        </form>
      </section>
    </article>
  );
}

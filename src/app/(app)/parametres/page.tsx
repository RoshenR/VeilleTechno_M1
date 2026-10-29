import { CheckCircle2, CircleSlash } from "lucide-react";
import { proposeSource, setVisualEffects, toggleHiddenSource, updatePreferences } from "@/app/(app)/mutations";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime, PageHeader } from "@/components/labels";
import { StateForm } from "@/components/state-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aiDailyBudget, getAiProvider } from "@/domain/ai";
import { githubTokenConfigured } from "@/domain/sources/github";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Paramètres" };

function Status({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 text-primary" aria-hidden /> : <CircleSlash className="mt-0.5 size-4 text-muted-foreground" aria-hidden />}
      <span>
        <span className="font-medium">{label}</span> — {ok ? "disponible" : "non configuré"}
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}

export default async function SettingsPage() {
  const { supabase, userId } = await requireUser();
  const [{ data: prefs }, { data: subs }, { data: catalog }, { data: proposals }] = await Promise.all([
    supabase.from("preferences").select("*").eq("user_id", userId).single(),
    supabase.from("project_sources").select("source_id, projects(name), sources(id, name, kind, last_error, last_success_at)"),
    supabase.from("sources").select("id, name, kind, language, in_catalog, last_error, last_success_at").eq("in_catalog", true).order("name"),
    supabase.from("source_proposals").select("id, url, language, topics, status, review_note, reviewed_at, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);
  const provider = getAiProvider();
  const hidden = new Set(prefs?.hidden_source_ids ?? []);
  const followed = new Map<string, { name: string; kind: string; error: string | null; lastSuccess: string | null; projects: string[] }>();
  for (const s of subs ?? []) {
    if (!s.sources) continue;
    const e = followed.get(s.sources.id) ?? { name: s.sources.name, kind: s.sources.kind, error: s.sources.last_error, lastSuccess: s.sources.last_success_at, projects: [] };
    if (s.projects?.name) e.projects.push(s.projects.name);
    followed.set(s.sources.id, e);
  }
  const today = new Date().toISOString().slice(0, 10);
  const used = prefs?.ai_calls_day === today ? prefs.ai_calls_count : 0;

  return (
    <>
      <PageHeader title="Paramètres" description="Préférences appliquées au classement de tous tes projets." />
      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="prefs" className="surface space-y-3 p-5">
          <h2 id="prefs" className="font-semibold">
            Préférences de veille
          </h2>
          <StateForm action={updatePreferences} submitLabel="Enregistrer et recalculer">
            <fieldset className="grid gap-1">
              <legend className="text-xs font-medium">Langues des contenus</legend>
              <div className="flex gap-4 text-sm">
                {[
                  ["fr", "Français"],
                  ["en", "Anglais"],
                ].map(([v, l]) => (
                  <label key={v} className="inline-flex items-center gap-1.5">
                    <input type="checkbox" name="languages" value={v} defaultChecked={prefs?.languages.includes(v)} /> {l}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="grid gap-1 text-xs">
              Intérêts (séparés par des virgules) — bonus de pertinence
              <Input name="interests" defaultValue={prefs?.interests.join(", ")} placeholder="ex. edge, monorepo, design system" />
            </label>
            <label className="grid gap-1 text-xs">
              Sujets exclus (séparés par des virgules) — masqués du flux
              <Input name="excluded_topics" defaultValue={prefs?.excluded_topics.join(", ")} placeholder="ex. blockchain, webinar" />
            </label>
            <fieldset className="grid gap-1 rounded-lg border p-3">
              <legend className="px-1 text-xs font-medium">Enrichissement IA</legend>
              <label className="inline-flex items-start gap-2 text-sm">
                <input type="checkbox" name="ai_enabled" defaultChecked={prefs?.ai_enabled} className="mt-1" disabled={!provider} />
                <span>
                  Autoriser l’envoi au fournisseur IA, à ta demande, du titre et de l’extrait d’un contenu ainsi que du stade, type, besoins, stack et contraintes du projet concerné.
                  <span className="block text-xs text-muted-foreground">Jamais tes notes ni tes données de compte. Désactivé par défaut. Sans IA, collecte, classement, favoris et actions fonctionnent normalement.</span>
                </span>
              </label>
            </fieldset>
          </StateForm>
        </section>

        <section aria-labelledby="services" className="surface space-y-3 p-5">
          <h2 id="services" className="font-semibold">
            Services
          </h2>
          <ul className="space-y-3 text-sm">
            <Status ok label="Base de données et authentification" detail="Supabase (PostgreSQL + Auth), données isolées par compte via Row Level Security." />
            <Status ok={Boolean(process.env.SUPABASE_SECRET_KEY)} label="Collecte des sources" detail="Planification quotidienne et actualisation manuelle (limitée à une fois toutes les 10 minutes)." />
            <Status ok={githubTokenConfigured()} label="Jeton GitHub (serveur)" detail={githubTokenConfigured() ? "Appels GitHub authentifiés (releases, avis de sécurité)." : "Sans jeton, l’API GitHub limite à 60 requêtes/heure : releases et avis de sécurité peuvent être reportés."} />
            <Status
              ok={Boolean(provider)}
              label="Enrichissement IA"
              detail={provider ? `${provider.name} · ${used}/${aiDailyBudget()} analyses utilisées aujourd’hui · ${prefs?.ai_enabled ? "activé pour ton compte" : "désactivé pour ton compte"}` : "Aucun fournisseur configuré : explications issues des règles uniquement."}
            />
          </ul>
        </section>
        <section aria-labelledby="effects" className="surface space-y-3 p-5">
          <h2 id="effects" className="font-semibold">
            Effets visuels
          </h2>
          <p className="text-sm text-muted-foreground">Radar 3D, inclinaisons et animations décoratives. Désactivés, l’application reste complète avec un rendu statique. La préférence « réduire les animations » du système est toujours respectée.</p>
          <form action={setVisualEffects.bind(null, !(prefs?.visual_effects ?? true))} className="flex items-center gap-3">
            <span className="text-sm">
              Actuellement : <strong>{prefs?.visual_effects ?? true ? "activés" : "désactivés"}</strong>
            </span>
            <SubmitButton size="sm" variant="outline" aria-pressed={prefs?.visual_effects ?? true}>
              {prefs?.visual_effects ?? true ? "Désactiver les effets" : "Activer les effets"}
            </SubmitButton>
          </form>
        </section>

        <section aria-labelledby="propose" className="surface space-y-3 p-5">
          <h2 id="propose" className="font-semibold">
            Proposer une source
          </h2>
          <p className="text-sm text-muted-foreground">La proposition reste en attente de modération : elle ne déclenche aucune collecte et n’est pas ajoutée automatiquement au catalogue partagé.</p>
          <StateForm action={proposeSource} submitLabel="Envoyer la proposition">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              URL du flux RSS/Atom (https)
              <Input name="url" type="url" required maxLength={2000} placeholder="https://exemple.fr/feed.xml" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Langue
                <select name="language" className="field" defaultValue="fr">
                  <option value="fr">Français</option>
                  <option value="en">Anglais</option>
                  <option value="other">Autre</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Sujets (séparés par des virgules)
                <Input name="topics" maxLength={400} placeholder="ex. react, accessibilité" />
              </label>
            </div>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Pourquoi cette source ? (facultatif)
              <textarea name="justification" maxLength={1000} rows={2} className="field h-auto py-2" />
            </label>
          </StateForm>
          {(proposals?.length ?? 0) > 0 && (
            <div className="border-t pt-3">
              <p className="eyebrow mb-2">Mes propositions</p>
              <ul className="space-y-2 text-sm">
                {proposals!.map((p) => (
                  <li key={p.id} className="rounded-lg border bg-card px-3 py-2">
                    <span className="block truncate font-mono text-xs">{p.url}</span>
                    <span className="text-xs">
                      {{ pending: "En attente", accepted: "Acceptée", rejected: "Refusée" }[p.status] ?? p.status} · proposée le {formatDateTime(p.created_at)}
                    </span>
                    {p.review_note && <span className="block text-xs text-muted-foreground">Retour de modération : {p.review_note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="followed" className="mt-8 space-y-3">
        <h2 id="followed" className="font-semibold">
          Sources suivies par tes projets
        </h2>
        <p className="text-sm text-muted-foreground">L’abonnement se gère dans l’onglet « Stack » de chaque projet. Masquer une source l’exclut du classement de tous tes projets, de façon réversible.</p>
        {!followed.size ? (
          <p className="text-sm text-muted-foreground">Aucune source suivie.</p>
        ) : (
          <ul className="divide-y surface text-sm">
            {[...followed.entries()].map(([id, s]) => (
              <li key={id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>
                  <span className="font-medium">{s.name}</span> <span className="text-xs text-muted-foreground">· {s.projects.join(", ")}</span>
                  <span className={s.error ? "block text-xs text-warning" : "block text-xs text-muted-foreground"}>{s.error ? `Indisponible : ${s.error}` : `Dernière collecte réussie : ${formatDateTime(s.lastSuccess)}`}</span>
                </span>
                <form action={toggleHiddenSource.bind(null, id)}>
                  <Button size="xs" variant={hidden.has(id) ? "default" : "outline"} type="submit" aria-pressed={hidden.has(id)}>
                    {hidden.has(id) ? "Masquée — réafficher" : "Masquer"}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <details className="rounded-xl border p-4 text-sm">
          <summary className="cursor-pointer font-medium">Catalogue complet ({catalog?.length ?? 0} sources vérifiées)</summary>
          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            {(catalog ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded border p-2">
                <span>
                  {s.name}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({s.kind === "github" ? "GitHub" : "RSS"}, {s.language}){s.last_error ? " · indisponible" : ""}
                  </span>
                </span>
                {hidden.has(s.id) && (
                  <form action={toggleHiddenSource.bind(null, s.id)}>
                    <Button size="xs" variant="ghost" type="submit">
                      Réafficher
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </>
  );
}

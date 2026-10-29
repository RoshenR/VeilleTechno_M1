import { notFound } from "next/navigation";
import { reviewProposal, validateProposal } from "@/app/(app)/mutations";
import { EmptyState, formatDateTime, PageHeader } from "@/components/labels";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Modération des sources" };

type Validation = { ok?: boolean; items?: number; latest?: string | null; finalUrl?: string; redirects?: number; sample?: string[]; error?: string; checkedAt?: string };

/** Restricted to app_admins (checked here and enforced by RLS on source_proposals). */
export default async function ModerationPage() {
  const { supabase } = await requireUser();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) notFound();
  const { data: proposals } = await supabase.from("source_proposals").select("*").order("status").order("created_at", { ascending: true }).limit(100);

  return (
    <>
      <PageHeader title="Modération des sources" description="Propositions des utilisateurs. Accepter enregistre la décision et le retour à l’auteur ; l’ajout au catalogue partagé reste une modification revue de src/domain/sources/catalog.ts." />
      {!proposals?.length ? (
        <EmptyState title="Aucune proposition">Les propositions envoyées depuis les paramètres apparaîtront ici.</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {proposals.map((p) => {
            const v = (p.validation ?? null) as Validation | null;
            return (
              <li key={p.id} className="surface space-y-3 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs break-all">{p.url}</span>
                  <span className="rounded-full border px-2 py-0.5 text-xs">{{ pending: "En attente", accepted: "Acceptée", rejected: "Refusée" }[p.status]}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Langue : {p.language} · sujets : {p.topics.join(", ") || "—"} · proposée le {formatDateTime(p.created_at)}
                </p>
                {p.justification && <p className="whitespace-pre-wrap">{p.justification}</p>}
                <div className="rounded-lg border bg-card px-3 py-2 text-xs">
                  {v ? (
                    v.ok ? (
                      <p>
                        Flux valide · {v.items} élément(s) · dernier publié {formatDateTime(v.latest)} · {v.redirects} redirection(s) · vérifié le {formatDateTime(v.checkedAt)}
                        {v.sample?.length ? <span className="block text-muted-foreground">Exemples : {v.sample.join(" · ")}</span> : null}
                      </p>
                    ) : (
                      <p className="text-warning">Validation échouée : {v.error ?? "aucun élément exploitable"} ({formatDateTime(v.checkedAt)})</p>
                    )
                  ) : (
                    <p className="text-muted-foreground">Pas encore vérifiée. La vérification passe par une récupération sécurisée (https, adresses internes bloquées, redirections et taille limitées).</p>
                  )}
                  <form action={validateProposal.bind(null, p.id)} className="mt-2">
                    <SubmitButton size="xs" variant="outline" pendingLabel="Vérification…">
                      Vérifier le flux
                    </SubmitButton>
                  </form>
                </div>
                <form action={reviewProposal.bind(null, p.id)} className="flex flex-wrap items-end gap-2">
                  <label className="grid flex-1 gap-1 text-xs text-muted-foreground">
                    Retour visible par l’auteur
                    <input name="note" defaultValue={p.review_note ?? ""} maxLength={1000} className="field h-8" />
                  </label>
                  <SubmitButton size="sm" name="status" value="accepted">
                    Accepter
                  </SubmitButton>
                  <SubmitButton size="sm" variant="outline" name="status" value="rejected">
                    Refuser
                  </SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

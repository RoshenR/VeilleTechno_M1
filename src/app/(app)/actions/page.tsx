import Link from "next/link";
import { deleteAction, updateActionNote, updateActionStatus } from "@/app/(app)/mutations";
import { ActionQuickForm } from "@/components/action-quick-form";
import { EmptyState, formatDate, PageHeader } from "@/components/labels";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ACTION_STATUS_LABELS, ACTION_STATUSES, type ActionStatus } from "@/domain/actions";
import { requireUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata = { title: "Actions" };
const select = "h-8 rounded-lg border bg-background px-2 text-sm";

export default async function ActionsPage({ searchParams }: PageProps<"/actions">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const status = ACTION_STATUSES.includes(sp.statut as ActionStatus) ? (sp.statut as ActionStatus) : undefined;
  const projectId = typeof sp.projet === "string" && sp.projet ? sp.projet : undefined;

  let q = supabase.from("project_actions").select("*, projects(id, name), content_items(id, title, canonical_url)").order("created_at", { ascending: false }).limit(300);
  if (status) q = q.eq("status", status);
  if (projectId) q = q.eq("project_id", projectId);
  const [{ data: actions }, { data: projects }] = await Promise.all([q, supabase.from("projects").select("id, name").is("archived_at", null).order("name")]);

  return (
    <>
      <PageHeader title="Actions" description="Pistes à étudier ou à faire, rattachées à tes projets. Rien n’est exécuté automatiquement sur ton code." />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs">
            Statut
            <select name="statut" defaultValue={status ?? ""} className={select}>
              <option value="">Tous</option>
              {ACTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ACTION_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            Projet
            <select name="projet" defaultValue={projectId ?? ""} className={select}>
              <option value="">Tous</option>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" size="sm">
            Filtrer
          </Button>
        </form>
        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium">Nouvelle action manuelle</summary>
          <div className="mt-3">
            <ActionQuickForm projects={projects ?? []} />
          </div>
        </details>
      </div>

      {!actions?.length ? (
        <EmptyState title="Aucune action">Depuis la veille, « Créer une action » transforme une information en tâche à étudier.</EmptyState>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {actions.map((a) => (
            <li key={a.id} className="grid gap-2 p-4 text-sm md:grid-cols-[1fr_auto]">
              <div className="min-w-0 space-y-1">
                <p className={cn("font-medium", (a.status === "done" || a.status === "dropped") && "text-muted-foreground line-through")}>{a.title}</p>
                <p className="text-xs text-muted-foreground">
                  {a.projects && (
                    <Link href={`/projets/${a.projects.id}?tab=actions`} className="underline">
                      {a.projects.name}
                    </Link>
                  )}{" "}
                  · créée le {formatDate(a.created_at)}
                  {a.content_items && (
                    <>
                      {" · origine : "}
                      <Link href={`/contenu/${a.content_items.id}`} className="underline">
                        {a.content_items.title}
                      </Link>
                    </>
                  )}
                </p>
                <form action={updateActionNote.bind(null, a.id)} className="flex flex-wrap items-end gap-2">
                  <Textarea name="note" rows={1} defaultValue={a.note ?? ""} placeholder="Note…" className="min-h-8 flex-1" aria-label={`Note de « ${a.title} »`} maxLength={5000} />
                  <SubmitButton size="sm" variant="ghost">
                    Enregistrer la note
                  </SubmitButton>
                </form>
              </div>
              <div className="flex items-start gap-1">
                <form action={updateActionStatus.bind(null, a.id)} className="flex items-center gap-1">
                  <select name="status" defaultValue={a.status} className={select} aria-label={`Statut de « ${a.title} »`}>
                    {ACTION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {ACTION_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <SubmitButton size="sm" variant="outline">
                    OK
                  </SubmitButton>
                </form>
                <form action={deleteAction.bind(null, a.id)}>
                  <Button size="sm" variant="ghost" type="submit">
                    Supprimer
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

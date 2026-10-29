import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { addResource, deleteResource, saveItemNote } from "@/app/(app)/mutations";
import { UnfavoriteButton } from "@/components/item-actions";
import { EmptyState, KindBadge, PageHeader, PublishedDate } from "@/components/labels";
import { StateForm } from "@/components/state-form";
import { SubmitButton } from "@/components/submit-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONTENT_KIND_LABELS, CONTENT_KINDS, type ContentKind } from "@/domain/sources/normalize";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Enregistrés" };
const select = "field h-9 w-auto";

export default async function SavedPage({ searchParams }: PageProps<"/enregistres">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const kind = CONTENT_KINDS.includes(sp.type as ContentKind) ? (sp.type as ContentKind) : undefined;
  const projectId = typeof sp.projet === "string" && sp.projet ? sp.projet : undefined;
  const safe = q.replace(/[%_,()]/g, " ");

  let favQ = supabase
    .from("user_content_state")
    .select("note, favorited_at, content_items!inner(id, title, canonical_url, content_kind, is_prerelease, published_at, sources(name), project_insights(project_id, projects(name)))")
    .eq("is_favorite", true)
    .order("favorited_at", { ascending: false })
    .limit(200);
  if (q) favQ = favQ.ilike("content_items.title", `%${safe}%`);
  if (kind) favQ = favQ.eq("content_items.content_kind", kind);
  let resQ = supabase.from("project_resources").select("*, projects(name)").order("created_at", { ascending: false }).limit(200);
  if (q) resQ = resQ.or(`title.ilike.%${safe}%,note.ilike.%${safe}%`);
  if (projectId) resQ = resQ.eq("project_id", projectId);

  const [{ data: favs }, { data: resources }, { data: projects }] = await Promise.all([favQ, resQ, supabase.from("projects").select("id, name").order("name")]);
  const favorites = (favs ?? []).filter((f) => !projectId || f.content_items.project_insights.some((i) => i.project_id === projectId));

  return (
    <>
      <PageHeader title="Enregistrés" description="Tes contenus favoris, tes notes et les liens ajoutés à tes projets." />

      <form method="get" role="search" className="mb-6 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs">
          Recherche
          <Input name="q" defaultValue={q} placeholder="Titre ou note…" className="w-56" />
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
        <label className="grid gap-1 text-xs">
          Type
          <select name="type" defaultValue={kind ?? ""} className={select}>
            <option value="">Tous</option>
            {CONTENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {CONTENT_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm">
          Filtrer
        </Button>
        <Link href="/enregistres" className={buttonVariants({ size: "sm", variant: "ghost" })}>
          Réinitialiser
        </Link>
      </form>

      <section aria-labelledby="fav" className="mb-10 space-y-3">
        <h2 id="fav" className="font-semibold">
          Contenus favoris ({favorites.length})
        </h2>
        {!favorites.length ? (
          <EmptyState title="Aucun favori">Utilise « Enregistrer » sur une information de la veille pour la retrouver ici.</EmptyState>
        ) : (
          <ul className="grid gap-3">
            {favorites.map((f) => {
              const c = f.content_items;
              const names = [...new Set(c.project_insights.map((i) => i.projects?.name).filter(Boolean))];
              return (
                <li key={c.id} className="surface p-4">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <KindBadge kind={c.content_kind as ContentKind} prerelease={c.is_prerelease} />
                    <span>{c.sources?.name}</span>·<PublishedDate iso={c.published_at} />
                    {names.length > 0 && <span>· {names.join(", ")}</span>}
                  </div>
                  <h3 className="mt-1 font-medium">
                    <Link href={`/contenu/${c.id}`} className="hover:underline">
                      {c.title}
                    </Link>
                  </h3>
                  <form action={saveItemNote.bind(null, c.id)} className="mt-2 flex flex-wrap items-end gap-2">
                    <Textarea name="note" rows={1} defaultValue={f.note ?? ""} placeholder="Note personnelle…" className="min-h-8 flex-1" aria-label={`Note sur ${c.title}`} maxLength={5000} />
                    <SubmitButton size="sm" variant="outline">
                      Enregistrer la note
                    </SubmitButton>
                  </form>
                  <div className="mt-2 flex gap-1">
                    <a href={c.canonical_url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "ghost" })}>
                      <ExternalLink aria-hidden /> Ouvrir
                    </a>
                    <UnfavoriteButton id={c.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="links" className="space-y-3">
        <h2 id="links" className="font-semibold">
          Liens ajoutés manuellement ({resources?.length ?? 0})
        </h2>
        {(resources ?? []).length > 0 && (
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {resources!.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 p-3">
                <div>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                    {r.title}
                  </a>
                  <p className="text-xs text-muted-foreground">
                    {r.projects?.name} · <span className="break-all">{r.url}</span>
                  </p>
                  {r.note && <p className="mt-1 whitespace-pre-wrap">{r.note}</p>}
                </div>
                <form action={deleteResource.bind(null, r.id)}>
                  <Button size="xs" variant="ghost" type="submit">
                    Supprimer
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {projects?.length ? (
          <div className="max-w-xl rounded-xl border p-4">
            <h3 className="mb-1 text-sm font-medium">Ajouter un lien à un projet</h3>
            <p className="mb-3 text-xs text-muted-foreground">Conservé tel que saisi, sans récupération automatique de la page.</p>
            <StateForm action={addResource} submitLabel="Ajouter le lien">
              <label className="grid gap-1 text-xs">
                Projet
                <select name="project_id" className={select} required defaultValue={projectId ?? projects[0].id}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                URL
                <Input name="url" type="url" required maxLength={2000} placeholder="https://…" />
              </label>
              <label className="grid gap-1 text-xs">
                Titre
                <Input name="title" required maxLength={300} />
              </label>
              <label className="grid gap-1 text-xs">
                Note (facultatif)
                <Textarea name="note" rows={2} maxLength={5000} />
              </label>
            </StateForm>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Crée un projet pour y rattacher des liens.</p>
        )}
      </section>
    </>
  );
}

import { FeedView } from "@/components/feed-view";
import { PageHeader } from "@/components/labels";
import { parseFilters } from "@/lib/feed";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Ma veille" };

export default async function FeedPage({ searchParams }: PageProps<"/veille">) {
  const { supabase, userId } = await requireUser();
  const sp = await searchParams;
  const { data: prefs } = await supabase.from("preferences").select("visual_effects").eq("user_id", userId).maybeSingle();
  return (
    <>
      <PageHeader title="Ma veille" description="Actualités, sécurité et ressources sélectionnées selon le contexte de tes projets." />
      <FeedView db={supabase} filters={parseFilters(sp)} basePath="/veille" searchParams={sp} effects={prefs?.visual_effects ?? true} />
    </>
  );
}

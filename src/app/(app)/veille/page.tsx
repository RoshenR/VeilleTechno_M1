import { FeedView } from "@/components/feed-view";
import { PageHeader } from "@/components/labels";
import { parseFilters } from "@/lib/feed";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Ma veille" };

export default async function FeedPage({ searchParams }: PageProps<"/veille">) {
  const { supabase } = await requireUser();
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Ma veille" description="Actualités et ressources sélectionnées selon le contexte de tes projets." />
      <FeedView db={supabase} filters={parseFilters(sp)} basePath="/veille" searchParams={sp} />
    </>
  );
}

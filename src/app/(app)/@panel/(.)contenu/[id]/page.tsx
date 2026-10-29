import { ContentDetail } from "@/components/content-detail";
import { DetailSheet } from "@/components/detail-sheet";

// Opened from a list (soft navigation): the detail shows in a side panel over the list.
// A direct visit or reload renders the full page (app/(app)/contenu/[id]).
export default async function ContentPanel({ params, searchParams }: PageProps<"/contenu/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  return (
    <DetailSheet titleId="panel-title">
      <ContentDetail id={id} titleId="panel-title" focus={typeof sp.projet === "string" ? sp.projet : undefined} ia={typeof sp.ia === "string" ? sp.ia : undefined} />
    </DetailSheet>
  );
}

import Link from "next/link";
import { ContentDetail } from "@/components/content-detail";

export const metadata = { title: "Détail" };

export default async function ContentPage({ params, searchParams }: PageProps<"/contenu/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const focus = typeof sp.projet === "string" ? sp.projet : undefined;
  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-4 text-sm">
        <Link href={focus ? `/projets/${focus}?tab=veille` : "/veille"} className="text-muted-foreground hover:text-foreground hover:underline">
          ← Retour à la veille
        </Link>
      </p>
      <ContentDetail id={id} focus={focus} ia={typeof sp.ia === "string" ? sp.ia : undefined} />
    </div>
  );
}

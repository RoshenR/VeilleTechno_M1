import { createProject } from "@/app/(app)/mutations";
import { PageHeader } from "@/components/labels";
import { ProjectForm } from "@/components/project-form";
import { getAiProvider } from "@/domain/ai";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Nouveau projet" };

export default async function NewProjectPage() {
  const { supabase, userId } = await requireUser();
  const { data: prefs } = await supabase.from("preferences").select("ai_enabled").eq("user_id", userId).single();
  return (
    <>
      <PageHeader title="Nouveau projet" description="Seuls le nom et une courte description sont obligatoires. Tout le reste se complète ensuite." />
      <div className="max-w-2xl">
        <ProjectForm action={createProject} mode="create" aiAvailable={Boolean(getAiProvider() && prefs?.ai_enabled)} />
      </div>
    </>
  );
}

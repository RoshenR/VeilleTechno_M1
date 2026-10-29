import { notFound } from "next/navigation";
import { updateProject } from "@/app/(app)/mutations";
import { PageHeader } from "@/components/labels";
import { ProjectForm } from "@/components/project-form";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Modifier le projet" };

export default async function EditProjectPage({ params }: PageProps<"/projets/[id]/modifier">) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) notFound();
  return (
    <>
      <PageHeader title={`Modifier « ${project.name} »`} description="Modifier le contexte recalcule les analyses personnalisées. Favoris, notes et actions sont conservés." />
      <div className="max-w-2xl">
        <ProjectForm action={updateProject.bind(null, project.id)} mode="edit" defaults={project} aiAvailable={false} />
      </div>
    </>
  );
}

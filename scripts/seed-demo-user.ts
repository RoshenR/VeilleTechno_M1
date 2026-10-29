// npm run seed:local — LOCAL ONLY. Creates a test account with two projects (one with a stack, one without)
// so screens can be reviewed and measured with real collected content. Refuses any non-local database.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultSourceKeys } from "@/domain/sources/catalog";
import { refreshProjectInsights } from "@/domain/insights";

loadEnvConfig(process.cwd(), true);

async function main() {
  const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://invalid").hostname;
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error(`Base non locale (${host}) : abandon.`);
  const db = createAdminClient();
  const email = process.argv[2] ?? "revue@stacksignal.test";
  const password = randomBytes(12).toString("base64url");
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const uid = created.user.id;
  const { data: saas } = await db
    .from("projects")
    .insert({ owner_id: uid, name: "Réservations SaaS", description: "SaaS de réservation pour salles de sport, paiement en ligne et comptes clients.", stage: "production", project_type: "saas", features: ["payment", "auth"] })
    .select("id")
    .single();
  await db.from("project_technologies").insert([
    { project_id: saas!.id, tech_key: "nextjs", display_name: "Next.js", category: "frontend", status: "used", version: "16.1" },
    { project_id: saas!.id, tech_key: "react", display_name: "React", category: "frontend", status: "used", version: "19.2" },
    { project_id: saas!.id, tech_key: "postgresql", display_name: "PostgreSQL", category: "database", status: "used", version: null },
    { project_id: saas!.id, tech_key: "supabase", display_name: "Supabase", category: "backend", status: "used", version: null },
    { project_id: saas!.id, tech_key: "stripe", display_name: "Stripe", category: "service", status: "considered", version: null },
  ]);
  const { data: idea } = await db
    .from("projects")
    .insert({ owner_id: uid, name: "Idée : plateforme de cours", description: "Plateforme de cours en ligne avec vidéos, quiz et paiement.", stage: "idea", project_type: "website", features: ["payment", "seo"] })
    .select("id")
    .single();
  for (const [pid, techs] of [
    [saas!.id, ["nextjs", "react", "postgresql", "supabase", "stripe"]],
    [idea!.id, []],
  ] as const) {
    const { data: sources } = await db.from("sources").select("id").eq("in_catalog", true).in("key", defaultSourceKeys([...techs]));
    await db.from("project_sources").insert((sources ?? []).map((s) => ({ project_id: pid, source_id: s.id })));
    await refreshProjectInsights(db, pid);
  }
  const out = process.env.SEED_CREDENTIALS_FILE;
  if (out) writeFileSync(out, JSON.stringify({ email, password }));
  console.log(`Compte de revue créé : ${email}${out ? ` (identifiants écrits dans ${out})` : ""}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});

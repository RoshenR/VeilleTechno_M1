// npm run ingest — collects due sources and recomputes insights, looping over bounded batches
// until everything due is done. Safe to run concurrently with the cron (database lock).
import { loadEnvConfig } from "@next/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { runIngestion } from "@/domain/ingestion";

loadEnvConfig(process.cwd());

async function main() {
  const db = createAdminClient();
  if (process.argv.includes("--force")) {
    // Make every source due now (conditional requests still avoid re-downloading unchanged feeds).
    await db.from("sources").update({ next_fetch_at: new Date().toISOString() }).neq("kind", "");
  }
  for (let pass = 1; pass <= 20; pass++) {
    const res = await runIngestion(db, { trigger: "cli", budgetMs: 120_000, log: (m) => console.log(m) });
    if (res.status === "busy") {
      console.log("Une autre collecte est en cours : abandon.");
      return;
    }
    console.log(`Passe ${pass} : ${res.status} — ${res.sourcesDone} source(s) OK, ${res.sourcesFailed} en échec, ${res.itemsNew} nouveau(x) contenu(s), ${res.projectsRefreshed} projet(s) recalculé(s).`);
    if (res.status === "completed") return;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

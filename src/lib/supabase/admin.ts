import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

/**
 * Service-role client: bypasses RLS. Server-only (ingestion, CLI, writes to the public catalog).
 * Never use it to read private data on behalf of a user.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SECRET_KEY sont requis pour la collecte.");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

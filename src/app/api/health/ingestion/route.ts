import { NextResponse } from "next/server";
import { lastSuccessStatus } from "@/domain/ops";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Independent « last success » check for an external uptime monitor: 200 while the last successful
// scheduled run is recent enough, 503 otherwise — including when the scheduler never started.
// Exposes only a timestamp and a boolean.
export async function GET() {
  try {
    const s = await lastSuccessStatus(createAdminClient());
    return NextResponse.json(s, { status: s.healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ healthy: false, error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

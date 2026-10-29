import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runIngestion } from "@/domain/ingestion";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// Daily scheduler entry point (Vercel Cron sends GET with `Authorization: Bearer $CRON_SECRET`).
// Each call processes bounded batches within its time budget; a later call resumes the rest.
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await runIngestion(createAdminClient(), { trigger: "cron", budgetMs: 240_000 });
    return NextResponse.json(result, { status: result.status === "busy" ? 409 : 200 });
  } catch (e) {
    console.error("ingestion failed", (e as Error).message);
    return NextResponse.json({ error: "ingestion failed" }, { status: 500 });
  }
}

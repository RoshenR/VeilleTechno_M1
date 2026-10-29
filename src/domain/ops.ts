import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";

// Operations: persisted state, de-duplicated alerts, and an independent « last success » signal.
// Everything here is optional: without OPS_* variables nothing is sent, and nothing pretends to be monitored.

type Db = SupabaseClient<Database>;

export const OPS_ALERT_COOLDOWN_MS = 12 * 3600_000;
export const FAILED_RUNS_BEFORE_ALERT = 3;
/** The scheduler runs daily: no success for 36 h means a run failed or never started. */
export const MAX_SUCCESS_AGE_MS = 36 * 3600_000;

export async function getOpsState<T = Record<string, unknown>>(db: Db, key: string): Promise<T | null> {
  const { data } = await db.from("ops_state").select("value").eq("key", key).maybeSingle();
  return (data?.value as T | undefined) ?? null;
}

export async function setOpsState(db: Db, key: string, value: Record<string, unknown>) {
  await db.from("ops_state").upsert({ key, value: value as NonNullable<Json>, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

/** Pure decision, tested: should an alert with this key be sent now? */
export function shouldSendAlert(lastSentAt: string | null | undefined, now = Date.now(), cooldownMs = OPS_ALERT_COOLDOWN_MS) {
  return !lastSentAt || now - Date.parse(lastSentAt) >= cooldownMs;
}

/**
 * Send an operations alert to OPS_ALERT_WEBHOOK_URL (Slack/Discord/Teams-compatible JSON `{ text }`),
 * at most once per cooldown per key. Returns what happened, so callers never claim an alert went out.
 */
export async function raiseAlert(db: Db, key: string, message: string, fetchImpl: typeof fetch = fetch): Promise<"sent" | "suppressed" | "not_configured" | "failed"> {
  const { data: prev } = await db.from("ops_alerts").select("last_sent_at, occurrences").eq("key", key).maybeSingle();
  const occurrences = (prev?.occurrences ?? 0) + 1;
  const url = process.env.OPS_ALERT_WEBHOOK_URL;
  let outcome: "sent" | "suppressed" | "not_configured" | "failed" = "suppressed";
  if (!url) outcome = "not_configured";
  else if (shouldSendAlert(prev?.last_sent_at)) {
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `[StackSignal] ${message}`, content: `[StackSignal] ${message}` }),
        signal: AbortSignal.timeout(10_000),
      });
      outcome = res.ok ? "sent" : "failed";
    } catch {
      outcome = "failed";
    }
  }
  await db.from("ops_alerts").upsert(
    { key, last_message: message.slice(0, 500), occurrences, ...(outcome === "sent" ? { last_sent_at: new Date().toISOString() } : {}) },
    { onConflict: "key" },
  );
  if (outcome === "not_configured") console.warn("ops alert (no OPS_ALERT_WEBHOOK_URL):", key);
  return outcome;
}

export async function clearAlert(db: Db, key: string) {
  await db.from("ops_alerts").delete().eq("key", key);
}

/** Ping an external dead-man's switch (healthchecks.io, Better Stack…) on success. It alerts when pings stop. */
export async function pingHeartbeat(fetchImpl: typeof fetch = fetch) {
  const url = process.env.OPS_HEARTBEAT_URL;
  if (!url) return "not_configured" as const;
  try {
    await fetchImpl(url, { method: "GET", signal: AbortSignal.timeout(10_000) });
    return "sent" as const;
  } catch {
    return "failed" as const;
  }
}

/** After each scheduled run: alert on repeated failures, clear the alert once it recovers, ping the heartbeat on success. */
export async function afterRun(db: Db, status: "completed" | "partial" | "failed", detail: string) {
  if (status === "failed" || status === "partial") {
    const { data: recent } = await db.from("ingestion_runs").select("status, sources_failed").neq("trigger", "manual").order("started_at", { ascending: false }).limit(FAILED_RUNS_BEFORE_ALERT);
    const bad = (recent ?? []).filter((r) => r.status === "failed" || r.sources_failed > 0).length;
    if (bad >= FAILED_RUNS_BEFORE_ALERT) await raiseAlert(db, "ingestion-repeated-failures", `${bad} collectes consécutives en échec ou incomplètes. Dernière erreur : ${detail}`);
  }
  if (status === "completed") {
    await clearAlert(db, "ingestion-repeated-failures");
    await pingHeartbeat();
  }
}

/** Independent check of the last successful run, usable by an external uptime monitor (see /api/health/ingestion). */
export async function lastSuccessStatus(db: Db, now = Date.now()) {
  const { data } = await db.from("ingestion_runs").select("finished_at").in("status", ["completed", "partial"]).neq("trigger", "manual").order("finished_at", { ascending: false }).limit(1);
  const last = data?.[0]?.finished_at ?? null;
  const age = last ? now - Date.parse(last) : Infinity;
  return { lastSuccessAt: last, healthy: age <= MAX_SUCCESS_AGE_MS, maxAgeHours: MAX_SUCCESS_AGE_MS / 3600_000 };
}

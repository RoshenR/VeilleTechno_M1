// Deterministic package/version ↔ advisory comparison. No AI, no network: same inputs → same result.
// A match means « version importée dans la plage affectée » — a risk to examine, not proof of exploitability.

import semver from "semver";
import { comparable, type DepEntry } from "./dependencies";
import type { Advisory } from "./sources/github";

export type FindingStatus = "affected" | "not_affected" | "unknown_version" | "incomplete" | "withdrawn";

export const FINDING_LABELS: Record<FindingStatus, string> = {
  affected: "Version importée dans la plage affectée",
  not_affected: "Version importée hors de la plage de cet avis",
  unknown_version: "Version exacte inconnue — à vérifier",
  incomplete: "Analyse indisponible ou incomplète",
  withdrawn: "Avis retiré",
};

export type PatchInfo = { range: string; patched: string | null; sameMajor: boolean | null; applies: boolean };
export type Finding = { ghsaId: string; package: string; status: FindingStatus; matchedRange: string | null; patched: PatchInfo[] };

/** GitHub writes ranges as ">= 1.0.0, < 1.2.3" or "= 2.0.0"; node-semver wants ">=1.0.0 <1.2.3". Null if unparseable. */
export function toSemverRange(gh: string | null): string | null {
  if (!gh) return null;
  const r = gh
    .split(",")
    .map((p) => p.trim().replace(/^(>=|<=|>|<|=)\s+/, "$1"))
    .join(" ");
  return semver.validRange(r) !== null ? r : null;
}

// Prereleases are compared mathematically (2.0.0-beta.1 is below 2.0.0): conservative for security.
const OPTS = { includePrerelease: true } as const;

export function evaluate(entry: Pick<DepEntry, "name" | "version" | "declared" | "resolution">, adv: Advisory): Finding {
  const vulns = adv.vulnerabilities.filter((v) => v.package === entry.name);
  const version = comparable(entry) ? entry.version! : null;
  const ranges = vulns.map((v) => ({ v, range: toSemverRange(v.range) }));
  const patched = ranges.map(({ v, range }) => ({
    range: v.range ?? "?",
    patched: v.patched,
    sameMajor: v.patched && version && semver.valid(v.patched) ? semver.major(v.patched) === semver.major(version) : null,
    applies: Boolean(version && range && semver.satisfies(version, range, OPTS)),
  }));
  const base = { ghsaId: adv.ghsaId, package: entry.name, patched };
  if (adv.withdrawnAt) return { ...base, status: "withdrawn", matchedRange: null };
  if (!vulns.length) return { ...base, status: "not_affected", matchedRange: null };
  if (ranges.some((r) => r.range === null)) return { ...base, status: "incomplete", matchedRange: null };

  if (version) {
    const hit = ranges.find((r) => semver.satisfies(version, r.range!, OPTS));
    return hit ? { ...base, status: "affected", matchedRange: hit.v.range } : { ...base, status: "not_affected", matchedRange: null };
  }
  // Only a declared range: if no version it allows can fall in an affected range, the advisory cannot apply.
  const declared = entry.resolution === "range" ? semver.validRange(entry.declared ?? "") : null;
  if (declared) {
    const overlap = ranges.find((r) => semver.intersects(declared, r.range!, OPTS));
    return overlap ? { ...base, status: "unknown_version", matchedRange: overlap.v.range } : { ...base, status: "not_affected", matchedRange: null };
  }
  return { ...base, status: "unknown_version", matchedRange: null };
}

/** All findings for an inventory against a set of advisories (only advisories that name the package). */
export function evaluateInventory(entries: Pick<DepEntry, "name" | "version" | "declared" | "resolution" | "excluded">[], advisories: Advisory[]) {
  const byPackage = new Map<string, Advisory[]>();
  for (const a of advisories) for (const v of a.vulnerabilities) if (!byPackage.get(v.package)?.includes(a)) byPackage.set(v.package, [...(byPackage.get(v.package) ?? []), a]);
  const out: { entry: (typeof entries)[number]; finding: Finding }[] = [];
  for (const e of entries) {
    if (e.excluded) continue;
    for (const a of byPackage.get(e.name) ?? []) out.push({ entry: e, finding: evaluate(e, a) });
  }
  return out;
}

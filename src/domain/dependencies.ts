// Dependency import: package.json and package-lock.json (lockfileVersion 2 and 3).
// Pure and side-effect free — runs in the browser for the preview, so the raw file never leaves the device.
// Nothing is installed or executed; scripts, `resolved` URLs, integrity hashes and credentials are dropped.

import semver from "semver";
import { z } from "zod";

export const MAX_IMPORT_BYTES = 10_000_000;
export const MAX_ENTRIES = 10_000;

export const RESOLUTIONS = ["exact", "range", "resolved", "local", "alias", "workspace", "git", "url", "tag", "unresolved"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];
export const SCOPES = ["prod", "dev", "optional", "peer", "unknown"] as const;
export type Scope = (typeof SCOPES)[number];

export const RESOLUTION_LABELS: Record<Resolution, string> = {
  exact: "Version exacte déclarée",
  range: "Plage déclarée",
  resolved: "Version résolue (lockfile)",
  local: "Dépendance locale",
  alias: "Alias npm",
  workspace: "Workspace",
  git: "URL Git",
  url: "URL d’archive",
  tag: "Étiquette (tag)",
  unresolved: "Non résolue",
};
export const SCOPE_LABELS: Record<Scope, string> = { prod: "production", dev: "développement", optional: "optionnelle", peer: "pair (peer)", unknown: "contexte inconnu" };

export const depEntrySchema = z.object({
  name: z.string().min(1).max(214).regex(/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i),
  declared: z.string().max(300).nullable(),
  version: z.string().max(100).nullable(),
  resolution: z.enum(RESOLUTIONS),
  isDirect: z.boolean(),
  scope: z.enum(SCOPES),
  excluded: z.boolean().default(false),
});
export type DepEntry = z.infer<typeof depEntrySchema>;

export const inventorySchema = z.object({
  origin: z.enum(["package.json", "package-lock.json"]),
  fileName: z.string().max(200).nullable(),
  lockfileVersion: z.number().int().nullable(),
  entries: z.array(depEntrySchema).max(MAX_ENTRIES),
  warnings: z.array(z.string().max(300)).max(50),
});
export type Inventory = z.infer<typeof inventorySchema>;

export class ImportError extends Error {}

const NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;
/** Packages whose version can be compared against advisories. */
export const comparable = (e: Pick<DepEntry, "resolution" | "version">) => Boolean(e.version) && (e.resolution === "exact" || e.resolution === "resolved" || e.resolution === "alias");
/** Names that may be sent to the advisory service: npm registry packages only, never local / git / workspace ones. */
export const transmittable = (e: Pick<DepEntry, "resolution" | "excluded">) => !e.excluded && !["local", "workspace", "git", "url"].includes(e.resolution);

/** Remove credentials, query strings and fragments from a URL-like spec; keep only host + path. */
export function stripUrl(spec: string): string {
  const cleaned = spec.replace(/^git\+/, "");
  try {
    const u = new URL(cleaned.replace(/^git@([^:]+):/, "ssh://$1/"));
    return `${u.hostname}${u.pathname}`.replace(/\.git$/, "").slice(0, 200);
  } catch {
    return spec.split(/[?#]/)[0].replace(/\/\/[^@/]*@/, "//").slice(0, 200);
  }
}

/** Classify a declared spec from package.json. Never guesses a version that is not written down. */
export function classifySpec(raw: string): { resolution: Resolution; version: string | null; declared: string } {
  const spec = String(raw).trim();
  if (spec.startsWith("npm:")) return { resolution: "alias", version: null, declared: spec.slice(0, 300) };
  if (/^(file:|link:|\.{1,2}\/|\/|~\/)/.test(spec)) return { resolution: "local", version: null, declared: "local" };
  if (spec.startsWith("workspace:")) return { resolution: "workspace", version: null, declared: spec.slice(0, 50) };
  if (/^(git\+|git:|git@|github:|gitlab:|bitbucket:|gist:)/.test(spec) || /^[\w.-]+\/[\w.-]+(#.*)?$/.test(spec))
    return { resolution: "git", version: null, declared: `git ${stripUrl(spec)}` };
  if (/^https?:\/\//.test(spec)) return { resolution: "url", version: null, declared: `url ${stripUrl(spec)}` };
  const exact = semver.valid(spec.replace(/^[=v]+/, ""));
  if (exact) return { resolution: "exact", version: exact, declared: spec };
  if (semver.validRange(spec) !== null) return { resolution: "range", version: null, declared: spec.slice(0, 300) };
  if (/^[a-z][\w.-]*$/i.test(spec)) return { resolution: "tag", version: null, declared: spec.slice(0, 50) };
  return { resolution: "unresolved", version: null, declared: spec.slice(0, 100) };
}

const DEP_FIELDS = [
  ["dependencies", "prod"],
  ["devDependencies", "dev"],
  ["optionalDependencies", "optional"],
  ["peerDependencies", "peer"],
] as const;

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function readJson(text: string): Json {
  if (text.length > MAX_IMPORT_BYTES) throw new ImportError(`Fichier trop volumineux (max ${MAX_IMPORT_BYTES / 1_000_000} Mo).`);
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new ImportError("Ce fichier n’est pas un JSON valide. Formats acceptés : package.json, package-lock.json (v2, v3).");
  }
  if (!isObj(doc)) throw new ImportError("Structure inattendue : un objet JSON est attendu.");
  return doc;
}

function finish(inv: Omit<Inventory, "entries"> & { entries: DepEntry[] }): Inventory {
  const seen = new Set<string>();
  const entries = inv.entries.filter((e) => {
    const k = `${e.name}|${e.version}|${e.declared}|${e.scope}|${e.isDirect}|${e.resolution}`;
    return !seen.has(k) && seen.add(k);
  });
  if (entries.length > MAX_ENTRIES) throw new ImportError(`Trop de dépendances (${entries.length}, max ${MAX_ENTRIES}).`);
  return inventorySchema.parse({ ...inv, entries });
}

export function parsePackageJson(doc: Json, fileName: string | null = null): Inventory {
  const entries: DepEntry[] = [];
  const warnings: string[] = [];
  for (const [field, scope] of DEP_FIELDS) {
    const deps = doc[field];
    if (deps === undefined) continue;
    if (!isObj(deps)) {
      warnings.push(`Champ « ${field} » ignoré : objet attendu.`);
      continue;
    }
    for (const [name, spec] of Object.entries(deps)) {
      if (!NAME_RE.test(name) || typeof spec !== "string") {
        warnings.push(`Entrée ignorée dans ${field} : nom ou version invalide.`);
        continue;
      }
      entries.push({ name, ...classifySpec(spec), isDirect: true, scope, excluded: false });
    }
  }
  if (doc.workspaces) warnings.push("Workspaces déclarés : les packages internes ne sont pas analysés. Importe le package-lock.json racine pour les versions résolues.");
  if (!entries.length) warnings.push("Aucune dépendance trouvée dans ce package.json.");
  return finish({ origin: "package.json", fileName, lockfileVersion: null, entries, warnings: warnings.slice(0, 50) });
}

export function parsePackageLock(doc: Json, fileName: string | null = null): Inventory {
  const v = doc.lockfileVersion;
  if (v === 1 || (!isObj(doc.packages) && isObj(doc.dependencies)))
    throw new ImportError("package-lock.json v1 (npm 6) non pris en charge pour l’instant : régénère-le avec npm 7 ou plus récent (lockfileVersion 2 ou 3).");
  if (v !== 2 && v !== 3) throw new ImportError(`lockfileVersion ${String(v)} non pris en charge. Formats acceptés : 2 et 3.`);
  if (!isObj(doc.packages)) throw new ImportError("Lockfile incomplet : section « packages » absente.");

  const root = isObj(doc.packages[""]) ? (doc.packages[""] as Json) : {};
  const direct = new Map<string, string>(); // name → declared spec in the root manifest
  for (const [field] of DEP_FIELDS) if (isObj(root[field])) for (const [n, s] of Object.entries(root[field] as Json)) if (typeof s === "string") direct.set(n, s);

  const entries: DepEntry[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  for (const [path, raw] of Object.entries(doc.packages)) {
    if (path === "" || !isObj(raw)) continue;
    const idx = path.lastIndexOf("node_modules/");
    const installedAs = idx >= 0 ? path.slice(idx + "node_modules/".length) : null;
    const realName = typeof raw.name === "string" ? raw.name : installedAs;
    if (!realName || !NAME_RE.test(realName)) {
      // Workspace folders ("packages/app") without a name, or malformed keys.
      skipped++;
      continue;
    }
    const scope: Scope = raw.dev === true ? "dev" : raw.peer === true ? "peer" : raw.optional === true ? "optional" : raw.devOptional === true ? "unknown" : "prod";
    const isDirect = idx === 0 && installedAs !== null && direct.has(installedAs);
    const declared = isDirect ? (direct.get(installedAs!) ?? null) : null;
    const resolvedUrl = typeof raw.resolved === "string" ? raw.resolved : "";
    let resolution: Resolution;
    let version: string | null = null;
    if (idx < 0 || raw.link === true) resolution = "workspace";
    else if (/^(git\+|git:|git@|github:)/.test(resolvedUrl)) resolution = "git";
    else if (resolvedUrl.startsWith("file:")) resolution = "local";
    else if (typeof raw.version === "string" && semver.valid(raw.version)) {
      version = semver.valid(raw.version);
      resolution = installedAs !== realName ? "alias" : "resolved";
    } else resolution = "unresolved";
    entries.push({
      name: realName,
      declared: declared ? classifySpec(declared).declared : installedAs !== realName ? `alias ${installedAs}` : null,
      version,
      resolution,
      isDirect,
      scope,
      excluded: false,
    });
  }
  if (skipped) warnings.push(`${skipped} entrée(s) sans nom de package identifiable ignorée(s).`);
  // Direct dependencies declared but absent from the tree (not installed, or optional on another platform).
  const present = new Set(entries.filter((e) => e.isDirect).map((e) => e.name));
  for (const [name, spec] of direct) if (!present.has(name) && NAME_RE.test(name)) entries.push({ name, ...classifySpec(spec), resolution: "unresolved", version: null, isDirect: true, scope: "unknown", excluded: false });
  return finish({ origin: "package-lock.json", fileName, lockfileVersion: v, entries, warnings: warnings.slice(0, 50) });
}

/** Detect the format and parse. Throws ImportError with a user-facing message for unsupported files. */
export function parseDependencyFile(text: string, fileName: string | null = null): Inventory {
  const doc = readJson(text);
  if ("lockfileVersion" in doc) return parsePackageLock(doc, fileName);
  if (["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "name"].some((k) => k in doc)) return parsePackageJson(doc, fileName);
  throw new ImportError("Format non reconnu. Formats acceptés : package.json, package-lock.json (lockfileVersion 2 ou 3). Les autres lockfiles (yarn, pnpm, bun) ne sont pas encore pris en charge.");
}

/** Mark private packages (exact names or `@scope/*` patterns) so they are never sent to the advisory service. */
export function applyExclusions(entries: DepEntry[], patterns: string[]): DepEntry[] {
  const rules = patterns.map((p) => p.trim().toLowerCase()).filter(Boolean);
  const match = (n: string) => rules.some((r) => (r.endsWith("*") ? n.toLowerCase().startsWith(r.slice(0, -1)) : n.toLowerCase() === r));
  return entries.map((e) => ({ ...e, excluded: match(e.name) }));
}

type DiffEntry = { name: string; version: string | null; declared: string | null };
const key = (e: DiffEntry) => `${e.name}@${e.version ?? e.declared ?? "?"}`;

/** Preview of what a new import changes compared with the current inventory. */
export function diffInventories(prev: DiffEntry[], next: DiffEntry[]) {
  const before = new Map(prev.map((e) => [key(e), e]));
  const after = new Map(next.map((e) => [key(e), e]));
  const added = [...after.keys()].filter((k) => !before.has(k));
  const removed = [...before.keys()].filter((k) => !after.has(k));
  const namesBefore = new Set(prev.map((e) => e.name));
  const namesAfter = new Set(next.map((e) => e.name));
  const changed = [...namesAfter].filter((n) => namesBefore.has(n) && added.some((k) => k.startsWith(`${n}@`)));
  return { added, removed, changed, unchanged: [...after.keys()].filter((k) => before.has(k)).length };
}

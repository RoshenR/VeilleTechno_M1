import { z } from "zod";
import { FetchError, fetchText, type Conditional } from "./http";
import { canonicalUrl, classifyKind, hashContent, parseDate, toExcerpt, type NormalizedItem } from "./normalize";

// Single entry point for every GitHub REST call: fixed host, server-side token, serialized requests,
// process-wide quota gate, rate headers captured for diagnostics. User input only ever fills validated
// path segments (owner/repo) or query values (package names).
const API_HOST = "api.github.com";
const PER_PAGE = 30;
const MAX_RELEASE_PAGES = 2;
const MIN_SPACING_MS = 250; // serial + spaced requests keep us far from secondary limits

export type RateInfo = { limit: number; remaining: number; resetAt: number; resource: string | null; authenticated: boolean };

let lastRate: RateInfo | null = null;
let blockedUntil = 0; // primary/secondary limit known to this process (also persisted by the caller)
let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

export const githubTokenConfigured = () => Boolean(process.env.GITHUB_TOKEN);
export const githubRate = () => lastRate;
/** Seed the gate from persisted state (another instance may have hit the quota). */
export const setGithubBlockedUntil = (ms: number) => {
  blockedUntil = Math.max(blockedUntil, ms);
};
export const githubBlockedUntil = () => blockedUntil;
/** Tests only. */
export const resetGithubClient = () => {
  blockedUntil = 0;
  lastRate = null;
  lastCallAt = 0;
};

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  // Never logged; only ever sent to api.github.com (allowedHost below).
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

function captureRate(h: Headers) {
  const limit = Number(h.get("x-ratelimit-limit"));
  if (!Number.isFinite(limit) || !limit) return;
  lastRate = {
    limit,
    remaining: Number(h.get("x-ratelimit-remaining") ?? 0),
    resetAt: Number(h.get("x-ratelimit-reset") ?? 0) * 1000,
    resource: h.get("x-ratelimit-resource"),
    authenticated: limit > 60,
  };
}

/** GET https://api.github.com{path}. Serialized; refuses to call while a known limit is active. */
export function githubGet(pathOrUrl: string, cond: Conditional = {}, fetchImpl?: typeof fetch) {
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `https://${API_HOST}${pathOrUrl}`;
  if (new URL(url).hostname !== API_HOST) return Promise.reject(new FetchError("Hôte GitHub inattendu", false, undefined, "invalid"));
  const run = async () => {
    if (Date.now() < blockedUntil)
      throw new FetchError("Quota GitHub épuisé : appel reporté", false, Math.ceil((blockedUntil - Date.now()) / 1000), "quota");
    const wait = lastCallAt + MIN_SPACING_MS - Date.now();
    if (wait > 0 && !fetchImpl) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    try {
      const res = await fetchText(url, { ...cond, headers: headers(), allowedHost: API_HOST, fetchImpl });
      captureRate(res.headers);
      return res;
    } catch (e) {
      if (e instanceof FetchError && (e.kind === "quota" || e.kind === "secondary_quota") && e.retryAfterSeconds)
        blockedUntil = Math.max(blockedUntil, Date.now() + e.retryAfterSeconds * 1000);
      throw e;
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

export function nextLink(link: string | null): string | null {
  const m = link?.match(/<([^>]+)>;\s*rel="next"/);
  if (!m) return null;
  const u = new URL(m[1]);
  return u.hostname === API_HOST ? u.toString() : null;
}

const parseJson = <T>(schema: z.ZodType<T>, body: string): T => {
  try {
    return schema.parse(JSON.parse(body));
  } catch {
    throw new FetchError("Réponse GitHub inattendue", false, undefined, "invalid");
  }
};

// ───────────────────────── Releases ─────────────────────────

const releaseSchema = z.object({
  id: z.number(),
  html_url: z.string().url(),
  tag_name: z.string(),
  name: z.string().nullable(),
  body: z.string().nullable().optional(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  published_at: z.string().nullable(),
});

const repoPath = (repo: string, path = "") => {
  const [owner, name] = repo.split("/");
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${path}`;
};

/** Markdown release notes → plain extract. */
const stripMarkdown = (md: string | null | undefined) =>
  md ? md.replace(/```[\s\S]*?```/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[#*_`>|]/g, " ") : null;

export function normalizeRelease(repo: string, r: z.infer<typeof releaseSchema>): NormalizedItem | null {
  if (r.draft) return null;
  const url = canonicalUrl(r.html_url);
  if (!url) return null;
  const title = `${repo} ${r.name?.trim() || r.tag_name}`.slice(0, 300);
  const excerpt = toExcerpt(stripMarkdown(r.body));
  const kind = classifyKind(title, excerpt);
  return {
    externalId: `gh-release:${r.id}`,
    canonicalUrl: url,
    title,
    excerpt,
    kind: kind === "security" || kind === "breaking" ? kind : "release",
    isPrerelease: r.prerelease || /-(alpha|beta|rc|canary|next|preview|pre)/i.test(r.tag_name),
    releaseTag: r.tag_name.slice(0, 100),
    publishedAt: parseDate(r.published_at),
    contentHash: hashContent(title, excerpt, r.tag_name),
  };
}

export async function fetchReleases(repo: string, cond: Conditional, fetchImpl?: typeof fetch) {
  const first = await githubGet(repoPath(repo, `/releases?per_page=${PER_PAGE}`), cond, fetchImpl);
  if (first.status === "not_modified") return { status: "not_modified" as const };
  const pages = [first.body];
  // Follow pagination only on the very first collection (no validator yet), bounded.
  let next = !cond.etag ? nextLink(first.headers.get("link")) : null;
  while (next && pages.length < MAX_RELEASE_PAGES) {
    const page = await githubGet(next, {}, fetchImpl);
    if (page.status !== "ok") break;
    pages.push(page.body);
    next = nextLink(page.headers.get("link"));
  }
  const items = pages
    .flatMap((b) => parseJson(z.array(releaseSchema), b))
    .map((r) => normalizeRelease(repo, r))
    .filter((i): i is NormalizedItem => i !== null);
  return { status: "ok" as const, items, etag: first.etag, lastModified: first.lastModified };
}

/** Check that a public repository exists. Returns its canonical full name (repos can be renamed). */
export async function verifyPublicRepo(repo: string): Promise<{ fullName: string; description: string | null } | null> {
  try {
    const res = await githubGet(repoPath(repo));
    if (res.status !== "ok") return null;
    const data = parseJson(z.object({ full_name: z.string(), private: z.boolean(), description: z.string().nullable() }), res.body);
    return data.private ? null : { fullName: data.full_name, description: data.description };
  } catch {
    return null;
  }
}

/** Quota check: GET /rate_limit does not consume the primary quota. */
export async function checkGithubAccess(fetchImpl?: typeof fetch): Promise<RateInfo> {
  const res = await githubGet("/rate_limit", {}, fetchImpl);
  if (res.status !== "ok") throw new FetchError("Réponse inattendue", false);
  const core = parseJson(z.object({ resources: z.object({ core: z.object({ limit: z.number(), remaining: z.number(), reset: z.number() }) }) }), res.body).resources.core;
  return { limit: core.limit, remaining: core.remaining, resetAt: core.reset * 1000, resource: "core", authenticated: core.limit > 60 };
}

// ───────────────────────── Global security advisories (npm, reviewed) ─────────────────────────

const advisorySchema = z.object({
  ghsa_id: z.string(),
  cve_id: z.string().nullable(),
  summary: z.string(),
  severity: z.string().nullable(),
  html_url: z.string().url(),
  published_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  withdrawn_at: z.string().nullable(),
  vulnerabilities: z
    .array(
      z.object({
        package: z.object({ ecosystem: z.string(), name: z.string().nullable() }).nullable(),
        vulnerable_version_range: z.string().nullable(),
        first_patched_version: z.string().nullable(),
      }),
    )
    .nullable(),
});

export type Advisory = {
  ghsaId: string;
  cveId: string | null;
  summary: string;
  severity: string;
  htmlUrl: string;
  publishedAt: string | null;
  updatedAt: string | null;
  withdrawnAt: string | null;
  vulnerabilities: { package: string; range: string | null; patched: string | null }[];
};

export function normalizeAdvisory(a: z.infer<typeof advisorySchema>): Advisory {
  return {
    ghsaId: a.ghsa_id,
    cveId: a.cve_id,
    summary: a.summary.slice(0, 500),
    severity: a.severity ?? "unknown",
    htmlUrl: a.html_url,
    publishedAt: a.published_at,
    updatedAt: a.updated_at,
    withdrawnAt: a.withdrawn_at,
    vulnerabilities: (a.vulnerabilities ?? [])
      .filter((v) => v.package?.ecosystem === "npm" && v.package.name)
      .map((v) => ({ package: v.package!.name!, range: v.vulnerable_version_range, patched: v.first_patched_version })),
  };
}

const MAX_AFFECTS_PER_CALL = 100; // short query strings (GitHub accepts up to 1000 names)
const MAX_ADVISORY_PAGES = 10;

/**
 * Reviewed npm advisories affecting these package names. Only names are sent — never versions,
 * project names or notes. Follows the Link-header cursor; asks separately for withdrawn advisories.
 * Returns what could be fetched plus the names left unchecked (quota, error) so callers can say « incomplet ».
 */
export async function fetchAdvisories(packages: string[], opts: { modifiedSince?: string; fetchImpl?: typeof fetch } = {}) {
  const advisories = new Map<string, Advisory>();
  const unchecked: string[] = [];
  let error: FetchError | null = null;
  const names = [...new Set(packages)].sort();
  for (let i = 0; i < names.length; i += MAX_AFFECTS_PER_CALL) {
    const chunk = names.slice(i, i + MAX_AFFECTS_PER_CALL);
    if (error) {
      unchecked.push(...chunk);
      continue;
    }
    try {
      for (const withdrawn of [false, true]) {
        const qs = new URLSearchParams({ ecosystem: "npm", type: "reviewed", per_page: "100", affects: chunk.join(",") });
        if (withdrawn) qs.set("is_withdrawn", "true");
        if (opts.modifiedSince) qs.set("modified", `>=${opts.modifiedSince.slice(0, 10)}`);
        let next: string | null = `/advisories?${qs}`;
        for (let page = 0; next && page < MAX_ADVISORY_PAGES; page++) {
          const res = await githubGet(next, {}, opts.fetchImpl);
          if (res.status !== "ok") break;
          for (const a of parseJson(z.array(advisorySchema), res.body)) advisories.set(a.ghsa_id, normalizeAdvisory(a));
          next = nextLink(res.headers.get("link"));
        }
      }
    } catch (e) {
      error = e instanceof FetchError ? e : new FetchError((e as Error).message, false);
      unchecked.push(...chunk);
    }
  }
  return { advisories: [...advisories.values()], unchecked, error };
}

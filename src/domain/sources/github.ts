import { z } from "zod";
import { fetchText, type Conditional } from "./http";
import { canonicalUrl, classifyKind, hashContent, parseDate, toExcerpt, type NormalizedItem } from "./normalize";

// Fixed host: user input only ever fills the owner/repo path segments (validated by parseGithubRepo).
const API_HOST = "api.github.com";
const PER_PAGE = 30;
const MAX_PAGES = 2;

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

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

const repoUrl = (repo: string, path = "") => {
  const [owner, name] = repo.split("/");
  return `https://${API_HOST}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${path}`;
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
  const first = await fetchText(repoUrl(repo, `/releases?per_page=${PER_PAGE}`), { ...cond, headers: headers(), allowedHost: API_HOST, fetchImpl });
  if (first.status === "not_modified") return first;
  const pages = [first.body];
  // Follow pagination only on the very first collection (no validator yet), bounded by MAX_PAGES.
  let next = !cond.etag ? nextLink(first.headers.get("link")) : null;
  while (next && pages.length < MAX_PAGES) {
    const page = await fetchText(next, { headers: headers(), allowedHost: API_HOST, fetchImpl });
    if (page.status !== "ok") break;
    pages.push(page.body);
    next = nextLink(page.headers.get("link"));
  }
  const items = pages
    .flatMap((b) => z.array(releaseSchema).parse(JSON.parse(b)))
    .map((r) => normalizeRelease(repo, r))
    .filter((i): i is NormalizedItem => i !== null);
  return { status: "ok" as const, items, etag: first.etag, lastModified: first.lastModified };
}

function nextLink(link: string | null): string | null {
  const m = link?.match(/<([^>]+)>;\s*rel="next"/);
  if (!m) return null;
  const u = new URL(m[1]);
  return u.hostname === API_HOST ? u.toString() : null;
}

/** Check that a public repository exists. Returns its canonical full name (repos can be renamed). */
export async function verifyPublicRepo(repo: string): Promise<{ fullName: string; description: string | null } | null> {
  try {
    const res = await fetchText(repoUrl(repo), { headers: headers(), allowedHost: API_HOST });
    if (res.status !== "ok") return null;
    const data = z.object({ full_name: z.string(), private: z.boolean(), description: z.string().nullable() }).parse(JSON.parse(res.body));
    return data.private ? null : { fullName: data.full_name, description: data.description };
  } catch {
    return null;
  }
}

// Source catalog. Every URL below was fetched on 2026-10-29 and returned a valid RSS/Atom
// document (or a 200 from the GitHub API). See README « Sources » for excluded/unavailable feeds.

export type CatalogSource = {
  kind: "rss" | "github";
  key: string; // feed URL, or lowercased owner/repo
  name: string;
  siteUrl: string;
  language: "en" | "fr";
  techKeys: string[];
  quality: number; // 0..10, see ranking « source » factor
  isOfficial: boolean;
};

const rss = (key: string, name: string, siteUrl: string, techKeys: string[], o: Partial<CatalogSource> = {}): CatalogSource => ({
  kind: "rss", key, name, siteUrl, techKeys, language: "en", quality: 10, isOfficial: true, ...o,
});
const gh = (repo: string, name: string, techKeys: string[]): CatalogSource => ({
  kind: "github", key: repo.toLowerCase(), name, siteUrl: `https://github.com/${repo}`, techKeys, language: "en", quality: 10, isOfficial: true,
});

export const SOURCE_CATALOG: CatalogSource[] = [
  rss("https://nextjs.org/feed.xml", "Blog Next.js", "https://nextjs.org/blog", ["nextjs", "react"]),
  rss("https://react.dev/rss.xml", "Blog React", "https://react.dev/blog", ["react"]),
  rss("https://supabase.com/rss.xml", "Blog Supabase", "https://supabase.com/blog", ["supabase"]),
  rss("https://github.blog/changelog/feed/", "GitHub Changelog", "https://github.blog/changelog/", ["github-actions"]),
  rss("https://nodejs.org/en/feed/blog.xml", "Blog Node.js", "https://nodejs.org/en/blog", ["nodejs"]),
  rss("https://www.postgresql.org/news.rss", "Actualités PostgreSQL", "https://www.postgresql.org/", ["postgresql"]),
  rss("https://devblogs.microsoft.com/typescript/feed/", "Blog TypeScript", "https://devblogs.microsoft.com/typescript/", ["typescript"]),
  rss("https://tailwindcss.com/feeds/feed.xml", "Blog Tailwind CSS", "https://tailwindcss.com/blog", ["tailwindcss"]),
  rss("https://expo.dev/changelog/rss.xml", "Changelog Expo", "https://expo.dev/changelog", ["expo", "react-native"]),
  rss("https://stripe.com/blog/feed.rss", "Blog Stripe", "https://stripe.com/blog", ["stripe"]),
  rss("https://deno.com/feed", "Blog Deno", "https://deno.com/blog", ["deno"]),
  rss("https://blog.cloudflare.com/rss/", "Blog Cloudflare", "https://blog.cloudflare.com/", ["cloudflare"]),
  rss("https://developer.mozilla.org/en-US/blog/rss.xml", "Blog MDN", "https://developer.mozilla.org/en-US/blog/", ["css"], { quality: 9 }),
  rss("https://web.dev/feed.xml", "web.dev", "https://web.dev/", ["css"], { quality: 9 }),
  rss("https://www.smashingmagazine.com/feed/", "Smashing Magazine", "https://www.smashingmagazine.com/", [], { quality: 7, isOfficial: false }),
  rss("https://www.alsacreations.com/rss/actualites.xml", "Alsacréations — actualités", "https://www.alsacreations.com/", ["css"], { language: "fr", quality: 7, isOfficial: false }),
  // French sources added 2026-10-29 after checking feed validity, recency and fit (see README « Sources »).
  rss("https://cert.cyber.gouv.fr/avis/feed/", "CERT-FR — avis de sécurité", "https://cert.cyber.gouv.fr/avis/", [], { language: "fr", quality: 9 }),
  rss("https://blog.octo.com/feed/", "OCTO Talks", "https://blog.octo.com/", [], { language: "fr", quality: 7, isOfficial: false }),
  gh("vercel/next.js", "Releases Next.js", ["nextjs"]),
  gh("react/react", "Releases React", ["react"]),
  gh("supabase/supabase-js", "Releases supabase-js", ["supabase"]),
  gh("expo/expo", "Releases Expo", ["expo"]),
  gh("stripe/stripe-node", "Releases stripe-node", ["stripe"]),
  gh("prisma/orm", "Releases Prisma ORM", ["prisma"]),
  gh("drizzle-team/drizzle-orm", "Releases Drizzle ORM", ["drizzle"]),
  gh("tailwindlabs/tailwindcss", "Releases Tailwind CSS", ["tailwindcss"]),
  gh("microsoft/playwright", "Releases Playwright", ["playwright"]),
  gh("vitest-dev/vitest", "Releases Vitest", ["vitest"]),
  gh("colinhacks/zod", "Releases Zod", ["zod"]),
  gh("nodejs/node", "Releases Node.js", ["nodejs"]),
];

/** General-purpose sources every new project follows, whatever its stack. */
export const GENERAL_SOURCE_KEYS = [
  "https://developer.mozilla.org/en-US/blog/rss.xml",
  "https://web.dev/feed.xml",
  "https://www.smashingmagazine.com/feed/",
  "https://www.alsacreations.com/rss/actualites.xml",
  "https://cert.cyber.gouv.fr/avis/feed/",
  "https://blog.octo.com/feed/",
];

/** Catalog sources a project should follow given its technologies. */
export function defaultSourceKeys(techKeys: string[]): string[] {
  const set = new Set(techKeys);
  return [...new Set([...GENERAL_SOURCE_KEYS, ...SOURCE_CATALOG.filter((s) => s.techKeys.some((t) => set.has(t))).map((s) => s.key)])];
}

/** Normalize user input to owner/repo. Accepts "owner/repo" or a github.com URL. Returns null if invalid. */
export function parseGithubRepo(input: string): string | null {
  const m = input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "")
    .match(/^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/);
  if (!m || m[2] === "." || m[2] === "..") return null;
  return `${m[1]}/${m[2]}`.toLowerCase();
}

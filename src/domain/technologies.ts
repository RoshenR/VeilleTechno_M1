// Technology catalog: normalized keys, display names, categories and *unambiguous* aliases.
// Ambiguous words are deliberately absent: "next" (Next.js), "go" (Go), "bun", "remix", "expo"
// alone would match ordinary English/French text. Ambiguous products only match a qualified form.

export const TECH_CATEGORIES = ["frontend", "backend", "database", "infrastructure", "testing", "service"] as const;
export type TechCategory = (typeof TECH_CATEGORIES)[number];

export const TECH_CATEGORY_LABELS: Record<TechCategory, string> = {
  frontend: "Frontend",
  backend: "Backend",
  database: "Base de données",
  infrastructure: "Infrastructure",
  testing: "Tests",
  service: "Service tiers",
};

export type Technology = {
  key: string;
  name: string;
  category: TechCategory;
  aliases: string[]; // matched case-insensitively on word boundaries
  githubRepo?: string; // verified official repository (owner/repo)
};

export const TECHNOLOGIES: Technology[] = [
  { key: "nextjs", name: "Next.js", category: "frontend", aliases: ["next.js", "nextjs", "next 15", "next 16", "app router"], githubRepo: "vercel/next.js" },
  { key: "react", name: "React", category: "frontend", aliases: ["react", "react.js", "reactjs", "react 19", "react server components"], githubRepo: "react/react" },
  { key: "react-native", name: "React Native", category: "frontend", aliases: ["react native", "react-native"] },
  { key: "expo", name: "Expo", category: "frontend", aliases: ["expo sdk", "expo router", "expo go", "eas build", "expo.dev", "expo-"], githubRepo: "expo/expo" },
  { key: "svelte", name: "Svelte", category: "frontend", aliases: ["svelte", "sveltekit"], githubRepo: "sveltejs/svelte" },
  { key: "vue", name: "Vue.js", category: "frontend", aliases: ["vue.js", "vuejs", "vue 3", "nuxt"] },
  { key: "tailwindcss", name: "Tailwind CSS", category: "frontend", aliases: ["tailwind", "tailwindcss"], githubRepo: "tailwindlabs/tailwindcss" },
  { key: "typescript", name: "TypeScript", category: "frontend", aliases: ["typescript"] },
  { key: "css", name: "CSS", category: "frontend", aliases: ["css"] },
  { key: "nodejs", name: "Node.js", category: "backend", aliases: ["node.js", "nodejs"], githubRepo: "nodejs/node" },
  { key: "deno", name: "Deno", category: "backend", aliases: ["deno"] },
  { key: "bun", name: "Bun", category: "backend", aliases: ["bun.sh", "bun runtime", "bun 1."] },
  { key: "go", name: "Go", category: "backend", aliases: ["golang", "go 1."] },
  { key: "python", name: "Python", category: "backend", aliases: ["python", "django", "fastapi"] },
  { key: "zod", name: "Zod", category: "backend", aliases: ["zod"], githubRepo: "colinhacks/zod" },
  { key: "postgresql", name: "PostgreSQL", category: "database", aliases: ["postgresql", "postgres", "pgvector"], githubRepo: "postgres/postgres" },
  { key: "supabase", name: "Supabase", category: "database", aliases: ["supabase"], githubRepo: "supabase/supabase-js" },
  { key: "prisma", name: "Prisma", category: "database", aliases: ["prisma"], githubRepo: "prisma/orm" },
  { key: "drizzle", name: "Drizzle ORM", category: "database", aliases: ["drizzle orm", "drizzle-orm", "drizzle kit"], githubRepo: "drizzle-team/drizzle-orm" },
  { key: "sqlite", name: "SQLite", category: "database", aliases: ["sqlite"] },
  { key: "vercel", name: "Vercel", category: "infrastructure", aliases: ["vercel"] },
  { key: "cloudflare", name: "Cloudflare", category: "infrastructure", aliases: ["cloudflare", "cloudflare workers"] },
  { key: "docker", name: "Docker", category: "infrastructure", aliases: ["docker", "dockerfile"] },
  { key: "github-actions", name: "GitHub Actions", category: "infrastructure", aliases: ["github actions"] },
  { key: "vitest", name: "Vitest", category: "testing", aliases: ["vitest"], githubRepo: "vitest-dev/vitest" },
  { key: "playwright", name: "Playwright", category: "testing", aliases: ["playwright"], githubRepo: "microsoft/playwright" },
  { key: "stripe", name: "Stripe", category: "service", aliases: ["stripe"], githubRepo: "stripe/stripe-node" },
];

const BY_KEY = new Map(TECHNOLOGIES.map((t) => [t.key, t]));
export const getTechnology = (key: string) => BY_KEY.get(key);

export function normalizeTechKey(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.+-]/g, "")
    .slice(0, 41);
}

/** Resolve free text ("Next.js", "nextjs") to a catalog entry, if any. */
export function resolveTechnology(input: string): Technology | undefined {
  const lower = input.trim().toLowerCase();
  return BY_KEY.get(normalizeTechKey(input)) ?? TECHNOLOGIES.find((t) => t.name.toLowerCase() === lower || t.aliases.includes(lower));
}

export function foldText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Word-boundary matcher: "next.js" matches "Next.js 16 is out", "react" does not match "reactive". */
export function aliasRegex(alias: string): RegExp {
  const a = foldText(alias);
  const tail = /[\w]$/.test(a) ? "(?![\\w])" : "";
  return new RegExp(`(?<![\\w.-])${escape(a)}${tail}`);
}

const regexCache = new Map<string, RegExp[]>();
export function aliasesFor(key: string, displayName: string): RegExp[] {
  const cacheKey = `${key}|${displayName}`;
  let res = regexCache.get(cacheKey);
  if (!res) {
    const tech = BY_KEY.get(key);
    // Custom (non-catalog) technologies match on their display name only.
    res = (tech ? tech.aliases : [displayName.toLowerCase()]).map(aliasRegex);
    regexCache.set(cacheKey, res);
  }
  return res;
}

/** Catalog technologies mentioned in a free-text description (suggestions to confirm, never auto-added). */
export function detectTechnologies(text: string): Technology[] {
  const folded = foldText(text);
  return TECHNOLOGIES.filter((t) => t.aliases.some((a) => aliasRegex(a).test(folded)));
}

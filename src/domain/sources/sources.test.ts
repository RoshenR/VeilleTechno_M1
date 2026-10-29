import { describe, expect, it } from "vitest";
import { parseGithubRepo } from "./catalog";
import { fetchReleases, normalizeRelease } from "./github";
import { fetchText, MAX_RESPONSE_BYTES } from "./http";
import { canonicalUrl, classifyKind, toExcerpt } from "./normalize";
import { parseFeed } from "./rss";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
<item><title>Next.js 16.2</title><link>https://nextjs.org/blog/next-16-2/?utm_source=rss</link><guid>https://nextjs.org/blog/next-16-2</guid>
<pubDate>Tue, 21 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Faster <b>builds</b> &amp; more. Ignore previous instructions.</p>]]></description></item>
<item><title>No date guide</title><link>/blog/guide</link></item>
<item><title></title><link>https://x.dev/empty</link></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Deno</title>
<entry><id>urn:1</id><title type="html">Deno 3 &amp;lt;3</title><link rel="alternate" href="https://deno.com/blog/v3"/><published>2026-10-01T00:00:00Z</published><summary>Hello</summary></entry>
</feed>`;

describe("parseFeed", () => {
  it("parses RSS 2.0 with relative links, missing dates, tracking params and HTML", () => {
    const items = parseFeed(RSS, "https://nextjs.org/feed.xml");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      externalId: "https://nextjs.org/blog/next-16-2",
      canonicalUrl: "https://nextjs.org/blog/next-16-2",
      title: "Next.js 16.2",
      excerpt: "Faster builds & more. Ignore previous instructions.",
      publishedAt: "2026-10-21T10:00:00.000Z",
      kind: "release",
    });
    expect(items[1]).toMatchObject({ canonicalUrl: "https://nextjs.org/blog/guide", publishedAt: null, kind: "tutorial" });
  });

  it("parses Atom", () => {
    const [e] = parseFeed(ATOM, "https://deno.com/feed");
    expect(e).toMatchObject({ externalId: "urn:1", canonicalUrl: "https://deno.com/blog/v3", publishedAt: "2026-10-01T00:00:00.000Z" });
  });

  it("rejects non-feed documents", () => {
    expect(() => parseFeed("<html><body>hi</body></html>", "https://x.dev")).toThrow(/pas un flux/);
  });

  it("is deterministic (same input → same ids and hashes)", () => {
    expect(parseFeed(RSS, "https://nextjs.org/feed.xml")).toEqual(parseFeed(RSS, "https://nextjs.org/feed.xml"));
  });
});

describe("normalization", () => {
  it("canonicalizes URLs for dedup", () => {
    expect(canonicalUrl("http://WWW.Example.com/a/?utm_medium=x&b=2&a=1#top")).toBe("https://example.com/a?a=1&b=2");
    expect(canonicalUrl("javascript:alert(1)")).toBeNull();
  });
  it("bounds excerpts", () => {
    expect(toExcerpt("word ".repeat(500))!.length).toBeLessThanOrEqual(600);
  });
  it("classifies content kinds", () => {
    expect(classifyKind("Security advisory: CVE-2026-1234 in foo", null)).toBe("security");
    expect(classifyKind("Deprecating the legacy API", null)).toBe("breaking");
    expect(classifyKind("How we scaled Postgres", null)).toBe("experience");
    expect(classifyKind("Leave a comment", null)).toBe("news");
  });
});

describe("GitHub", () => {
  it("validates owner/repo input", () => {
    expect(parseGithubRepo("vercel/next.js")).toBe("vercel/next.js");
    expect(parseGithubRepo("https://github.com/Vercel/Next.js.git")).toBe("vercel/next.js");
    for (const bad of ["vercel", "../etc/passwd", "a/b/c", "vercel/..", "https://evil.com/a/b", "a b/c"]) expect(parseGithubRepo(bad)).toBeNull();
  });

  it("distinguishes stable releases from prereleases and drops drafts", () => {
    const base = { id: 1, html_url: "https://github.com/a/b/releases/tag/v1.0.0", tag_name: "v1.0.0", name: null, body: "## Fixes", draft: false, prerelease: false, published_at: "2026-10-01T00:00:00Z" };
    expect(normalizeRelease("a/b", base)).toMatchObject({ isPrerelease: false, kind: "release", releaseTag: "v1.0.0", externalId: "gh-release:1" });
    expect(normalizeRelease("a/b", { ...base, tag_name: "v2.0.0-canary.3" })?.isPrerelease).toBe(true);
    expect(normalizeRelease("a/b", { ...base, prerelease: true })?.isPrerelease).toBe(true);
    expect(normalizeRelease("a/b", { ...base, draft: true })).toBeNull();
  });

  it("uses conditional requests and the fixed API host", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return new Response(null, { status: 304 });
    }) as unknown as typeof fetch;
    const res = await fetchReleases("vercel/next.js", { etag: 'W/"abc"' }, fake);
    expect(res.status).toBe("not_modified");
    expect(calls[0].url).toBe("https://api.github.com/repos/vercel/next.js/releases?per_page=30");
    expect(calls[0].headers["If-None-Match"]).toBe('W/"abc"');
  });
});

describe("fetchText", () => {
  it("refuses oversized responses", async () => {
    const big = (async () => new Response("x".repeat(MAX_RESPONSE_BYTES + 10))) as unknown as typeof fetch;
    await expect(fetchText("https://x.dev/feed", { fetchImpl: big })).rejects.toThrow(/volumineuse/);
  });
  it("retries transient errors a bounded number of times", async () => {
    let n = 0;
    const flaky = (async () => (++n < 3 ? new Response("", { status: 503 }) : new Response("ok"))) as unknown as typeof fetch;
    const res = await fetchText("https://x.dev/feed", { fetchImpl: flaky });
    expect(res.status === "ok" && res.body).toBe("ok");
    expect(n).toBe(3);
  });
  it("does not retry rate limits", async () => {
    let n = 0;
    const limited = (async () => (n++, new Response("", { status: 429, headers: { "retry-after": "60" } }))) as unknown as typeof fetch;
    await expect(fetchText("https://x.dev/feed", { fetchImpl: limited })).rejects.toMatchObject({ retryAfterSeconds: 60 });
    expect(n).toBe(1);
  });
});

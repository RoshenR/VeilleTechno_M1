import { beforeEach, describe, expect, it } from "vitest";
import { shouldSendAlert } from "./ops";
import { fetchAdvisories, fetchReleases, githubBlockedUntil, resetGithubClient } from "./sources/github";
import { classifyDenied, FetchError } from "./sources/http";
import { checkUrl, isBlockedAddress } from "./sources/safe-fetch";

const json = (body: unknown, headers: Record<string, string> = {}, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("GitHub error classification", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");
  it("primary quota: waits until x-ratelimit-reset", () => {
    const e = classifyDenied(403, new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(now / 1000 + 1800) }), "", now);
    expect(e).toMatchObject({ kind: "quota", retryAfterSeconds: 1800 });
  });
  it("secondary limit: honours Retry-After, else at least one minute", () => {
    expect(classifyDenied(403, new Headers({ "retry-after": "120" }), "", now)).toMatchObject({ kind: "secondary_quota", retryAfterSeconds: 120 });
    expect(classifyDenied(403, new Headers(), "You have exceeded a secondary rate limit", now)).toMatchObject({ kind: "secondary_quota", retryAfterSeconds: 60 });
  });
  it("distinguishes expired token and missing permission", () => {
    expect(classifyDenied(401, new Headers(), "", now).kind).toBe("auth");
    expect(classifyDenied(403, new Headers({ "x-ratelimit-remaining": "4999" }), "Resource not accessible", now).kind).toBe("permission");
  });
});

describe("GitHub client", () => {
  beforeEach(() => resetGithubClient());

  it("stops calling once the quota is known to be exhausted (persistable next attempt)", async () => {
    let calls = 0;
    const limited = (async () => (calls++, json({ message: "API rate limit exceeded" }, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 600) }, 403))) as unknown as typeof fetch;
    await expect(fetchReleases("a/b", {}, limited)).rejects.toMatchObject({ kind: "quota" });
    expect(githubBlockedUntil()).toBeGreaterThan(Date.now() + 500_000);
    await expect(fetchReleases("c/d", {}, limited)).rejects.toBeInstanceOf(FetchError);
    expect(calls).toBe(1);
  });

  it("paginates advisories with the Link cursor, asks for withdrawn ones, sends names only", async () => {
    const urls: string[] = [];
    const advisory = (id: string, withdrawn: string | null = null) => ({
      ghsa_id: id,
      cve_id: null,
      summary: "s",
      severity: "high",
      html_url: `https://github.com/advisories/${id}`,
      published_at: null,
      updated_at: "2026-10-01T00:00:00Z",
      withdrawn_at: withdrawn,
      vulnerabilities: [{ package: { ecosystem: "npm", name: "lodash" }, vulnerable_version_range: "< 1.0.0", first_patched_version: "1.0.0" }],
    });
    const fake = (async (url: string) => {
      urls.push(url);
      const u = new URL(url);
      if (u.searchParams.get("is_withdrawn")) return json([advisory("GHSA-w", "2026-10-02T00:00:00Z")]);
      if (u.searchParams.get("after")) return json([advisory("GHSA-2")]);
      return json([advisory("GHSA-1")], { link: '<https://api.github.com/advisories?after=abc&ecosystem=npm>; rel="next"' });
    }) as unknown as typeof fetch;
    const res = await fetchAdvisories(["lodash", "react"], { fetchImpl: fake });
    expect(res.advisories.map((a) => a.ghsaId).sort()).toEqual(["GHSA-1", "GHSA-2", "GHSA-w"]);
    expect(res.advisories.find((a) => a.ghsaId === "GHSA-w")?.withdrawnAt).toBeTruthy();
    expect(urls[0]).toContain("affects=lodash%2Creact");
    expect(urls.join(" ")).not.toMatch(/@\d/); // no versions sent
    expect(res.unchecked).toEqual([]);
  });

  it("reports packages left unchecked when the quota runs out (analysis marked incomplete)", async () => {
    const fake = (async () => json({}, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60) }, 429)) as unknown as typeof fetch;
    const res = await fetchAdvisories(["a", "b"], { fetchImpl: fake });
    expect(res.unchecked).toEqual(["a", "b"]);
    expect(res.error?.kind).toBe("quota");
  });
});

describe("SSRF guard for proposed sources", () => {
  it("blocks internal, local and metadata destinations", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) expect(isBlockedAddress(ip), ip).toBe(true);
    expect(isBlockedAddress("93.184.216.34")).toBe(false);
    expect(isBlockedAddress("2606:4700::1111")).toBe(false);
  });
  it("only allows https on 443 without credentials or internal names", () => {
    expect(checkUrl("http://example.com/feed")).toMatch(/https/);
    expect(checkUrl("https://user:pw@example.com/feed")).toMatch(/identifiants/);
    expect(checkUrl("https://example.com:8443/feed")).toMatch(/443/);
    expect(checkUrl("https://localhost/feed")).toMatch(/interne/);
    expect(checkUrl("https://169.254.169.254/latest")).toMatch(/interne|réservée/);
    expect(checkUrl("file:///etc/passwd")).toMatch(/https/);
    expect(checkUrl("https://blog.example.fr/feed.xml")).toBeNull();
  });
});

describe("operations alerts", () => {
  it("are not repeated within the cooldown", () => {
    const now = Date.parse("2026-10-29T12:00:00Z");
    expect(shouldSendAlert(null, now)).toBe(true);
    expect(shouldSendAlert("2026-10-29T06:00:00Z", now)).toBe(false);
    expect(shouldSendAlert("2026-10-28T23:00:00Z", now)).toBe(true);
  });
});

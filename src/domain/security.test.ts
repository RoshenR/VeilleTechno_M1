import { describe, expect, it } from "vitest";
import { evaluate, evaluateInventory, toSemverRange } from "./advisory-match";
import { applyExclusions, classifySpec, diffInventories, ImportError, parseDependencyFile, transmittable } from "./dependencies";
import type { Advisory } from "./sources/github";

const lock = (packages: Record<string, unknown>, v = 3) => JSON.stringify({ name: "app", lockfileVersion: v, packages });

describe("dependency import", () => {
  it("distinguishes declared range, exact version and local / git / alias / workspace specs", () => {
    expect(classifySpec("^2.3.0")).toMatchObject({ resolution: "range", version: null });
    expect(classifySpec("2.3.0")).toMatchObject({ resolution: "exact", version: "2.3.0" });
    expect(classifySpec("=v1.0.0-beta.2")).toMatchObject({ resolution: "exact", version: "1.0.0-beta.2" });
    expect(classifySpec("file:../lib").resolution).toBe("local");
    expect(classifySpec("workspace:*").resolution).toBe("workspace");
    expect(classifySpec("npm:other@^1").resolution).toBe("alias");
    expect(classifySpec("latest").resolution).toBe("tag");
    expect(classifySpec("github:owner/repo#main").resolution).toBe("git");
  });

  it("never keeps credentials or query strings from URL specs", () => {
    const s = classifySpec("git+https://user:s3cret@gitlab.example.com/team/lib.git#abc");
    expect(s.declared).toBe("git gitlab.example.com/team/lib");
    expect(classifySpec("https://token@registry.example.com/pkg.tgz?sig=xyz").declared).toBe("url registry.example.com/pkg.tgz");
  });

  it("parses package.json with dev/prod context and no guessed versions", () => {
    const inv = parseDependencyFile(JSON.stringify({ name: "a", scripts: { postinstall: "rm -rf /" }, dependencies: { react: "^19.0.0", zod: "4.1.0" }, devDependencies: { vitest: "~3.2.0" } }));
    expect(inv.origin).toBe("package.json");
    expect(inv.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "react", resolution: "range", version: null, scope: "prod", isDirect: true }),
        expect.objectContaining({ name: "zod", resolution: "exact", version: "4.1.0" }),
        expect.objectContaining({ name: "vitest", scope: "dev" }),
      ]),
    );
    expect(JSON.stringify(inv)).not.toContain("postinstall");
  });

  it("parses lockfile v2/v3: resolved versions, transitive deps, several versions of a package", () => {
    const inv = parseDependencyFile(
      lock({
        "": { name: "app", dependencies: { lodash: "^4.17.0", debug: "^4" }, devDependencies: { typescript: "^5" } },
        "node_modules/lodash": { version: "4.17.20", resolved: "https://registry.npmjs.org/lodash/-/lodash-4.17.20.tgz", integrity: "sha512-x" },
        "node_modules/debug": { version: "4.3.4" },
        "node_modules/ms": { version: "2.1.2" },
        "node_modules/debug/node_modules/ms": { version: "2.0.0" },
        "node_modules/typescript": { version: "5.6.2", dev: true },
        "node_modules/my-alias": { name: "real-pkg", version: "1.0.0" },
        "packages/ui": { name: "@app/ui", version: "0.0.0" },
        "node_modules/@app/ui": { resolved: "packages/ui", link: true },
      }),
    );
    const ms = inv.entries.filter((e) => e.name === "ms");
    expect(ms.map((e) => e.version).sort()).toEqual(["2.0.0", "2.1.2"]);
    expect(ms.every((e) => !e.isDirect)).toBe(true);
    expect(inv.entries.find((e) => e.name === "lodash")).toMatchObject({ resolution: "resolved", version: "4.17.20", isDirect: true, declared: "^4.17.0" });
    expect(inv.entries.find((e) => e.name === "typescript")?.scope).toBe("dev");
    expect(inv.entries.find((e) => e.name === "real-pkg")?.resolution).toBe("alias");
    expect(inv.entries.filter((e) => e.name === "@app/ui").every((e) => e.resolution === "workspace")).toBe(true);
    expect(JSON.stringify(inv)).not.toMatch(/registry\.npmjs\.org|sha512/);
  });

  it("rejects unsupported files with a clear message", () => {
    expect(() => parseDependencyFile(lock({}, 1))).toThrow(ImportError);
    expect(() => parseDependencyFile(JSON.stringify({ lockfileVersion: 1, dependencies: { a: { version: "1.0.0" } } }))).toThrow(/v1/);
    expect(() => parseDependencyFile("lodash@^4:\n  version 4.17.21")).toThrow(/JSON valide/);
    expect(() => parseDependencyFile(JSON.stringify({ hello: "world" }))).toThrow(/Format non reconnu/);
  });

  it("excludes private packages from what is transmitted", () => {
    const inv = parseDependencyFile(JSON.stringify({ dependencies: { "@acme/core": "1.0.0", "internal-tool": "1.0.0", react: "19.0.0", local: "file:../x" } }));
    const entries = applyExclusions(inv.entries, ["@acme/*", "internal-tool"]);
    expect(entries.filter(transmittable).map((e) => e.name)).toEqual(["react"]);
  });

  it("previews changes between two inventories", () => {
    const d = diffInventories(
      [
        { name: "a", version: "1.0.0", declared: null },
        { name: "b", version: "1.0.0", declared: null },
      ],
      [
        { name: "a", version: "1.1.0", declared: null },
        { name: "c", version: "1.0.0", declared: null },
      ],
    );
    expect(d.changed).toEqual(["a"]);
    expect(d.removed).toEqual(["a@1.0.0", "b@1.0.0"]);
  });
});

const adv = (o: Partial<Advisory> = {}): Advisory => ({
  ghsaId: "GHSA-test-0000-0000",
  cveId: null,
  summary: "Prototype pollution",
  severity: "high",
  htmlUrl: "https://github.com/advisories/GHSA-test-0000-0000",
  publishedAt: null,
  updatedAt: "2026-10-01T00:00:00Z",
  withdrawnAt: null,
  vulnerabilities: [
    { package: "lodash", range: ">= 4.0.0, < 4.17.21", patched: "4.17.21" },
    { package: "lodash", range: "< 3.10.2", patched: "3.10.2" },
  ],
  ...o,
});
const entry = (version: string | null, declared: string | null = null, resolution: "resolved" | "range" | "exact" | "git" = version ? "resolved" : "range") => ({ name: "lodash", version, declared, resolution });

describe("advisory comparison (deterministic semver)", () => {
  it("converts GitHub ranges", () => {
    expect(toSemverRange(">= 4.0.0, < 4.17.21")).toBe(">=4.0.0 <4.17.21");
    expect(toSemverRange("= 1.2.3")).toBe("=1.2.3");
    expect(toSemverRange("garbage range")).toBeNull();
  });

  it("flags an imported version inside the affected range, with the patch of its own branch", () => {
    const f = evaluate(entry("4.17.20"), adv());
    expect(f.status).toBe("affected");
    expect(f.matchedRange).toBe(">= 4.0.0, < 4.17.21");
    expect(f.patched.find((p) => p.applies)).toMatchObject({ patched: "4.17.21", sameMajor: true });
    expect(evaluate(entry("3.10.1"), adv()).patched.find((p) => p.applies)?.patched).toBe("3.10.2");
  });

  it("reports versions outside the range as not affected by this advisory", () => {
    expect(evaluate(entry("4.17.21"), adv()).status).toBe("not_affected");
    expect(evaluate(entry("3.10.2"), adv()).status).toBe("not_affected");
  });

  it("compares prereleases conservatively", () => {
    const a = adv({ vulnerabilities: [{ package: "lodash", range: "< 5.0.0", patched: "5.0.0" }] });
    expect(evaluate(entry("5.0.0-beta.1"), a).status).toBe("affected");
    expect(evaluate(entry("5.0.0"), a).status).toBe("not_affected");
  });

  it("never guesses: declared range overlapping the affected range → version unknown", () => {
    expect(evaluate(entry(null, "^4.17.0"), adv()).status).toBe("unknown_version");
    expect(evaluate(entry(null, "^4.17.21"), adv()).status).toBe("not_affected"); // every allowed version is patched
    expect(evaluate(entry(null, "git x", "git"), adv()).status).toBe("unknown_version");
  });

  it("handles withdrawn and unparseable advisories", () => {
    expect(evaluate(entry("4.17.20"), adv({ withdrawnAt: "2026-10-20T00:00:00Z" })).status).toBe("withdrawn");
    expect(evaluate(entry("4.17.20"), adv({ vulnerabilities: [{ package: "lodash", range: "?? weird", patched: null }] })).status).toBe("incomplete");
  });

  it("evaluates every version of a package and skips excluded entries", () => {
    const res = evaluateInventory(
      [
        { ...entry("4.17.20"), excluded: false },
        { ...entry("4.17.21"), excluded: false },
        { ...entry("4.17.0"), excluded: true },
      ],
      [adv()],
    );
    expect(res.map((r) => r.finding.status)).toEqual(["affected", "not_affected"]);
  });
});

import { lookup } from "node:dns";
import { request } from "node:https";
import { isIP } from "node:net";
import { FetchError } from "./http";

// SSRF-safe GET for user-proposed URLs (OWASP SSRF prevention):
// https only on port 443, no credentials in the URL, every resolved address checked at connect time
// (the check runs inside the socket's DNS lookup, so DNS rebinding between check and use is not possible),
// redirects followed manually and re-validated, bounded time, size and redirect count.

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

/** Private, loopback, link-local (incl. cloud metadata 169.254.169.254), CGNAT, multicast, reserved, ULA… */
export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && [0, 2].includes(Number(ip.split(".")[2]))))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && Number(ip.split(".")[2]) === 100))) ||
      (a === 203 && b === 0 && Number(ip.split(".")[2]) === 113)
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x) || x.startsWith("64:ff9b:") || x.startsWith("2001:db8");
  }
  return true;
}

/** Static checks on a URL before any network access. Returns an error message or null. */
export function checkUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "URL invalide.";
  }
  if (u.protocol !== "https:") return "Seules les URL https sont acceptées.";
  if (u.username || u.password) return "Les identifiants dans l’URL sont refusés.";
  if (u.port && u.port !== "443") return "Seul le port 443 est accepté.";
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isBlockedAddress(host)) return "Adresse interne ou réservée refusée.";
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/i.test(host) || !host.includes(".")) return "Nom d’hôte interne refusé.";
  return null;
}

const guardedLookup: typeof lookup = ((hostname: string, options: object, cb: (err: Error | null, address: string | object[], family?: number) => void) => {
  lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, "");
    const list = addresses as { address: string; family: number }[];
    const bad = list.find((a) => isBlockedAddress(a.address));
    if (!list.length || bad) return cb(new FetchError("Destination interne refusée", false, undefined, "invalid"), "");
    if ((options as { all?: boolean }).all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}) as typeof lookup;

function getOnce(url: URL): Promise<{ status: number; location?: string; body: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { method: "GET", lookup: guardedLookup, timeout: TIMEOUT_MS, headers: { "User-Agent": "StackSignal/0.2 validation de flux", Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8" } },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location, body: "", contentType: "" });
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            req.destroy(new FetchError("Réponse trop volumineuse", false, undefined, "too_large"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString("utf8"), contentType: String(res.headers["content-type"] ?? "") }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new FetchError("Délai dépassé", false, undefined, "network")));
    req.on("error", reject);
    req.end();
  });
}

export async function safeFetchText(raw: string): Promise<{ finalUrl: string; body: string; contentType: string; redirects: number }> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const problem = checkUrl(current);
    if (problem) throw new FetchError(problem, false, undefined, "invalid");
    const res = await getOnce(new URL(current));
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new FetchError("Redirection sans destination", false, undefined, "invalid");
      current = new URL(res.location, current).toString();
      continue;
    }
    if (res.status !== 200) throw new FetchError(`HTTP ${res.status}`, false, undefined, res.status === 404 ? "not_found" : "invalid");
    return { finalUrl: current, body: res.body, contentType: res.contentType, redirects: hop };
  }
  throw new FetchError(`Trop de redirections (max ${MAX_REDIRECTS})`, false, undefined, "invalid");
}

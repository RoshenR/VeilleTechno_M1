export const MAX_RESPONSE_BYTES = 3_000_000;
const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const USER_AGENT = "StackSignal/0.2 (+https://github.com/RoshenR/VeilleTechno_M1) veille technologique";

/** Why a request failed — stored on the source (`last_error_kind`) and used to pick the retry delay. */
export type ErrorKind = "quota" | "secondary_quota" | "auth" | "permission" | "not_found" | "network" | "server" | "invalid" | "too_large";

export class FetchError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterSeconds?: number,
    readonly kind: ErrorKind = "network",
  ) {
    super(message);
  }
}

export type Conditional = { etag?: string | null; lastModified?: string | null };
export type FetchResult =
  | { status: "not_modified"; headers: Headers }
  | { status: "ok"; body: string; etag: string | null; lastModified: string | null; headers: Headers };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Classify 401/403/429 the way GitHub documents it (and generic hosts behave):
 * primary quota = remaining 0 → wait until `x-ratelimit-reset`; secondary = retry-after / message → wait it (≥ 60 s);
 * other 403 = missing permission; 401 = invalid or expired credentials.
 */
export function classifyDenied(status: number, headers: Headers, body: string, now = Date.now()): FetchError {
  if (status === 401) return new FetchError("Authentification refusée (HTTP 401) : jeton invalide ou expiré", false, 6 * 3600, "auth");
  const remaining = headers.get("x-ratelimit-remaining");
  const reset = Number(headers.get("x-ratelimit-reset") ?? "");
  const retryAfter = Number(headers.get("retry-after") ?? "");
  if (remaining === "0") {
    const wait = Number.isFinite(reset) && reset > 0 ? Math.max(60, Math.ceil(reset - now / 1000)) : Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 3600;
    return new FetchError(`Quota d’API épuisé (HTTP ${status}), reprise après la réinitialisation`, false, wait, "quota");
  }
  if (status === 429 || (Number.isFinite(retryAfter) && retryAfter > 0) || /secondary rate limit/i.test(body))
    return new FetchError(`Limite de débit secondaire atteinte (HTTP ${status})`, false, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60, "secondary_quota");
  return new FetchError(`Accès refusé (HTTP ${status}) : permission manquante`, false, undefined, "permission");
}

/**
 * GET with timeout, bounded size, conditional headers and limited retries (network errors, 5xx).
 * Rate limits are never retried here: the caller persists the next attempt.
 * `allowedHost` pins the final host so redirects can't send us elsewhere.
 */
export async function fetchText(
  url: string,
  opts: Conditional & { headers?: Record<string, string>; allowedHost?: string; fetchImpl?: typeof fetch } = {},
): Promise<FetchResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  let lastError: FetchError | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await doFetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          ...(opts.etag ? { "If-None-Match": opts.etag } : {}),
          ...(opts.lastModified ? { "If-Modified-Since": opts.lastModified } : {}),
          ...opts.headers,
        },
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (opts.allowedHost && res.url && new URL(res.url).hostname !== opts.allowedHost)
        throw new FetchError(`Redirection refusée vers ${new URL(res.url).hostname}`, false, undefined, "invalid");
      if (res.status === 304) return { status: "not_modified", headers: res.headers };
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        const body = await readBounded(res, 20_000).catch(() => "");
        throw classifyDenied(res.status, res.headers, body);
      }
      if (res.status === 404) throw new FetchError("Introuvable (HTTP 404)", false, undefined, "not_found");
      if (res.status >= 500) throw new FetchError(`Erreur serveur (HTTP ${res.status})`, true, undefined, "server");
      if (!res.ok) throw new FetchError(`HTTP ${res.status}`, false, undefined, "invalid");
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > MAX_RESPONSE_BYTES) throw new FetchError(`Réponse trop volumineuse (${declared} octets)`, false, undefined, "too_large");
      const body = await readBounded(res);
      return { status: "ok", body, etag: res.headers.get("etag"), lastModified: res.headers.get("last-modified"), headers: res.headers };
    } catch (e) {
      lastError =
        e instanceof FetchError
          ? e
          : new FetchError(e instanceof Error && e.name === "TimeoutError" ? "Délai dépassé" : `Erreur réseau : ${(e as Error).message}`, true);
      if (!lastError.retryable || attempt === MAX_ATTEMPTS) break;
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw lastError!;
}

export async function readBounded(res: Response, max = MAX_RESPONSE_BYTES): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new FetchError(`Réponse trop volumineuse (> ${max} octets)`, false, undefined, "too_large");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

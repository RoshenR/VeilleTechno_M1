export const MAX_RESPONSE_BYTES = 3_000_000;
const TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const USER_AGENT = "StackSignal/0.1 (+https://github.com/) veille technologique";

export class FetchError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export type Conditional = { etag?: string | null; lastModified?: string | null };
export type FetchResult =
  | { status: "not_modified" }
  | { status: "ok"; body: string; etag: string | null; lastModified: string | null; headers: Headers };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET with timeout, bounded size, conditional headers and limited retries (network errors, 5xx, 429).
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
        throw new FetchError(`Redirection refusée vers ${new URL(res.url).hostname}`, false);
      if (res.status === 304) return { status: "not_modified" };
      if (res.status === 429 || res.status === 403) {
        const reset = Number(res.headers.get("retry-after") ?? res.headers.get("x-ratelimit-reset-after") ?? "");
        const remaining = res.headers.get("x-ratelimit-remaining");
        if (res.status === 429 || remaining === "0")
          throw new FetchError(`Limite de débit atteinte (HTTP ${res.status})`, false, Number.isFinite(reset) && reset > 0 ? reset : 3600);
        throw new FetchError(`Accès refusé (HTTP ${res.status})`, false);
      }
      if (res.status >= 500) throw new FetchError(`Erreur serveur (HTTP ${res.status})`, true);
      if (!res.ok) throw new FetchError(`HTTP ${res.status}`, false);
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > MAX_RESPONSE_BYTES) throw new FetchError(`Réponse trop volumineuse (${declared} octets)`, false);
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

async function readBounded(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new FetchError(`Réponse trop volumineuse (> ${MAX_RESPONSE_BYTES} octets)`, false);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

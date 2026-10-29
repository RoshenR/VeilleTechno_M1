import { XMLParser } from "fast-xml-parser";
import { canonicalUrl, classifyKind, hashContent, parseDate, toExcerpt, type NormalizedItem } from "./normalize";

export const MAX_ITEMS_PER_FEED = 50;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  processEntities: true,
  htmlEntities: true,
});

type Node = Record<string, unknown> | string | undefined;
const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const text = (v: Node): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v);
  const t = (v as Record<string, unknown>)["#text"];
  return t === undefined ? null : String(t);
};

/** Parse RSS 2.0, RSS 1.0 (RDF) or Atom into normalized items. Throws on non-feed documents. */
export function parseFeed(xml: string, baseUrl: string): NormalizedItem[] {
  const doc = parser.parse(xml) as Record<string, Record<string, unknown>>;
  let raw: { id: string | null; link: string | null; title: string | null; date: string | null; body: string | null }[];

  if (doc.rss || doc["rdf:RDF"]) {
    const channel = (doc.rss?.channel ?? doc["rdf:RDF"]) as Record<string, unknown>;
    const items = arr((channel?.item ?? doc["rdf:RDF"]?.item) as Record<string, Node>[]);
    raw = items.map((it) => ({
      id: text(it.guid) ?? text(it.link),
      link: text(it.link) ?? (typeof it.guid === "object" && (it.guid as Record<string, string>)["@_isPermaLink"] !== "false" ? text(it.guid) : null),
      title: text(it.title),
      date: text(it.pubDate) ?? text(it["dc:date"]),
      body: text(it.description) ?? text(it["content:encoded"]),
    }));
  } else if (doc.feed) {
    raw = arr(doc.feed.entry as Record<string, Node>[]).map((e) => {
      const links = arr(e.link as unknown as Record<string, string>[]);
      const alt = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
      return {
        id: text(e.id),
        link: alt?.["@_href"] ?? null,
        title: text(e.title),
        date: text(e.published) ?? text(e.updated),
        body: text(e.summary) ?? text(e.content),
      };
    });
  } else {
    throw new Error("Le document reçu n’est pas un flux RSS ou Atom.");
  }

  const out: NormalizedItem[] = [];
  for (const r of raw.slice(0, MAX_ITEMS_PER_FEED)) {
    if (!r.link || !r.title) continue;
    let absolute: string;
    try {
      absolute = new URL(r.link, baseUrl).toString();
    } catch {
      continue;
    }
    const url = canonicalUrl(absolute);
    if (!url) continue;
    const title = toExcerpt(r.title, 300)!;
    const excerpt = toExcerpt(r.body);
    out.push({
      externalId: (r.id ?? url).slice(0, 500),
      canonicalUrl: url,
      title,
      excerpt,
      kind: classifyKind(title, excerpt),
      isPrerelease: false,
      releaseTag: null,
      publishedAt: parseDate(r.date),
      contentHash: hashContent(title, excerpt),
    });
  }
  return out;
}

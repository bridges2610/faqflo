/**
 * Pulling facts out of HTML.
 *
 * Regex, not a DOM parser, and deliberately so: this project carries no runtime
 * dependency beyond the Anthropic SDK, and everything here feeds heuristics
 * rather than rendering. Nothing extracted is ever written back into a page.
 *
 * The limit that comes with that choice: malformed or exotic markup will be
 * read approximately. Every consumer treats a miss as "couldn't tell", never as
 * a failure — a check that can't measure something returns `na` rather than
 * blaming the site for our parser. If checks ever need real accuracy, swapping
 * in a parser is the upgrade path.
 */

export type Heading = { level: number; text: string };

export type PageFacts = {
  title: string | null;
  metaDescription: string | null;
  metaRobots: string | null;
  canonical: string | null;
  lang: string | null;
  hasViewport: boolean;
  openGraph: { title: boolean; description: boolean; image: boolean };
  headings: Heading[];
  /** Visible text with script/style stripped — what a crawler reads. */
  text: string;
  wordCount: number;
  scriptCount: number;
  /** True when the markup looks like a shell waiting for JavaScript. */
  looksLikeJsShell: boolean;
  images: { total: number; withAlt: number };
  links: { internal: string[]; external: string[] };
  /** Every @type named in the page's JSON-LD, plus whether it all parsed. */
  schemaTypes: string[];
  schemaBlocks: number;
  schemaParsed: boolean;
  schemaRaw: unknown[];
  paragraphs: string[];
  listCount: number;
  tableCount: number;
};

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Text a crawler would see with no JavaScript run. */
export function visibleText(html: string): string {
  return stripTags(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' '),
  );
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag);
  return match ? decodeEntities(match[1].trim()) : null;
}

function metaContent(html: string, selector: RegExp): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (selector.test(tag)) {
      const content = attr(tag, 'content');
      if (content) return content;
    }
  }
  return null;
}

export function parsePage(html: string, pageUrl: string): PageFacts {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? stripTags(titleMatch[1]) || null : null;

  const headings: Heading[] = [];
  for (const m of html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = stripTags(m[2]);
    if (text) headings.push({ level: Number(m[1]), text });
  }

  const paragraphs: string[] = [];
  for (const m of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = stripTags(m[1]);
    if (text) paragraphs.push(text);
  }

  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  // An empty alt is a valid, deliberate choice for decorative images, so it
  // counts as present — the check is "was alt considered", not "is alt filled".
  const withAlt = imgTags.filter((t) => /\balt\s*=/i.test(t)).length;

  const internal: string[] = [];
  const external: string[] = [];
  let origin = '';
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    origin = '';
  }

  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const href = m[1].trim();
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue;
    try {
      const resolved = new URL(href, pageUrl);
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
      (resolved.origin === origin ? internal : external).push(resolved.toString());
    } catch {
      // Unparseable href — nothing to learn from it.
    }
  }

  const schemaTypes = new Set<string>();
  const schemaRaw: unknown[] = [];
  let schemaBlocks = 0;
  let schemaParsed = true;

  for (const block of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    schemaBlocks += 1;
    // Parsed properly where possible, because several checks need to look
    // inside (sameAs, name, url). Blocks in the wild are frequently invalid,
    // and that invalidity is itself a finding — so the failure is recorded
    // rather than thrown, and the types are still scraped out by regex.
    try {
      schemaRaw.push(JSON.parse(block[1]));
    } catch {
      schemaParsed = false;
    }
    for (const t of block[1].matchAll(/"@type"\s*:\s*"([^"]+)"/g)) schemaTypes.add(t[1]);
  }

  const text = visibleText(html);
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const scriptCount = (html.match(/<script\b/gi) ?? []).length;

  const hasMountPoint =
    /<div[^>]+id=["'](root|app|__next|application|main-app)["']/i.test(html) ||
    /__NEXT_DATA__|window\.__NUXT__|ng-version=|data-reactroot/i.test(html);

  return {
    title,
    metaDescription: metaContent(html, /name\s*=\s*["']description["']/i),
    metaRobots: metaContent(html, /name\s*=\s*["']robots["']/i),
    canonical: (() => {
      for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
        if (/rel\s*=\s*["']canonical["']/i.test(tag)) return attr(tag, 'href');
      }
      return null;
    })(),
    lang: (() => {
      const htmlTag = /<html\b[^>]*>/i.exec(html);
      return htmlTag ? attr(htmlTag[0], 'lang') : null;
    })(),
    hasViewport: Boolean(metaContent(html, /name\s*=\s*["']viewport["']/i)),
    openGraph: {
      title: Boolean(metaContent(html, /property\s*=\s*["']og:title["']/i)),
      description: Boolean(metaContent(html, /property\s*=\s*["']og:description["']/i)),
      image: Boolean(metaContent(html, /property\s*=\s*["']og:image["']/i)),
    },
    headings,
    text,
    wordCount,
    scriptCount,
    looksLikeJsShell: hasMountPoint || scriptCount >= 3 || (scriptCount >= 1 && wordCount < 50),
    images: { total: imgTags.length, withAlt },
    links: { internal, external },
    schemaTypes: [...schemaTypes],
    schemaBlocks,
    schemaParsed,
    schemaRaw,
    paragraphs,
    listCount: (html.match(/<(ul|ol)\b/gi) ?? []).length,
    tableCount: (html.match(/<table\b/gi) ?? []).length,
  };
}

/* ------------------------------------------------------------- helpers --- */

/** Does this heading read as a question someone would ask? */
export function isQuestion(text: string): boolean {
  const t = text.trim();
  if (t.endsWith('?')) return true;
  return /^(how|what|why|when|where|who|which|can|do|does|is|are|will|should)\b/i.test(t);
}

/** Walk the JSON-LD graph, flattening @graph and arrays into plain nodes. */
export function schemaNodes(raw: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    out.push(obj);
    if (Array.isArray(obj['@graph'])) obj['@graph'].forEach(visit);
  };

  raw.forEach(visit);
  return out;
}

/** First node whose @type matches — handles @type given as an array. */
export function findNode(
  nodes: Record<string, unknown>[],
  pattern: RegExp,
): Record<string, unknown> | null {
  for (const node of nodes) {
    const type = node['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((t) => typeof t === 'string' && pattern.test(t))) return node;
  }
  return null;
}

/** Rough sentence split, good enough to measure length. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

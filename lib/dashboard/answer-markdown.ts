/**
 * Reading the Markdown an answer engine wrote, into tokens.
 *
 * Pure and JSX-free on purpose. This is the security-relevant half of showing a
 * model's answer — it decides what becomes a link and what does not — so it
 * lives where it can be tested directly rather than through a component.
 * components/dashboard/answer-text.tsx turns these tokens into React elements
 * and does nothing else.
 *
 * ⚠️ THE INPUT IS UNTRUSTED. It is text a third-party model wrote about a
 * business we do not control. Nothing here produces HTML; it produces a tree of
 * plain objects, and the renderer emits React elements, which escape their text
 * content by construction. There is no sanitiser in this design because there
 * is nothing to sanitise.
 *
 * Only the subset these answers actually use is recognised: bold, italics and
 * inline links. Anything unrecognised — a half-written `**`, a stray bracket, a
 * table — stays as text. This is evidence, and showing it plainly beats
 * mangling it into something tidier.
 */

export type Token =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: Token[] }
  | { type: 'italic'; children: Token[] }
  | { type: 'link'; href: string; children: Token[] };

/**
 * A link we are willing to make clickable, or null.
 *
 * ⚠️ `[click me](javascript:alert(1))` is a string a model can emit, and React
 * does NOT block a javascript: href — it will happily render one. Only http and
 * https pass; everything else returns null and the caller falls back to showing
 * the raw markdown as text, so a hostile scheme becomes characters on a page
 * rather than a trap.
 *
 * `new URL` also rejects the malformed and the relative, which is right: a
 * source list on someone else's answer has no meaningful relative base.
 */
export function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const LINK = /\[([^\]]*)\]\(([^\s)]+)\)/;
const BOLD = /\*\*([^*]+)\*\*/;
/*
  Italics require a word boundary before the opening underscore.

  ⚠️ WITHOUT THAT, EVERY TRACKING PARAMETER BECOMES ITALIC. These answers are
  full of `?utm_source=openai` and `utm_campaign`, and snake_case inside a URL is
  far more common than emphasis in prose. Matching those would mangle the links
  the customer came to see. The captured leading character is not part of the
  emphasis and is put back by the caller.
*/
const ITALIC = /(?:^|[\s(])_([^_\s][^_]*)_(?=[\s.,;:!?)]|$)/;

/** Depth guard: emphasis nested past this is pathological, not prose. */
const MAX_DEPTH = 6;

/**
 * One line of Markdown, as tokens.
 *
 * Whichever marker starts earliest wins, and the text on either side is parsed
 * the same way — so a bold link (`**[name](url)**`, exactly how these answers
 * list a business) keeps both, and so does a link containing bold.
 */
export function parseInline(text: string, depth = 0): Token[] {
  if (!text) return [];
  if (depth >= MAX_DEPTH) return [{ type: 'text', text }];

  const link = LINK.exec(text);
  const bold = BOLD.exec(text);
  const italic = ITALIC.exec(text);

  const first = [link, bold, italic]
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => a.index - b.index)[0];

  if (!first) return [{ type: 'text', text }];

  const before = parseInline(text.slice(0, first.index), depth + 1);
  const after = parseInline(text.slice(first.index + first[0].length), depth + 1);

  let node: Token;

  if (first === link) {
    const href = safeHref(first[2]);
    node = href
      ? { type: 'link', href, children: parseInline(first[1] || first[2], depth + 1) }
      : // Refused: show exactly what the engine wrote, pointing nowhere.
        { type: 'text', text: first[0] };
  } else if (first === bold) {
    node = { type: 'bold', children: parseInline(first[1], depth + 1) };
  } else {
    const lead = first[0].slice(0, first[0].indexOf('_'));
    const emphasis: Token = { type: 'italic', children: parseInline(first[1], depth + 1) };
    return lead
      ? [...before, { type: 'text', text: lead }, emphasis, ...after]
      : [...before, emphasis, ...after];
  }

  return [...before, node, ...after];
}

/**
 * A whole answer: paragraphs of lines of tokens.
 *
 * Blank lines separate paragraphs; single newlines stay as line breaks, which is
 * what keeps a list of businesses reading as a list. Bullet characters are left
 * as the engine typed them rather than rebuilt into a `<ul>` — the job is to
 * show the answer, not to reformat it into something it never was.
 */
export function parseAnswer(text: string): Token[][][] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => paragraph.split('\n').map((line) => parseInline(line)));
}

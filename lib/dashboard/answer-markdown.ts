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
 * inline links. Anything unrecognised — a half-written `**`, a stray bracket —
 * stays as text. This is evidence, and showing it plainly beats mangling it
 * into something tidier.
 *
 * ⚠️ TABLES ARE THE ONE EXCEPTION, AND THIS NOTE USED TO LIST THEM AS PROOF OF
 * THE RULE. Gemini answers questions like "what does this cost" with a Markdown
 * table, and under the old reading a customer opening an answer was shown
 * `| :--- | :--- | :--- |` — a line the engine never meant as words.
 *
 * The rule survives with a sharper edge: **no word an engine wrote is ever
 * removed.** An alignment row is pure delimiter and carries no content, so it
 * goes. A body row keeps every cell; only the pipes between them are traded for
 * a separator you can read. That is the same job as turning `**Gikas Roofing**`
 * into bold text — finishing the render — rather than a reformat.
 *
 * ⚠️ AND NOT REBUILT INTO A <table>, WHICH IS THE OBVIOUS THING TO TRY.
 * MAX_EXCERPT_CHARS is 600 and the classifier cuts at a word boundary, so a
 * five-column table is usually severed mid-row. A real table would then render
 * a header with a ragged body, or a header over nothing at all. Lines degrade;
 * grids do not.
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
  return (
    text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) =>
        paragraph
          .split('\n')
          /* Alignment rows first: they carry nothing, so they never reach the
             flattener and never become an empty line to clean up after. */
          .filter((line) => !isTableRule(line))
          .map((line) => flattenTableRow(line))
          /* A row of empty cells — `| | |` — flattens to nothing. Dropped here
             rather than rendered as a blank line inside the answer. */
          .filter((line) => line.trim().length > 0)
          .map((line) => parseInline(line)),
      )
      /* A paragraph that was ONLY an alignment row is now empty. Without this it
         would render as an empty <p> and space the answer out for no reason. */
      .filter((lines) => lines.length > 0)
  );
}

/**
 * A Markdown table's alignment row — `| :--- | ---: |`.
 *
 * ⚠️ THE ONLY LINE THIS FILE DELETES, AND IT IS SAFE TO DELETE BECAUSE IT HAS NO
 * CONTENT BY DEFINITION. Pipes, dashes, colons and spaces are the whole of its
 * grammar; there is no arrangement of them that is something an engine said.
 *
 * Conservative on both sides. It must start with a pipe, so a horizontal rule
 * (`---`) — which is content people do write — is untouched. And it needs a run
 * of at least two dashes, so a one-cell row holding a literal "-" survives.
 */
export function isTableRule(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return false;
  return /^[|\s:-]+$/.test(trimmed) && /-{2,}/.test(trimmed);
}

/**
 * `| Tier | Typical Cost |` → `Tier · Typical Cost`.
 *
 * ⚠️ EVERY CELL SURVIVES. Only the delimiters change, which is what keeps this
 * on the right side of the rule in this file's header: the pipes are syntax, the
 * cells are what the engine wrote.
 *
 * ⚠️ IT MUST START WITH A PIPE. Prose contains the occasional pipe and a line
 * split on one would lose its shape for no reason; a leading pipe is the
 * unambiguous signal, and it is what the engines actually emit. A table written
 * without outer pipes therefore stays as text — the conservative failure, and
 * the same one the header's "anything unrecognised stays as text" describes.
 *
 * ` · ` rather than a comma or a tab: it is the separator this dashboard already
 * uses between facts on one line, and unlike a comma it cannot be confused with
 * punctuation inside a cell.
 *
 * The result goes back through parseInline, so `**bold**` inside a cell still
 * renders as bold.
 */
export function flattenTableRow(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return line;

  const cells = trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
    .filter(Boolean);

  return cells.join(' · ');
}

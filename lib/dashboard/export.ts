/**
 * The deliverable: HTML the customer pastes onto their own site.
 *
 * Three hard rules, all of them from how AI crawlers actually behave:
 *
 * 1. NO JAVASCRIPT. Not a script tag, not a data attribute waiting for one, not
 *    a <details> element that needs a click. Crawlers don't run scripts and
 *    don't click, so anything that appears only after either one is invisible
 *    to the entire audience this exists for.
 * 2. The answer text sits in the HTML next to its question, in that order,
 *    inside real heading and paragraph elements. Structure is the point.
 * 3. It goes on the CUSTOMER'S domain. Nothing here references faqflo.com, so
 *    the citation and the click land on them.
 *
 * Everything is built per GROUP, because a group is one page: the service page
 * gets its own block, pricing gets its own, and each is pasted where it
 * belongs. The single exception is llms.txt, which is site-wide — see below.
 */

import type { Article, FaqEntry, FaqGroup, Site } from './types';

/** Escape for HTML text content and attribute values. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function publishable(faqs: FaqEntry[]): FaqEntry[] {
  return faqs
    .filter((f) => f.status === 'published' && f.question.trim() && f.answer.trim())
    .sort((a, b) => a.position - b.position);
}

/**
 * Absolute URL of the page a group is pasted on, or null when it has none yet.
 *
 * ⚠️ NULL IS A REAL ANSWER, NOT A MISSING ONE. A set exists from the moment its
 * answers are written; where it goes is decided later. Every caller has to
 * handle that rather than interpolating `null` into a URL string.
 */
export function groupUrl(site: Site, group: FaqGroup): string | null {
  return group.path ? `https://${site.domain}${group.path}` : null;
}

/**
 * The Q&A block for one group.
 *
 * <section> with headings and paragraphs rather than <details>/<summary>: a
 * crawler reads both either way, but a <details> block is collapsed for humans
 * by default, and a visitor who can't see the answer is a visitor who leaves.
 *
 * The heading id is namespaced with the group id so two blocks can sit on one
 * page without colliding — rare, but duplicate ids are invalid HTML and break
 * the aria-labelledby that makes the section announce itself.
 */
export function buildFaqHtml(group: FaqGroup, faqs: FaqEntry[]): string {
  const entries = publishable(faqs);
  if (entries.length === 0) return '';

  const headingId = `faqflo-heading-${group.id}`;

  /*
    A blank line between items, and after the heading.

    Purely for the human reading it. This is code somebody pastes into their
    own page and will later have to find again to replace, so the question
    boundaries should be obvious at a glance rather than one undifferentiated
    wall. HTML collapses whitespace between elements, so it changes nothing
    about how the page renders or what a crawler extracts.
  */
  const items = entries
    .map(
      (f) => `  <div class="faqflo-item">
    <h3 class="faqflo-question">${escapeHtml(f.question)}</h3>
    <p class="faqflo-answer">${escapeHtml(f.answer)}</p>
  </div>`,
    )
    .join('\n\n');

  return `<section class="faqflo-faqs" aria-labelledby="${headingId}">
  <h2 id="${headingId}">Frequently asked questions</h2>

${items}
</section>`;
}

/**
 * JSON-LD for machine clarity.
 *
 * QAPage plus the business entity. Worth being blunt in the code as well as the
 * UI: this does NOT produce FAQ rich results. Google retired those. It's here
 * so an assistant can tell which string is a question, which is its answer, and
 * which business they belong to.
 *
 * The QAPage @id points at the GROUP'S page, not the site root — that's the
 * whole reason a group stores a path. Organization stays site-level and is
 * referenced by @id, so every group's schema describes the same business rather
 * than declaring a new one per page.
 */
export function buildSchemaJson(site: Site, group: FaqGroup, faqs: FaqEntry[]): string {
  const entries = publishable(faqs);
  const organizationId = `https://${site.domain}/#organization`;

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      '@id': organizationId,
      name: site.name,
      url: `https://${site.domain}/`,
    },
  ];

  if (entries.length > 0) {
    const url = groupUrl(site, group);

    graph.push({
      '@type': 'QAPage',
      /*
        ⚠️ NO @id AND NO url UNTIL THE SET HAS A PAGE. Spreading them in only
        when `url` is known is what keeps this honest: the alternative is
        `"@id": "https://letsroof.comnull#faq"`, which is not a weaker claim but
        a wrong one. Same rule buildArticleSchemaJson() follows — an article has
        no stored path and therefore names no page.
      */
      ...(url ? { '@id': `${url}#faq`, url } : {}),
      name: group.name,
      publisher: { '@id': organizationId },
      mainEntity: entries.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    });
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
}

/**
 * The schema wrapped in the script tag it's pasted as.
 *
 * `<` is escaped to its < form, which JSON reads as the same character and
 * an HTML parser cannot read as a tag at all. Without it an answer containing
 * the literal text `</script>` closes this element early: the schema is
 * truncated to invalid JSON, and the remainder spills onto the customer's page
 * as visible text. Rare, but it is their page, and JSON.stringify does not
 * escape `/` on its own.
 */
export function buildSchemaBlock(site: Site, group: FaqGroup, faqs: FaqEntry[]): string {
  const json = buildSchemaJson(site, group, faqs).replace(/</g, '\\u003c');

  return `<script type="application/ld+json">\n${json}\n</script>`;
}

/*
  Both halves as one paste.

  They were two copy blocks once, which read as a choice and wasn't one: the
  schema describes answers at a URL, so it is only ever correct on the page
  those answers are on. Worse, contentHash below covers question and answer
  text alone — the same fingerprint for both blocks — so somebody who pasted
  the HTML, skipped the schema and marked the group published got told it was
  up to date. The interface offered a distinction the stored state could not
  represent.

  Answers first, script after. The visible text is what earns the citation, so
  it leads and survives a truncated paste; the schema is a label on top of it.
*/
export function buildPasteBlock(site: Site, group: FaqGroup, faqs: FaqEntry[]): string {
  const html = buildFaqHtml(group, faqs);
  if (!html) return '';

  return `${html}\n\n${buildSchemaBlock(site, group, faqs)}`;
}

/**
 * llms.txt — a plain-text summary at the site root, addressed to language
 * models rather than crawlers.
 *
 * SITE-WIDE, not per group. There is only one /llms.txt at a domain, so it
 * aggregates every group under its own heading with the page it lives on.
 * Generating one per group would tell the customer to write four different
 * files to the same location.
 */
export function buildLlmsTxt(
  site: Site,
  groups: FaqGroup[],
  faqsFor: (groupId: string) => FaqEntry[],
): string {
  const lines = [
    `# ${site.name}`,
    '',
    `> Answers to the questions customers most often ask ${site.name}.`,
    '',
  ];

  const ordered = [...groups].sort((a, b) => a.position - b.position);

  for (const group of ordered) {
    const entries = publishable(faqsFor(group.id));
    if (entries.length === 0) continue;

    const url = groupUrl(site, group);
    lines.push(`## ${group.name}`, '', ...(url ? [`Published at ${url}`, ''] : []));
    for (const faq of entries) {
      lines.push(`- **${faq.question}** ${faq.answer}`);
    }
    lines.push('');
  }

  lines.push('## Source', '', `https://${site.domain}/`);

  return lines.join('\n');
}

/**
 * The answers as plain text. THE ONE EXPORT THAT IS NEVER GATED.
 *
 * ⚠️ THIS EXISTS TO KEEP A PROMISE THE PRICING PAGE MAKES, and deleting it would
 * break that promise rather than merely remove a feature.
 *
 * Under the old one-time product, everything a customer made was theirs
 * permanently — canPublish() was gated on "did they ever pay", never on "are
 * they still paying", because you cannot revoke something somebody bought
 * outright. Pro is a subscription, so the HTML and the schema now stop with it.
 * That is defensible only because the WORDS do not: this is how a free account,
 * or a lapsed one, takes its own writing away.
 *
 * ⚠️ DELIBERATELY NOT USEFUL FOR PUBLISHING. No markup, no schema, no heading
 * structure a crawler reads as a Q&A block — because that is exactly what the
 * subscription sells. Anyone can retype this into their own site; nobody can
 * paste it and get the structured-data benefit. If this ever grows a tag, it has
 * become buildFaqHtml() with extra steps and the gate is gone.
 *
 * Includes DRAFTS as well as published answers, unlike every other export here.
 * The others feed a live website, where a half-written draft leaking out is the
 * failure they guard against. This one feeds a text file the customer is taking
 * with them, and silently dropping their unfinished work would be the failure.
 */
export function buildPlainText(group: FaqGroup, faqs: FaqEntry[]): string {
  const ordered = [...faqs].sort((a, b) => a.position - b.position);

  const lines: string[] = [group.name, ''];

  for (const faq of ordered) {
    const question = faq.question.trim();
    const answer = faq.answer.trim();
    if (!question || !answer) continue;

    // Marked rather than silently mixed in: a customer pasting this somewhere
    // should be able to see which ones they had not finished.
    lines.push(`Q: ${question}${faq.status === 'draft' ? '  [draft]' : ''}`, `A: ${answer}`, '');
  }

  return lines.join('\n').trimEnd() + '\n';
}

/* ------------------------------------------------------------ articles --- */

/*
  An article is a different kind of paste from a Q&A block, and the differences
  are worth stating once here rather than being rediscovered:

  - It is ONE page's whole body, not a section bolted onto an existing page. So
    it leads with an <h1>, which the FAQ block deliberately never does — that
    block is a guest on somebody else's page and an <h1> would fight the page's
    own.
  - It has no group, so there is no stored path and no published hash. Nothing
    tracks whether an article's live copy has drifted, because there is no
    address to compare against. That is a real gap, not an oversight to paper
    over with a guess at where they pasted it.

  Everything else follows the rules at the top of this file: no JavaScript, real
  heading and paragraph elements, and nothing pointing at faqflo.com.
*/

/** Blank-line-separated prose to <p> elements. */
function paragraphs(body: string, className: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `  <p class="${className}">${escapeHtml(p)}</p>`)
    .join('\n');
}

/**
 * The article as HTML.
 *
 * ⚠️ EVERY FIELD GOES THROUGH escapeHtml() AND NOTHING IS INTERPRETED. The
 * headings are real <h2> elements because the schema in lib/article.ts has a
 * heading field — not because anything here looked for a "##". A model that
 * emitted markdown despite being told not to produces visible "##" characters,
 * which is ugly and obvious; a builder that tried to parse it would instead be
 * a markdown-to-HTML converter running on untrusted text.
 */
export function buildArticleHtml(article: Article): string {
  const title = article.title.trim();
  if (!title) return '';

  const intro = paragraphs(article.intro, 'faqflo-article-intro');

  const sections = article.sections
    .filter((s) => s.heading.trim() && s.body.trim())
    .map(
      (s) => `  <h2 class="faqflo-article-heading">${escapeHtml(s.heading.trim())}</h2>
${paragraphs(s.body, 'faqflo-article-text')}`,
    )
    .join('\n\n');

  /*
    ⚠️ THE Q&As GO INSIDE THE <article>, AT THE FOOT, AND publishable() DOES NOT
    APPLY TO THEM. Group answers are filtered to status: 'published' before
    export; an ArticleFaq has no status at all — it is part of a draft the owner
    is editing, and everything in it goes when they copy it. Reaching for the
    group's rule here by reflex would silently emit nothing.

    <h3> under the section <h2>s, not <h2> itself: these sit below the article's
    own headings and a flat outline would put a Q&A block on the same level as a
    section of the piece.
  */
  const faqs = article.faqs
    .filter((f) => f.q.trim() && f.a.trim())
    .map(
      (f) => `    <div class="faqflo-article-faq">
      <h3 class="faqflo-question">${escapeHtml(f.q.trim())}</h3>
      <p class="faqflo-answer">${escapeHtml(f.a.trim())}</p>
    </div>`,
    )
    .join('\n\n');

  const faqBlock = faqs
    ? `  <section class="faqflo-article-faqs">
    <h2 class="faqflo-article-heading">Frequently asked questions</h2>

${faqs}
  </section>`
    : '';

  return `<article class="faqflo-article">
  <h1 class="faqflo-article-title">${escapeHtml(title)}</h1>

${[intro, sections, faqBlock].filter(Boolean).join('\n\n')}
</article>`;
}

/**
 * JSON-LD for the article.
 *
 * ⚠️ THE PUBLISHER @id IS THE ONE buildSchemaJson() ALREADY MINTS. A page can
 * carry both an article and a Q&A block, and two Organization nodes with
 * different ids on one page declare two businesses. Referencing the same
 * `https://{domain}/#organization` means whichever block is pasted first
 * defines the business and the other points at it.
 *
 * No `url` and no `@id` on the Article node: those would have to name the page
 * it was pasted on, and unlike a group, an article has no stored path. A URL we
 * guessed would be a claim about the customer's site that we have no basis for.
 *
 * No `image`, no `author`. Both are commonly stuffed in for rich results that
 * this does not chase — see the note on buildSchemaJson — and inventing an
 * author for a piece the owner publishes under their own name is exactly the
 * kind of made-up field the rest of this codebase refuses.
 */
export function buildArticleSchemaJson(site: Site, article: Article): string {
  const organizationId = `https://${site.domain}/#organization`;

  const body = [article.intro, ...article.sections.map((s) => s.body)]
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n\n');

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      '@id': organizationId,
      name: site.name,
      url: `https://${site.domain}/`,
    },
    {
      '@type': 'Article',
      headline: article.title,
      publisher: { '@id': organizationId },
      datePublished: article.createdAt,
      dateModified: article.updatedAt,
      articleBody: body,
      wordCount: article.wordCount,
    },
  ];

  /*
    ⚠️ QAPage WITH SEVERAL QUESTIONS, MATCHING buildSchemaJson() ABOVE — AND
    THAT SHAPE IS UNCONVENTIONAL. schema.org means QAPage for a page with ONE
    question and FAQPage for many. The Q&A export chose QAPage deliberately and
    says why: it is there so an assistant can tell which string is a question,
    not to chase the rich results Google retired.

    This matches it rather than being right on its own, so the product speaks
    one dialect and the decision lives in one place. Worth revisiting — for both
    builders in the same change, never for one.

    No `@id` and no `url`: unlike a group, an article has no stored path, so
    naming the page it sits on would be a claim about the customer's site we
    have no basis for.
  */
  const questions = article.faqs.filter((f) => f.q.trim() && f.a.trim());
  if (questions.length > 0) {
    graph.push({
      '@type': 'QAPage',
      name: article.title,
      publisher: { '@id': organizationId },
      mainEntity: questions.map((f) => ({
        '@type': 'Question',
        name: f.q.trim(),
        acceptedAnswer: { '@type': 'Answer', text: f.a.trim() },
      })),
    });
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
}

/**
 * Both halves as one paste — the same bargain buildPasteBlock() strikes.
 *
 * The `<` escape is not optional: an article body containing the literal text
 * `</script>` would otherwise close this element early, truncating the JSON and
 * spilling the rest onto the customer's page as visible text.
 */
export function buildArticleBlock(site: Site, article: Article): string {
  const html = buildArticleHtml(article);
  if (!html) return '';

  const json = buildArticleSchemaJson(site, article).replace(/</g, '\\u003c');
  return `${html}\n\n<script type="application/ld+json">\n${json}\n</script>`;
}

/**
 * The article as plain text, for pasting into an editor that wants words.
 *
 * Headings are left as bare lines with a blank line either side rather than
 * decorated with "##" or underlines: this is going into a WordPress or
 * Squarespace editor where the owner will style them, and markdown characters
 * they then have to delete are worse than none.
 */
export function buildArticlePlain(article: Article): string {
  const parts = [article.title.trim(), '', article.intro.trim()];

  for (const section of article.sections) {
    const heading = section.heading.trim();
    const body = section.body.trim();
    if (!heading || !body) continue;
    parts.push('', heading, '', body);
  }

  /* Same Q: / A: shape buildPlainText() uses for a group, so somebody who has
     copied both recognises the second one. No [draft] marker: an ArticleFaq has
     no status to mark. */
  const questions = article.faqs.filter((f) => f.q.trim() && f.a.trim());
  if (questions.length > 0) {
    parts.push('', 'Frequently asked questions', '');
    for (const f of questions) {
      parts.push(`Q: ${f.q.trim()}`, `A: ${f.a.trim()}`, '');
    }
  }

  return parts.join('\n').trimEnd() + '\n';
}

/**
 * Fingerprint of what's currently publishable in a group.
 *
 * Compared against the hash stored when the customer last pasted, to tell them
 * that page's live copy has drifted. Content is re-pasted by hand — that's the
 * accepted trade for not needing a plugin — so the drift has to be surfaced
 * rather than assumed away.
 *
 * djb2 rather than a crypto hash: this is change detection, not security, and
 * it needs no dependency and no async Web Crypto call.
 */
export function contentHash(faqs: FaqEntry[]): string {
  const payload = publishable(faqs)
    .map((f) => `${f.question} ${f.answer}`)
    .join('');

  let hash = 5381;
  for (let i = 0; i < payload.length; i++) {
    hash = ((hash << 5) + hash + payload.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export type PublishState = 'never' | 'current' | 'stale' | 'nothing-to-publish';

export function publishState(group: FaqGroup, faqs: FaqEntry[]): PublishState {
  if (publishable(faqs).length === 0) return 'nothing-to-publish';
  if (!group.publishedAt || !group.publishedHash) return 'never';
  return group.publishedHash === contentHash(faqs) ? 'current' : 'stale';
}

/* --------------------------------------------------------------- where it goes --- */

/*
  Step-by-step paste instructions, per builder.

  This replaced a one-sentence-per-platform list. The sentence was accurate and
  not much use: "add a Custom HTML block and paste it in" is the easy half, and
  the half people actually get stuck on is what happens AFTER it looks like it
  worked — the block that silently strips <script>, the builder that renders
  nothing while you're logged in, the embed that lands in an iframe. So each
  platform gets ordered steps plus the one thing that bites afterwards.

  ⚠️ PLAIN DATA, AND IT HAS TO STAY THAT WAY. This file has no React import and
  two consumers, one of which is a SERVER component (help-workspace.tsx). A JSX
  fragment here would drag React into the module and let the two consumers drift
  into different renderings of the same facts.

  Inline emphasis is therefore a typed segment array rather than markup or a
  markdown dialect. Deliberately NOT lib/dashboard/answer-markdown.ts: that
  parser exists for untrusted model output and its whole doc block is an
  argument about hostile input, which this copy is not — and it has no `code`
  token, which these steps need on nearly every line.
*/

/** A run of prose, a control label the customer will see, or literal markup. */
export type StepPart = string | { kind: 'ui'; label: string } | { kind: 'code'; text: string };

/** One numbered step. The number comes from the <ol>, never from the text. */
export type EmbedStep = StepPart[];

/*
  Shorthands, so the copy below stays something a non-engineer can edit.

  `['Add a ', ui('Custom HTML'), ' block.']` reads as a sentence. The same thing
  spelled out as object literals does not, and this array is copy first.
*/
const ui = (label: string): StepPart => ({ kind: 'ui', label });
const code = (text: string): StepPart => ({ kind: 'code', text });

/**
 * Ids are stable, because one of them is persisted in a browser.
 *
 * ⚠️ Renaming one silently un-remembers every customer who picked it. Adding is
 * free; renaming needs the reader in embed-instructions.tsx to keep accepting
 * the old value — which is why that reader validates rather than trusts.
 */
export type EmbedPlatformId =
  | 'wordpress'
  | 'squarespace'
  | 'webflow'
  | 'shopify'
  | 'wix'
  | 'hand-coded';

export type EmbedGuide = {
  id: EmbedPlatformId;
  /** What the customer's own bill calls it. */
  platform: string;
  /** One line: where the block ends up. Sits under the name, before the steps. */
  summary: string;
  /** Ordered, and only ever rendered as an <ol>. */
  steps: EmbedStep[];
  /**
   * The thing that bites after the paste looks like it worked.
   *
   * Optional in the type and present on all six today. It stays optional
   * because "this one has no trap" is a legitimate future state, and a required
   * field would get filled with padding rather than left out.
   */
  gotcha?: EmbedStep;
  /**
   * ⚠️ This platform's obvious route produces content a crawler cannot read.
   *
   * Wix, and so far only Wix. Not a severity dial — it means the steps below
   * deliberately route AROUND the feature the customer will reach for, so both
   * renderers colour the summary and badge it, to put the reason in front of
   * someone before they read the steps.
   */
  warning?: boolean;
};

/** Shown when nothing has been picked, and when a stored pick is no longer valid. */
export const DEFAULT_EMBED_PLATFORM: EmbedPlatformId = 'wordpress';

export const EMBED_GUIDES: EmbedGuide[] = [
  /* ------------------------------------------------------------- WordPress --- */
  {
    id: 'wordpress',
    platform: 'WordPress',
    summary: 'A Custom HTML block on the page itself — no theme files, no plugin.',
    steps: [
      ['Open the page in the block editor: ', ui('Pages'), ' → the page → ', ui('Edit'), '.'],
      [
        'Click where the answers should appear, type ',
        code('/html'),
        ' and press Enter. Or use the block inserter ',
        ui('+'),
        ' and choose ',
        ui('Custom HTML'),
        '. Not the ',
        ui('Code'),
        ' block — that one shows the markup on the page instead of rendering it.',
      ],
      /*
        ⚠️ NEEDS A CHECK ON A LIVE 7.0 INSTALL. WordPress 7.0 moved Custom HTML
        editing into a modal with Edit HTML and Update; sites still on 6.x have
        the older in-block HTML / Preview tabs. Worded to cover both rather than
        naming one and being wrong for half the installs out there.
      */
      [
        'Paste the block into the code area. On WordPress 7.0 the block opens an editor with ',
        ui('Edit HTML'),
        ' and a preview beside it — paste there, then press ',
        ui('Update'),
        ' to close it.',
      ],
      ['Press ', ui('Publish'), ' or ', ui('Update'), ' on the page.'],
    ],
    gotcha: [
      'The ',
      code('<script>'),
      ' half can vanish on save. WordPress runs the block through ',
      code('wp_kses()'),
      ' for anyone without the ',
      code('unfiltered_html'),
      ' capability — that is Editors and Authors, most of multisite, and a lot of managed hosts — and it strips ',
      code('<script>'),
      ' with no warning. Load the published page, view source, and search for ',
      code('application/ld+json'),
      '. If it is not there, open ',
      ui('Need them separately?'),
      ' on the group above, paste the answers on their own, and add the schema through your SEO plugin or an administrator account.',
    ],
  },

  /* ----------------------------------------------------------- Squarespace --- */
  {
    id: 'squarespace',
    platform: 'Squarespace',
    summary: 'A Code block in the section, set to HTML.',
    steps: [
      [
        'Edit the page, hover where the answers should go, and click ',
        ui('Add Block'),
        ' (the ',
        ui('+'),
        ').',
      ],
      ['Choose ', ui('Code'), ', then click the pencil to open the editor.'],
      [
        'Set ',
        ui('Type'),
        ' to ',
        ui('HTML'),
        ', and leave ',
        ui('Display Source'),
        ' switched off. That toggle prints your markup on the page as text — it is for showing code, not running it.',
      ],
      ['Paste the block in, click outside the block, and ', ui('Save'), '.'],
    ],
    /*
      ⚠️ TWO THINGS TO CHECK BEFORE ANYONE TIGHTENS THIS COPY.

      1. Squarespace documents its premium gate as "JavaScript and iframes". A
         <script type="application/ld+json"> contains no JavaScript, so whether
         it is gated is genuinely unclear. The note says "may not survive" and
         hands over a test rather than asserting either way — do not turn that
         into a claim without trying it on a real entry-plan site.
      2. Plan names are deliberately not mentioned: Squarespace moved to
         Basic / Core / Plus / Advanced for US accounts in late 2025, and older
         or non-US accounts may still show Personal / Business / Commerce.
    */
    gotcha: [
      'An empty-looking block is usually not a failed paste: Squarespace often refuses to render embedded code while you are signed in. Check with ',
      ui('Preview in Safe Mode'),
      ' or open the live URL in a private window before you change anything. Separately, ',
      code('<script>'),
      ' is a paid feature — HTML works on every plan — so on an entry-level plan the schema may not survive the save. If view-source shows the answers but no ',
      code('application/ld+json'),
      ', that is what happened.',
    ],
  },

  /* --------------------------------------------------------------- Webflow --- */
  {
    id: 'webflow',
    platform: 'Webflow',
    summary: 'An Embed element in the Designer, and then a publish — the two are separate.',
    steps: [
      ['Open the page in the Designer and put the cursor where the answers should appear.'],
      ['In the ', ui('Add elements'), ' panel, pick ', ui('Basic'), ' → ', ui('Embed'), '.'],
      ['Paste the block into the code editor and click ', ui('Save & Close'), '.'],
      [
        'Click ',
        ui('Publish'),
        ' at the top right. Embedded HTML renders inside the Designer straight away, which is the part that fools people — nothing is on your live domain until the site is published.',
      ],
    ],
    gotcha: [
      'One Embed element holds up to 50,000 characters, and a long answer set can reach that. If it will not fit, open ',
      ui('Need them separately?'),
      ' on the group above and use two Embed elements on the same page: the answers in one, the schema in the other. It is still one page, so the schema still describes the right URL.',
    ],
  },

  /* --------------------------------------------------------------- Shopify --- */
  {
    id: 'shopify',
    platform: 'Shopify',
    summary: 'The page content editor, switched into HTML mode.',
    steps: [
      ['In your Shopify admin, go to ', ui('Online Store'), ' → ', ui('Pages'), ' and open the page.'],
      [
        'In the ',
        ui('Content'),
        ' editor toolbar, click ',
        ui('Show HTML'),
        ' — the ',
        code('<>'),
        ' button. The editor swaps to the raw markup.',
      ],
      ['Move the cursor to the very end of what is already there, and paste the block after it.'],
      ['Click ', ui('Show HTML'), ' again if you want to eyeball it, then ', ui('Save'), '.'],
    ],
    /*
      ⚠️ Shopify documents the 64 KB limit and says the editor "automatically
      corrects HTML formatting", but publishes no allowed-tag list. So this says
      "the usual reason" and hands over a test, rather than stating as fact that
      Shopify strips <script>.
    */
    gotcha: [
      'This editor rewrites what you paste. It is a rich text field with a hard 64 KB limit and it tidies HTML on save, which is the usual reason a ',
      code('<script>'),
      ' tag is missing afterwards. Save, then view source on the live page and search for one of your questions and for ',
      code('application/ld+json'),
      '. If the answers are there and the schema is not, take the answers on their own from ',
      ui('Need them separately?'),
      ' and add the schema through your theme or your SEO app instead.',
    ],
  },

  /* ------------------------------------------------------------------- Wix --- */
  {
    id: 'wix',
    platform: 'Wix',
    warning: true,
    summary:
      'A native text section — not the HTML embed. Wix runs embeds inside an iframe, and text in an iframe is not read as part of your page, so it cannot earn you the citation.',
    /*
      ⚠️ Wix ships more than one editor now — the classic Wix Editor, Wix Studio
      and the Harmony editor — and the panel names differ between them (Studio
      calls its embed an "HTML iframe"). The steps use the classic Editor's
      labels and name the other embed elements in the "do not use" list, so the
      warning half lands whichever editor someone is in.

      The iframe problem itself is identical in all of them. That part does not
      get softened.
    */
    steps: [
      [
        'In the Editor, click ',
        ui('+'),
        ' (',
        ui('Add Elements'),
        ') and choose ',
        ui('Text'),
        ' → ',
        ui('Paragraph'),
        '. A real text element. Not ',
        ui('Embed a Widget'),
        ', not ',
        ui('Embed HTML'),
        ', not the ',
        ui('HTML iframe'),
        ' element.',
      ],
      [
        'Open ',
        ui('Need them separately?'),
        ' on the group above and copy ',
        ui('The answers'),
        ' on their own. The schema half is a ',
        code('<script>'),
        ' tag and cannot live in a text element at all.',
      ],
      [
        'Paste the questions and answers into the text element. Then select each question and set it to a heading style, and leave each answer as ',
        ui('Paragraph'),
        '. That question-then-answer structure is the part an assistant reads.',
      ],
      ['Click ', ui('Publish'), '.'],
    ],
    gotcha: [
      'The schema is what this route gives up, and there is a place to put it back: ',
      ui('Settings'),
      ' → ',
      ui('Custom Code'),
      ' → ',
      ui('Add Custom Code'),
      ', set to load on that one page, in the ',
      ui('Head'),
      ', with the ',
      code('<script>'),
      ' block from ',
      ui('Need them separately?'),
      '. Custom Code needs a paid Wix plan and a connected domain. The answers earn the citation either way — the schema is the label on top of them.',
    ],
  },

  /* ------------------------------------------- hand-coded, and everything else --- */
  {
    id: 'hand-coded',
    platform: 'Hand-coded, or anything else',
    summary:
      'Straight into the page markup. If your builder is not on this list, this is also the test that tells you where its HTML actually lands.',
    steps: [
      [
        'Paste the whole block into the page HTML where the answers should appear, inside ',
        code('<body>'),
        ' and in the normal document flow. The ',
        code('<script type="application/ld+json">'),
        ' half can sit anywhere in the same document — ',
        code('<head>'),
        ' is fine too.',
      ],
      [
        'Not inside an ',
        code('<iframe>'),
        ', and not inserted by JavaScript after load. AI crawlers do not run scripts and do not read framed content as part of your page, which is the whole reason this is HTML you paste rather than a script tag you install.',
      ],
      ['Deploy, or save and clear whatever cache sits in front of the page.'],
      [
        'Open the live URL, view source (',
        ui('Ctrl+U'),
        ', or ',
        ui('⌥⌘U'),
        ' on a Mac) and search for one of your questions. Text in the source means you are done. Text that shows up only in the inspector means it is being drawn client-side, and you need a different slot.',
      ],
    ],
    gotcha: [
      'If the tags appear on the page as visible text, that is your template escaping HTML rather than a bad paste — ',
      code('{{ }}'),
      ' in most template languages, and JSX in React, escape by default. These are your own answers rather than anything untrusted, so writing them into the template as real markup is the better fix.',
    ],
  },
];

/** Narrowing for a value read out of storage — see embed-instructions.tsx. */
export function isEmbedPlatformId(value: string): value is EmbedPlatformId {
  return EMBED_GUIDES.some((g) => g.id === value);
}

/** Total, so no caller has to invent an empty state for a bad id. */
export function embedGuide(id: EmbedPlatformId): EmbedGuide {
  return EMBED_GUIDES.find((g) => g.id === id) ?? EMBED_GUIDES[0];
}

/** Normalise whatever the customer typed into a leading-slash path. */
export function normalizePath(input: string | null): string | null {
  /*
    ⚠️ EMPTY NOW MEANS "NOT PLACED", NOT "THE HOME PAGE". This returned '/' for
    a blank input, which was right when every group had to have a path — and is
    wrong now that a set exists before anyone has chosen one. Coercing blank to
    the root would silently claim every unplaced set lives on the customer's
    home page.
  */
  if (input === null) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Accept a pasted full URL and keep only the path — a group belongs to its
  // site, so an origin typed here can only ever disagree with the site's domain.
  const withoutOrigin = trimmed.replace(/^https?:\/\/[^/]+/i, '');
  const path = withoutOrigin.startsWith('/') ? withoutOrigin : `/${withoutOrigin}`;

  // Trailing slash removed except for the root itself, so "/services/" and
  // "/services" can't become two groups pointing at one page.
  return path.length > 1 ? path.replace(/\/+$/, '') : '/';
}

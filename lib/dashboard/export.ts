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

import type { FaqEntry, FaqGroup, Site } from './types';

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

/** Absolute URL of the page a group is pasted on. */
export function groupUrl(site: Site, group: FaqGroup): string {
  return `https://${site.domain}${group.path}`;
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
    graph.push({
      '@type': 'QAPage',
      '@id': `${groupUrl(site, group)}#faq`,
      url: groupUrl(site, group),
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

    lines.push(`## ${group.name}`, '', `Published at ${groupUrl(site, group)}`, '');
    for (const faq of entries) {
      lines.push(`- **${faq.question}** ${faq.answer}`);
    }
    lines.push('');
  }

  lines.push('## Source', '', `https://${site.domain}/`);

  return lines.join('\n');
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

/** Where the block goes, per builder — including the one that breaks it. */
export const PLACEMENT_NOTES: { platform: string; note: string; warning?: boolean }[] = [
  {
    platform: 'WordPress',
    note: 'Add a Custom HTML block to the page, and paste it in. Not the Code block — that shows the markup instead of rendering it.',
  },
  {
    platform: 'Squarespace',
    note: 'Add a Code block to the section, set it to HTML, and paste. Leave "Display Source" unticked.',
  },
  {
    platform: 'Webflow',
    note: 'Drop an Embed element where the answers should appear and paste. Publish the site afterwards.',
  },
  {
    platform: 'Shopify',
    note: 'Edit the page in the rich text editor, switch to "Show HTML" (the <> button), and paste at the end.',
  },
  {
    platform: 'Wix',
    note: 'Do not use the HTML embed element — Wix renders it inside an iframe, and content in an iframe is not read as part of your page, so it will not earn you the citation. Use a native text section and paste the questions and answers as text instead.',
    warning: true,
  },
];

/** Normalise whatever the customer typed into a leading-slash path. */
export function normalizePath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '/';

  // Accept a pasted full URL and keep only the path — a group belongs to its
  // site, so an origin typed here can only ever disagree with the site's domain.
  const withoutOrigin = trimmed.replace(/^https?:\/\/[^/]+/i, '');
  const path = withoutOrigin.startsWith('/') ? withoutOrigin : `/${withoutOrigin}`;

  // Trailing slash removed except for the root itself, so "/services/" and
  // "/services" can't become two groups pointing at one page.
  return path.length > 1 ? path.replace(/\/+$/, '') : '/';
}

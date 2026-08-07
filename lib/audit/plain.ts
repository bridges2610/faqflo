/**
 * The audit, in ordinary words.
 *
 * The technical report says "No Organization markup". A business owner reads
 * that, learns something is wrong, and learns nothing about what it costs them
 * or what to do. Every sentence in this file answers "so what?" — in terms of
 * customers and answers, not tags and attributes.
 *
 * Kept as one dictionary rather than a `plain` field on each of the forty-odd
 * places a finding gets built, because the point is a consistent voice, and
 * voice is far easier to keep consistent when you can read it all at once.
 *
 * Keyed by finding id AND status: "you have a sitemap" and "you don't" are
 * different sentences, and a single string per check would have to hedge into
 * uselessness. Anything without an entry falls back to the technical detail —
 * true, if drier, and it means a newly added check is never silently blank.
 */

import type { ActionItem, AuditReport, CheckStatus, Finding } from './types';

type PlainEntry = string | ((f: Finding) => string);

/** Pull the leading number out of a detail line, when one carries the meaning. */
function count(f: Finding): string {
  const m = /^(?:About\s+)?([\d,]+)/.exec(f.detail);
  return m ? m[1] : 'Some';
}

const PLAIN: Record<string, Partial<Record<CheckStatus, PlainEntry>>> = {
  /* ---------------------------------------------------------- technical --- */
  'raw-html': {
    pass: 'AI can read your pages. The words are in the page itself, not added afterwards by code it can’t run.',
    warn: 'AI can read some of your page, but not much of it. A lot of what visitors see never reaches the systems writing AI answers.',
    fail: 'AI sees a blank page. Your site builds its content in the visitor’s browser, and the systems behind AI answers don’t wait for that — so as far as they’re concerned, there’s nothing here.',
  },
  crawlers: {
    pass: 'The big AI assistants are allowed to read your site.',
    warn: 'Some AI assistants are being turned away by your site’s settings, so they can never quote you no matter what you publish.',
    fail: 'Your site is turning the AI assistants away at the door. Nothing you write can be quoted by them until that changes — this is the first thing to fix.',
  },
  googlebot: {
    pass: 'Google is allowed to read your site.',
    fail: 'Your site is blocking Google. That takes out ordinary search results and the AI answers on top of them at the same time.',
  },
  https: {
    pass: 'Your site is secure, which every engine expects as a baseline.',
    fail: 'Your site isn’t secure. Search engines and assistants both trust an insecure site less, and visitors see a warning.',
  },
  noindex: {
    pass: 'Nothing on the page is asking search engines to ignore it.',
    fail: 'This page is telling search engines to leave it out entirely. It’s a single setting, and while it’s there nothing else you do to the page matters.',
  },
  canonical: {
    pass: 'Your pages tell engines which address is the real one.',
    warn: 'When the same page can be reached by more than one address, nothing tells engines which is the real one — so credit gets split between them instead of adding up.',
  },
  sitemap: {
    pass: 'You have a list of your pages that engines can find, so nothing gets missed.',
    warn: 'You have a list of your pages, but you haven’t told engines where it is — so they have to stumble across your pages by following links.',
    fail: 'There’s no list of your pages for engines to work from. They can only find what they happen to click through to, so newer or less-linked pages get missed.',
  },
  'schema-valid': {
    pass: 'The machine-readable information on your pages is well formed.',
    fail: 'Some of the machine-readable information on your site is broken. A machine that can’t read it ignores all of it, so you get no credit for having added it.',
  },
  lang: {
    pass: 'Your pages say what language they’re written in.',
    warn: 'Your pages don’t say what language they’re in, so a machine has to guess.',
  },
  viewport: {
    pass: 'Your pages are set up to work on phones.',
    warn: 'Your pages aren’t set up for phones, so they’ll render at desktop width on a mobile.',
  },
  speed: {
    pass: 'Your site responds quickly.',
    warn: 'Your site is slow to respond. Slow sites get visited less often and less thoroughly by the systems collecting answers.',
    fail: 'Your site is very slow to respond. That costs you visitors and means engines read less of it, less often.',
  },
  redirect: {
    pass: 'Your address goes straight where it should.',
    warn: 'The address you gave us bounces to a different one. That’s normal, but make sure the address you advertise is the one it ends up at.',
  },
  notfound: {
    pass: 'Your site correctly reports pages that don’t exist.',
    warn: 'When someone asks your site for a page that doesn’t exist, it answers as though the page is real. That lets junk pages pile up in search engines under your name.',
  },
  reachable: {
    pass: 'Every page we opened loaded properly.',
    warn: (f) => `${count(f)} of the pages we tried to open returned an error. Visitors clicking those links hit the same wall.`,
  },
  coverage: {
    // Informational and unscored; the summary already says how many were read.
    na: '',
  },

  /* ---------------------------------------------------------- structure --- */
  'question-headings': {
    pass: 'Your site asks and answers real questions, which is exactly what an assistant looks for.',
    warn: 'Only one part of your site is written as a question and answer. Assistants match what someone asked against the questions on your page, so a few more is the cheapest win available to you.',
    fail: 'Nothing on your site is written as a question. When someone asks an assistant about what you do, there’s nothing on your site for it to match against — so it answers with somebody else.',
  },
  'answer-first': {
    pass: 'Your answers get to the point quickly, which is the form that gets quoted.',
    warn: 'Some of your answers take a while to get going. An assistant quotes the first thing it finds under a question, so if that’s a warm-up paragraph, that’s what gets quoted — or nothing does.',
    fail: 'Your answers bury the point. Assistants lift the opening sentences, so put the actual answer first and the background after.',
  },
  paragraphs: {
    pass: 'Your writing is broken up enough to be quoted.',
    warn: 'Some paragraphs run long. Long blocks get summarised rather than quoted, and a summary usually drops your name.',
    fail: 'Most of your writing comes in long blocks. That gets summarised instead of quoted, and a summary doesn’t credit you.',
  },
  sentences: {
    pass: 'Your sentences are short enough to stand on their own when quoted.',
    warn: 'A lot of your sentences are long. Short ones survive being pulled out on their own; long ones get rewritten, and rewritten text loses your name.',
    fail: 'Your sentences are long and winding. Anything quoted from them gets reworded, which is how you end up informing an answer without being credited in it.',
  },
  lists: {
    pass: 'You use lists and tables, which machines read accurately.',
    warn: 'You barely use lists or tables. Steps, prices and comparisons get quoted far more often when they’re laid out as a list.',
    fail: 'There are no lists or tables anywhere. They’re the easiest thing for a machine to lift correctly, and you’re not giving it any.',
  },
  specificity: {
    pass: 'Your copy is specific — real numbers, prices and timeframes — which is what makes it worth repeating.',
    warn: 'Your copy is short on specifics. Prices, timeframes and areas covered are the things people ask about, and the things an assistant can actually repeat.',
    fail: 'Your copy is vague. There’s almost nothing concrete — no prices, no timeframes, no areas covered — so there’s nothing worth quoting.',
  },
  hierarchy: {
    pass: 'Your headings are in a sensible order, so the shape of each page is clear.',
    warn: 'Your headings skip levels in places, which muddles which answer belongs to which question.',
    fail: 'Your headings are out of order, so a machine can’t reliably tell which text answers which question.',
  },
  'qa-markup': {
    pass: 'Your questions and answers are labelled for machines, so nothing has to be guessed.',
    warn: 'Only some of your pages label their questions and answers for machines. On the rest, an assistant has to guess which text answers what.',
    fail: 'Nothing labels your questions and answers for a machine. It has to guess which text answers what — and mostly it doesn’t bother.',
  },

  /* ---------------------------------------------------------------- seo --- */
  title: {
    pass: 'Every page we read has a title.',
    warn: (f) => `${count(f)} of your pages have no title. The title is the clearest statement of what a page is about — without it, engines are guessing.`,
    fail: 'Your pages have no titles. That’s the single strongest signal of what a page is about, and it’s missing.',
  },
  'title-length': {
    pass: 'Your titles are a sensible length.',
    warn: 'Some titles are too long or too short — they get cut off in results, or say too little to be useful.',
  },
  'title-unique': {
    pass: 'Each page has its own title.',
    fail: 'Several pages share the same title, so they compete with each other instead of each being found for its own thing.',
    na: '',
  },
  'meta-description': {
    pass: 'Your pages have their own summary for search results.',
    warn: (f) => `${count(f)} of your pages have no summary, so engines write their own from whatever text they hit first — usually your menu.`,
    fail: 'None of your pages have a summary for search results, so engines invent one from whatever text they find first.',
  },
  'meta-length': {
    pass: 'Your page summaries are a sensible length.',
    warn: 'Some page summaries are too long or too short to be useful in results.',
  },
  h1: {
    pass: 'Each page has one clear headline.',
    warn: 'Some pages have no main headline, or several competing ones, which blurs what the page is about.',
    fail: 'Your pages don’t have a single clear headline, so nothing states what each one is for.',
  },
  'alt-text': {
    pass: 'Your images have text descriptions.',
    warn: 'Some images have no text description. That text is all a machine — or a visitor using a screen reader — gets from a picture.',
    fail: 'Your images have no text descriptions, so they’re invisible to anything that can’t see.',
  },
  'internal-links': {
    pass: 'Your pages link to each other, so everything can be found.',
    warn: 'Your pages barely link to each other. Engines find pages by following links, so anything unlinked is effectively hidden.',
    fail: 'Your pages don’t link to each other, so there’s no path for an engine to find the rest of your site.',
  },
  'open-graph': {
    pass: 'Links to your site preview properly when shared.',
    warn: 'Links to your site preview badly when someone shares them — no image, or no description.',
    fail: 'Sharing a link to your site produces a bare, unappealing preview.',
  },
  'word-count': {
    pass: 'Your pages have enough substance to be worth quoting.',
    warn: (f) => `${count(f)} of your pages are very thin. There’s not enough on them to answer anything.`,
    fail: 'Your pages are very thin. There isn’t enough on them for anyone — person or machine — to get an answer from.',
  },

  /* ----------------------------------------------------------- citation --- */
  'org-schema': {
    pass: 'Your site says who it belongs to in a way machines can read.',
    warn: 'Your site half-identifies the business — enough to be noticed, not enough to be credited properly.',
    fail: 'Nothing on your site tells AI which business these answers belong to. It can repeat what you wrote and credit somebody else, or nobody.',
  },
  'same-as': {
    pass: 'Your site is linked to your profiles elsewhere, so engines know it’s all one business.',
    warn: 'Your site points at only one other profile. The more you connect, the more certain an engine is that it’s all the same business.',
    fail: 'Nothing connects your site to your listings and profiles elsewhere, so engines can’t be sure they’re all the same business.',
  },
  contactable: {
    pass: 'People — and machines — can find how to contact you.',
    fail: 'There’s no phone number or email anywhere we looked. A business that can’t be contacted is one an assistant has little reason to recommend.',
  },
  freshness: {
    pass: 'Your content shows when it was written or updated.',
    warn: 'Your content mentions a date, but not in a way a machine can read.',
    fail: 'Nothing shows when your content was written. Assistants prefer sources they can tell are current, and undated pages quietly age out.',
  },
  sources: {
    pass: 'You link out to other sources, which reads as researched rather than promotional.',
    warn: 'You don’t link out to anything. Citing a supplier, a standard or a local authority is a cheap way to look credible.',
  },
  'llms-txt': {
    pass: 'You publish a summary file aimed at AI assistants.',
    warn: 'You don’t have the small summary file that AI assistants look for. It’s one file, and FaqFlo writes it for you.',
    fail: 'You don’t have the small summary file that AI assistants look for. It’s one file, and FaqFlo writes it for you.',
  },

  /* ---------------------------------------------------------- authority --- */
  'identity-pages': {
    pass: 'You have an about page and a contact page — the basics of looking real.',
    warn: 'You’re missing either an about page or a contact page. Both are things people and machines check before trusting a business.',
    fail: 'You have neither an about page nor a contact page. That’s hard to trust and harder to credit.',
  },
  'policy-pages': {
    pass: 'You have the standard privacy and terms pages.',
    warn: 'You don’t have a privacy or terms page. It’s a small thing, but its absence stands out on a business site.',
  },
  authorship: {
    pass: 'Your content says who wrote it.',
    warn: 'Your content has a byline, but not in a form a machine can read.',
    fail: 'Nothing says who wrote your content. Content with a name behind it is easier to trust and easier to quote.',
  },
  'social-proof': {
    pass: 'Your reviews are readable by machines as well as people.',
    warn: 'You have testimonials, but they’re not labelled as reviews, so machines can’t count them.',
    fail: 'There are no reviews or testimonials on your site — one of the strongest trust signals a local business has.',
  },
  'name-consistency': {
    pass: 'Your business name is used consistently across your site.',
    warn: 'Your business name is written differently in different places. Engines match businesses by name, and inconsistency splits you into two.',
    na: '',
  },

  /* --------------------------------------------------------- visibility --- */
  cited: {
    pass: 'AI assistants are naming your site as a source. This is the thing everything else is for.',
    warn: 'You’re being cited some of the time. There’s room to win the questions you’re still missing.',
    fail: 'No assistant named your site in the answers we checked. Someone else was.',
    locked: 'We haven’t checked whether assistants are quoting you — that’s what tracking does.',
  },
  'engine-spread': {
    pass: 'More than one assistant is citing you, which is a healthier position than depending on one.',
    warn: 'Only one assistant is citing you so far. That’s a start, not a spread.',
    fail: 'No assistant is citing you yet.',
  },
  'share-of-voice': {
    pass: 'You hold a solid share of the answers on your own questions.',
    warn: 'You’re getting some of the answers on your questions; competitors are getting the rest.',
    fail: 'Competitors are taking the answers on the questions your customers ask.',
  },
};

/**
 * The plan, in the same voice.
 *
 * The action titles are written for the full report, where "Write meta
 * descriptions for the pages missing one" is exactly right. On the summary that
 * sentence asks the reader to already know what a meta description is, which is
 * the whole problem this page exists to solve. Keyed by the recipe id from
 * actions.ts; anything without an entry keeps its technical wording.
 */
const PLAIN_ACTIONS: Record<string, { what: string; why?: string; label?: string }> = {
  'unblock-crawlers': {
    what: 'Let the AI assistants read your site',
    why: 'Right now your site turns them away. Nothing else on this list matters until it stops.',
  },
  'server-render': {
    what: 'Get your words into the page itself',
    why: 'Your content is assembled in the visitor’s browser, and AI assistants don’t wait for that — they see an empty page. Your web developer will know what this means.',
  },
  'publish-answers': {
    what: 'Answer the questions your customers actually ask',
    why: 'A question with a short answer under it is the shape an assistant looks for, and the shape it can quote whole.',
  },
  'paste-export': {
    what: 'Put your answers on your website',
    why: 'Answers written in FaqFlo do nothing until they’re on your own site, where an assistant can find them.',
  },
  'identity-schema': {
    what: 'Tell AI which business this is',
    why: 'Without it an assistant can repeat your answer and never mention your name.',
    label: 'Get the code to paste',
  },
  titles: {
    what: 'Give every page a proper title',
    why: 'The title is how a search engine decides what a page is about. Some of yours are missing or repeated.',
  },
  'answer-first': {
    what: 'Say the answer in the first two sentences',
    why: 'Assistants quote the opening of a section. If yours opens with a warm-up, that’s what gets quoted — or nothing does.',
  },
  'meta-descriptions': {
    what: 'Write the one-line summary that shows under your search result',
    why: 'Without it, search engines write their own from whatever text they find first — usually your menu.',
  },
  'llms-txt': {
    what: 'Add the small summary file AI assistants look for',
    why: 'It takes one file, and FaqFlo writes it for you.',
    label: 'Get your file',
  },
  'identity-pages': {
    what: 'Add an about page and a way to contact you',
    why: 'A business nobody can identify or reach is one an assistant has little reason to recommend.',
  },
  sitemap: {
    what: 'Give search engines a list of your pages',
    why: 'It’s how they find the pages nothing links to prominently.',
  },
  freshness: {
    what: 'Show when your content was last updated',
    why: 'Assistants prefer sources they can tell are current, and an undated page quietly ages out.',
  },
  specificity: {
    what: 'Put real numbers in your answers',
    why: 'Prices, timeframes and areas covered are what people ask about — and the only things worth repeating.',
  },
};

export function plainAction(item: ActionItem): { what: string; why: string; label: string } {
  const entry = PLAIN_ACTIONS[item.id];
  const label = item.action.kind === 'none' ? '' : item.action.label;

  return {
    what: entry?.what ?? item.what,
    why: entry?.why ?? item.why,
    // Button labels naming a file or a format ("Get your llms.txt", "Get the
    // schema block") are jargon on a page whose whole job is not to use any.
    label: entry?.label ?? label,
  };
}

/** The plain sentence for a finding, falling back to the technical detail. */
export function plainFor(finding: Finding): string {
  const entry = PLAIN[finding.id]?.[finding.status];
  if (entry === undefined) return finding.detail;
  const text = typeof entry === 'function' ? entry(finding) : entry;
  return text || finding.detail;
}

/** Findings we deliberately keep out of the plain summary entirely. */
export function isHiddenInSummary(finding: Finding): boolean {
  if (finding.status === 'na' || finding.status === 'locked') return true;
  // An empty entry means "true, but not worth a business owner's attention".
  const entry = PLAIN[finding.id]?.[finding.status];
  return typeof entry === 'string' && entry === '';
}

/**
 * The opening paragraph.
 *
 * Composed by rule from the findings, in severity order, so it can never
 * describe a problem the audit didn't find. It names the single biggest thing
 * standing in the way and what that costs — because the one thing a busy owner
 * reads is the first two sentences.
 */
export function verdict(report: AuditReport): string {
  const all = report.pillars.flatMap((p) => p.findings);
  const at = (id: string) => all.find((f) => f.id === id);
  const failing = (id: string) => at(id)?.status === 'fail';
  const shaky = (id: string) => at(id)?.status === 'fail' || at(id)?.status === 'warn';

  const pages = report.crawled.length;
  const scanned = `We looked at ${pages} ${pages === 1 ? 'page' : 'pages'} of your site the way an AI assistant would.`;

  if (failing('crawlers') || failing('googlebot')) {
    return `${scanned} Your site is turning the AI assistants away at the door — its settings tell them not to read it. Until that changes, nothing you publish can be quoted, however good it is. It’s a two-minute fix and it’s the only thing worth doing first.`;
  }

  if (failing('raw-html')) {
    return `${scanned} They saw an empty page. Your site puts its content together in the visitor’s browser, and the systems behind AI answers don’t wait for that — so as far as they’re concerned, there’s nothing on your site at all. That’s the thing to fix before anything else.`;
  }

  if (failing('noindex')) {
    return `${scanned} One setting on your site is telling search engines to leave it out entirely. Everything else here is academic while that’s switched on.`;
  }

  if (failing('qa-markup') && failing('question-headings')) {
    return `${scanned} They can read it — but nothing on it is written as a question with an answer underneath. When one of your customers asks an assistant about what you do, there’s nothing on your site to match against, so it answers with somebody else. This is the gap that costs you the most, and it’s the one FaqFlo is built to close.`;
  }

  if (failing('org-schema')) {
    return `${scanned} They can read it, but nothing on it says which business these answers belong to. An assistant can repeat what you wrote and credit somebody else — you do the work, someone else gets named.`;
  }

  if (shaky('qa-markup') || shaky('answer-first')) {
    return `${scanned} The foundations are sound: they can reach your site and read it. What’s missing is shape — your answers aren’t laid out as questions with a direct reply underneath, which is the form assistants actually quote.`;
  }

  if (report.score >= 85) {
    return `${scanned} It’s in good shape — readable, identifiable and structured the way assistants like. From here it’s about depth: more of the questions your customers ask, answered better than anyone else answers them.`;
  }

  return `${scanned} Nothing is badly broken, but several small things are each costing you a little. The list below is in the order worth doing them.`;
}

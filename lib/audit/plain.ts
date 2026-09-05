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

import type { ActionItem, AuditReport, CheckStatus, Finding, PillarId } from './types';

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
    warn: 'AI can read some of your page but not much of it, and most of what a visitor sees never reaches it.',
    fail: 'AI sees a blank page, because your site builds its content in the visitor’s browser and assistants don’t wait around for that. As far as they can tell, there is nothing here at all.',
  },
  crawlers: {
    pass: 'The big AI assistants are allowed to read your site.',
    warn: 'Your site’s settings turn some of the AI assistants away, and the ones turned away can never quote you, whatever you publish.',
    fail: 'Your site turns the AI assistants away at the door, so nothing you write can be quoted until that changes. It is the first thing on the list to fix.',
  },
  /* ⚠️ NO `warn` ON EITHER OF THE NEXT TWO, AND NONE IS NEEDED. Both checks
     are binary in lib/audit/checks/technical.ts — `allowed ? 'pass' : 'fail'`
     and `noindex ? 'fail' : 'pass'`. plainFor() falls back to the technical
     `detail` for a status with no entry, which would put developer wording on
     the plain report; that cannot happen while these stay binary. If either
     ever grows a middle state, it needs a warn sentence here first. */
  googlebot: {
    pass: 'Google is allowed to read your site.',
    fail: 'Your site is blocking Google, which costs you the ordinary search results as well as the AI answers that sit above them.',
  },
  https: {
    pass: 'Your site is secure, which every engine expects as a baseline.',
    fail: 'Your site isn’t secure. Search engines and assistants both trust an insecure site less, and visitors see a warning.',
  },
  noindex: {
    pass: 'Nothing on the page is asking search engines to ignore it.',
    fail: 'This page is telling search engines to leave it out, and while that one setting is on, nothing else here counts.',
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
    fail: 'None of your pages have a summary for search results. Engines invent one from whatever text comes first.',
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
    warn: 'You link out to very little. Citing a supplier, a standard or a local authority is a cheap way to look credible.',
    /* The check has three arms — three or more outbound links passes, one or
       two warns, none fails — and only the first two had a sentence, so the
       most isolated case fell through to the technical detail. */
    fail: 'You don’t link to anything outside your own site. That reads as promotional, and assistants trust sources that back themselves up.',
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
 *
 * ⚠️ `where` AND `label` WERE THE HOLE IN THIS, AND IT WAS A STRUCTURAL ONE.
 * The dictionary translated `what` and `why` and stopped, so a reader who got
 * as far as acting on a step met "Inside the <head> of each page" and a button
 * reading "Copy the robots.txt rules" — the two strings closest to actually
 * doing the work were the two that never went through the plain layer. Four
 * recipes had no `label` at all and fell through to the technical one, under a
 * comment in plainAction() saying exactly why they must not.
 *
 * ⚠️ THESE ARE ALLOWED TO NAME A FILE, UNLIKE ANYTHING ELSE HERE. A `where`
 * points at a real place on a real server, and vagueness there is not
 * kindness — it is a step nobody can follow. The rule the pricing page sets
 * applies instead: where a technical term is genuinely the name of the thing,
 * explain it in the same breath rather than assuming it.
 */
const PLAIN_ACTIONS: Record<
  string,
  { what: string; why?: string; label?: string; where?: string }
> = {
  'unblock-crawlers': {
    what: 'Let the AI assistants read your site',
    why: 'Right now your site turns them away at the door, and nothing else on this list counts until that stops.',
    label: 'Copy these lines',
    where:
      'These go in a file called robots.txt, at the top level of your site. Whoever looks after your website will know where that is.',
  },
  'server-render': {
    what: 'Get your words into the page itself',
    why: 'Your content is assembled in the visitor’s browser, and AI assistants don’t wait for that — they see an empty page. Your web developer will know what this means.',
  },
  'publish-answers': {
    what: 'Answer the questions your customers actually ask',
    why: 'A question with a short answer underneath is the one shape an assistant can lift whole, so it is what they look for first.',
  },
  'paste-export': {
    what: 'Put your answers on your website',
    why: 'Answers written in FaqFlo do nothing until they’re on your own site, where an assistant can find them.',
  },
  'identity-schema': {
    what: 'Tell AI which business this is',
    why: 'Without it an assistant can repeat your answer word for word and never once mention your name.',
    label: 'Get the code to paste',
  },
  /* ⚠️ NO 'titles' OR 'meta-descriptions' ENTRIES HERE, AND THAT IS NOT AN
     OVERSIGHT. PLAIN_ACTIONS is keyed by ACTION id, and both recipes were
     removed from lib/audit/actions.ts — see the note there for why. A plain-
     English rewrite of an action that can no longer be produced is a lookup
     that never fires. The audit CHECKS for both still run and still score; it
     is the advice that went, not the measurement. */
  'answer-first': {
    what: 'Say the answer in the first two sentences',
    why: 'Assistants quote the opening of a section. If yours opens with a warm-up, that’s what gets quoted — or nothing does.',
  },
  'llms-txt': {
    what: 'Add the small summary file AI assistants look for',
    why: 'It is a single file summarising your site for AI assistants, and FaqFlo writes it for you.',
    label: 'Get your file',
  },
  'identity-pages': {
    what: 'Add an about page and a way to contact you',
    why: 'A business nobody can identify or reach is one an assistant has little reason to recommend.',
  },
  sitemap: {
    what: 'Give search engines a list of your pages',
    why: 'It is how they find the pages that nothing on your site links to prominently.',
    label: 'Copy this line',
    where: 'Add this to the end of your robots.txt file, at the top level of your site.',
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

export function plainAction(item: ActionItem): {
  what: string;
  why: string;
  label: string;
  where: string;
} {
  const entry = PLAIN_ACTIONS[item.id];
  const label = item.action.kind === 'none' ? '' : item.action.label;
  const where = item.action.kind === 'copy' ? item.action.where : '';

  return {
    what: entry?.what ?? item.what,
    why: entry?.why ?? item.why,
    // Button labels naming a file or a format ("Get your llms.txt", "Get the
    // schema block") are jargon on a page whose whole job is not to use any.
    label: entry?.label ?? label,
    /*
      Where to put the snippet. Empty for any action that hands over nothing to
      paste, so a caller can render it unconditionally.

      ⚠️ THIS ONE MAY NAME A FILE, AND THE OTHERS MAY NOT. Every string above
      answers "so what?" and can afford to avoid a filename. This answers
      "where exactly?", and a reader who has got this far needs a real place,
      not a gentler description of one. It still explains the name rather than
      assuming it — the rule pricing-teaser.tsx sets for llms.txt.
    */
    where: entry?.where ?? where,
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

/*
  The passing checks worth saying out loud, most load-bearing first.

  Not every pass is interesting. "Your site is served over HTTPS" is true and
  nobody's day is improved by hearing it, whereas "the AI assistants are allowed
  to read your site" is the whole ballgame. This list is the order of what
  actually matters, and the summary names the top few that passed rather than
  reciting all twenty.

  Deliberately the mirror of verdict()'s severity cascade: the same checks, in
  roughly the same order of consequence, said as wins instead of faults.

  Each one is a sentence of its own, in two halves: what is true, and what that
  buys them. The second half is the whole reason to name it — "your questions
  are labelled" means nothing to somebody who does not already know why that
  matters, and telling them is the difference between a report and help.
*/
const WINS: { id: string; phrase: string; so: string }[] = [
  {
    id: 'crawlers',
    phrase: 'The AI assistants are allowed in',
    so: 'so they can read your pages any time',
  },
  {
    id: 'raw-html',
    phrase: 'Your words sit right there in the page',
    so: 'so they can read them',
  },
  {
    id: 'qa-markup',
    phrase: 'Your questions are labelled',
    so: 'so a machine can tell which answer belongs to which',
  },
  {
    id: 'question-headings',
    phrase: 'You ask questions the way your customers ask them',
    so: 'the wording people really type',
  },
  {
    id: 'org-schema',
    phrase: 'Your business is named in the code',
    so: 'so an assistant knows who to credit',
  },
  {
    id: 'answer-first',
    phrase: 'Your answers come straight after the question',
    so: 'the shape an assistant quotes',
  },
  {
    id: 'specificity',
    phrase: 'Your answers use real numbers instead of vague claims',
    so: 'which makes them worth repeating',
  },
  {
    id: 'title',
    phrase: 'Every page says what it is',
    so: 'so nothing gets mistaken for something else',
  },
  {
    id: 'identity-pages',
    phrase: 'You have an about and a contact page',
    so: 'how people check you are real',
  },
  {
    id: 'contactable',
    phrase: 'People can find how to reach you',
    so: 'which many sites still hide',
  },
  {
    id: 'sitemap',
    phrase: 'You have a sitemap',
    so: 'so crawlers are told where everything lives instead of guessing',
  },
  {
    id: 'https',
    phrase: 'Your site is served securely',
    so: 'which everything else quietly depends on',
  },
];

/*
  ⚠️ READING-LEVEL TARGET FOR EVERYTHING COMPOSED BELOW: under grade 7
  (Flesch-Kincaid). This page is read by the owner of a roofing company, not by
  someone who knows what a canonical tag is.

  In practice the words were never the problem — the vocabulary here already
  scored 4.7–7.0. Sentence LENGTH is. Anything over about fifteen words a
  sentence pushes the grade up on its own, so the rule of thumb is: one idea per
  sentence, and split a list into sentences rather than joining it with commas.

  This is a floor on clarity, not a licence to lose accuracy. If a sentence can
  only be shortened by making it vaguer, leave it long and say why.

  ⚠️ AND THE FIFTEEN-WORD RULE IS FOR THE FINDINGS ABOVE, NOT FOR PROSE.

  The entries in PLAIN are a list: each one is read on its own, beside a status
  mark, and one idea per sentence is genuinely clearer there. verdict() is a
  paragraph somebody reads start to finish, and the same rule applied to it
  produced a telegram — eight sentences of four to eleven words each, none
  joined to the next:

    "We read 100 pages of Letsroof's site the way AI does. You run a roofing
     contractor. We also asked AI 81 questions. It named you in 15. It's in
     good shape."

  Every sentence there is short, the grade measured 3.2, and it reads like a
  robot. So the target is the GRADE, and the grade has room: connect clauses
  with "and", "so" and "but", vary the length, and let a sentence run to
  twenty-odd words when that is how a person would say it. Measure the grade
  afterwards rather than counting words as you go.
*/

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
];

/**
 * Small numbers as words, the way a person writing to another person does.
 *
 * "One thing needs fixing" reads like someone talking; "1 thing needs fixing"
 * reads like a form. Values are unchanged, so these still match the count on
 * the badge beside the heading.
 */
function num(n: number): string {
  return n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n);
}

function capitalise(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** How many of the top WINS count as "the hard part" rather than hygiene. */
const HARD_PART = 3;

/**
 * The paragraph above "What's already working".
 *
 * Composed by rule from the findings, exactly like verdict() below and for the
 * same reason: it can only ever name a strength the audit actually found. It
 * exists because a list of twenty ticks is something people scroll past — this
 * says how much is right and which of it carries the most weight, before the
 * list is even opened.
 *
 * It opens with the real count rather than a word like "most" or "a fair
 * amount". A band has to be tuned, reads as an opinion, and is the kind of thing
 * a customer argues with; "14 of them came back right" is checkable against the
 * list directly underneath it. Counted with the same isHiddenInSummary() filter
 * the list uses, so the two can never disagree.
 *
 * ⚠️ The wins are separate SENTENCES, not a comma-joined list. That one change
 * is most of the reading level: joined, the same three phrases made a 19-word
 * sentence; split, they are three sentences of six.
 */
/**
 * A finding in a few words, for a bulleted list.
 *
 * ⚠️ NOT `finding.label`, AND THAT IS THE WHOLE POINT. Eleven of the forty-four
 * labels the check modules emit are written for someone who builds websites —
 * "Canonical URL declared", "One H1 per page", "Served over HTTPS", "Page is
 * indexable". They are correct and they belong in the technical view. On a page
 * whose entire purpose is that a roofer follows it, they are the wrong words.
 *
 * ⚠️ AND NO NEW LOOKUP TABLE. This reads the two that already exist: the WINS
 * phrase where a finding has one, because those were written to be short and
 * plain, and otherwise the first sentence of plainFor(), which is the
 * plain-English rendering every other surface already shows. A third map beside
 * PLAIN and WINS would be a third thing to drift out of step, and this file
 * carries that warning about itself.
 */
export function plainShort(finding: Finding): string {
  const win = WINS.find((w) => w.id === finding.id);
  if (win && finding.status === 'pass') return win.phrase;

  const full = plainFor(finding);
  const first = full.split(/(?<=[.?!])\s/)[0] ?? full;
  return first.replace(/[.]$/, '');
}

export function strengths(report: AuditReport): string {
  const shown = report.pillars.flatMap((p) => p.findings).filter((f) => !isHiddenInSummary(f));
  const passing = shown.filter((f) => f.status === 'pass');
  const problems = shown.filter((f) => f.status === 'fail' || f.status === 'warn');
  const total = passing.length + problems.length;

  const counted = `We checked ${num(total)} ${total === 1 ? 'thing' : 'things'} on your site`;
  const lead =
    problems.length === 0
      ? // "Every one came back right" of a single check reads as a joke.
        `${counted}, and ${total === 1 ? 'it came' : 'every one of them came'} back right.`
      : `${counted}, and ${num(passing.length)} of them ${
          passing.length === 1 ? 'is' : 'are'
        } already right.`;

  const wins = WINS.filter((w) => passing.some((f) => f.id === w.id)).slice(0, 3);

  /* Nothing on the priority list passed, so there is no honest way to say which
     of these matters most — the passes are all the quiet hygiene ones. Better
     to hand over the list than to promote something that isn't a highlight. */
  if (wins.length === 0) {
    // No editorial. "None of it needs your attention" is true of passing checks
    // but reads as "none of it matters", which is the opposite of the point.
    return `${lead} They’re the quieter sort of check rather than the headline ones, but they all came back clean. Open the list below if you’d like to see them.`;
  }

  /* "And" on the last one, so three sentences read as a list rather than as
     three unrelated statements. */
  const named = wins
    .map((w, i) => {
      const body = `${w.phrase}, ${w.so}.`;
      return i > 0 && i === wins.length - 1 ? `And ${body.charAt(0).toLowerCase()}${body.slice(1)}` : body;
    })
    .join(' ');

  /* Only claim the hard part is done when one of the top few actually passed.
     A site whose only wins are HTTPS and page titles has not done the hard
     part, and saying so would be the kind of flattery that costs you trust the
     moment they read the next section. */
  const bigWin = WINS.slice(0, HARD_PART).some((w) => wins.includes(w));

  return bigWin
    ? `${lead} ${named} That’s the hard part, and you’ve already done it.`
    : `${lead} ${named} They’re worth knowing about before you read the rest.`;
}

/*
  What each pillar is about, for someone who does not work in this.

  The labels in lib/audit/types.ts — "Content structure & answerability",
  "Citation & source readiness" — are written for the technical view, and are
  exactly the register this page exists to avoid.
*/
/**
 * What each area of the audit is really about, in ordinary words.
 *
 * ⚠️ EXPORTED FOR THE TECHNICAL VIEW, WHICH TAGS EVERY CHECK WITH ITS AREA.
 * That view groups by urgency rather than by pillar, so the area has to travel
 * on the row itself. These names are written to complete "it comes down to…",
 * which is how holdingBack() uses them — read them that way before editing, and
 * do not write a second set somewhere else.
 */
export const PILLAR_PLAIN: Record<PillarId, string> = {
  technical: 'letting the AI read your pages at all',
  structure: 'how your answers are laid out',
  seo: 'the basics search engines look for',
  citation: 'saying who you are',
  authority: 'looking like a business people can trust',
  visibility: 'showing up in AI answers',
};

/**
 * The paragraph above "What's holding you back".
 *
 * ⚠️ THIS MUST NOT RESTATE THE VERDICT. The card at the top of the page already
 * names the single biggest problem and what it costs, and the reader has just
 * read it two inches above. This answers the questions that one doesn't: how
 * many, what kind, how bad, and what to do about it. If both open with the same
 * claim, both look worse.
 *
 * `fail` and `warn` are counted separately because they are different things.
 * "7 problems" reads as a disaster; "3 need fixing and 4 are worth a look" is
 * the same finding and an accurate one.
 */
export function holdingBack(report: AuditReport): string {
  const shown = report.pillars.flatMap((p) => p.findings).filter((f) => !isHiddenInSummary(f));
  const fails = shown.filter((f) => f.status === 'fail');
  const warns = shown.filter((f) => f.status === 'warn');
  const problems = [...fails, ...warns];

  /* Defensive. The caller only renders this section when there is something in
     it, but a "0 things are worth a look" sentence is the kind of thing that
     escapes the moment somebody reuses the function somewhere else. */
  if (problems.length === 0) return '';

  const fixing = `${num(fails.length)} ${fails.length === 1 ? 'thing needs' : 'things need'} fixing`;
  const looking = `${num(warns.length)} ${warns.length === 1 ? 'thing is' : 'things are'} worth a look`;
  const more = `${warns.length === 1 ? 'one more is' : `${num(warns.length)} more are`} worth a look`;

  const lead = capitalise(
    fails.length && warns.length
      ? `${fixing}, and ${more}.`
      : fails.length
        ? `${fixing}.`
        : `${looking}.`,
  );

  /*
    The theme. Weighted by the findings' own weights rather than by count, so
    one heavy problem outranks three trivial ones — the same arithmetic the
    score uses. Only stated when a single pillar really does dominate; below
    that it would be a claim about a pattern that isn't there.
  */
  const byPillar = new Map<PillarId, number>();
  for (const f of problems) byPillar.set(f.pillar, (byPillar.get(f.pillar) ?? 0) + f.weight);

  const totalWeight = [...byPillar.values()].reduce((a, b) => a + b, 0);
  const [topPillar, topWeight] = [...byPillar.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];

  const theme =
    topPillar && totalWeight > 0 && topWeight / totalWeight >= 0.4
      ? problems.length === 1
        ? ` It comes down to ${PILLAR_PLAIN[topPillar]}.`
        : // "Most of them" of exactly two is a strange way to say "both".
          problems.length === 2
          ? ` Both come down to the same thing: ${PILLAR_PLAIN[topPillar]}.`
          : ` Most of them come down to the same thing: ${PILLAR_PLAIN[topPillar]}.`
      : problems.length > 2
        ? ' They’re spread across a few different areas rather than piling up in one place.'
        : '';

  /*
    Proportional to what was actually found. A site with a hard failure must not
    be told nothing here is serious.

    Both clauses compare items against each other, so neither can be said of a
    single problem — "some matter more than others" of one thing is nonsense.

    Note what this deliberately does NOT say: that any of it is easy. Effort
    ranges from two minutes to an hour, it is on the customer's own site, and
    the one thing worse than a long list is a long list you were told would be
    quick.
  */
  const weight =
    problems.length === 1
      ? fails.length
        ? ' It is worth doing before anything else on the site.'
        : ' It is not urgent, so there is no particular rush to get to it.'
      : fails.length
        ? ' Some matter more than others, and there is no need to do it all at once.'
        : ' None of it is urgent, so you can take these in your own time.';

  const pointer =
    problems.length > 1
      ? ' The list below is in order, with whatever costs you most sitting at the top.'
      : '';

  return `${lead}${theme}${weight}${pointer}`;
}

/**
 * The opening paragraph.
 *
 * Composed by rule from the findings, in severity order, so it can never
 * describe a problem the audit didn't find. It names the single biggest thing
 * standing in the way and what that costs — because the one thing a busy owner
 * reads is the first two sentences.
 *
 * ⚠️ The cascade order is load-bearing and every clause names a real finding.
 * These were shortened to bring the whole view under grade 7 — one idea per
 * sentence, dashes and semicolons broken into full stops — and NO CLAIM
 * CHANGED. Shorten further only the same way.
 */
/**
 * What to open the report with, about THIS business.
 *
 * ⚠️ THE TRADE IS ONLY PASSED WHEN WE DID NOT GUESS IT. Site.profileSource
 * distinguishes 'schema' and 'manual' — read off their site, or typed by them —
 * from 'inferred', which is a model filling in a blank. Printing "as a roofing
 * contractor" over an inference states our guess as their fact, in the first
 * line of the document they trust most. The caller decides; this only formats
 * what it is handed.
 *
 * ⚠️ AND `named`/`checked` ARE OMITTED, NOT ZEROED, WHEN NOTHING HAS RUN. An
 * account with no checks has no result. "AI named you in 0 answers" is a
 * measurement nobody took.
 */
export type VerdictContext = {
  siteName?: string;
  /** Only when profileSource is 'schema' or 'manual'. */
  trade?: string;
  named?: number;
  checked?: number;
};

/**
 * "Can AI read your site?", as a paragraph rather than a list.
 *
 * ⚠️ THIS EXISTS BECAUSE JOINING STANDALONE SENTENCES IS NOT PROSE. The caller
 * used to do `blockers.map(plainFor).join(' ')`, which produced five unconnected
 * declaratives and said "allowed to read your site" twice:
 *
 *   "The big AI assistants are allowed to read your site. Google is allowed to
 *    read your site. AI can read your pages. The words are in the page itself…"
 *
 * Each of those is right on its own — that is what a PLAIN entry is for, beside
 * a status mark in the technical view. Read one after another they are a list
 * with the bullets taken out.
 *
 * ⚠️ AND IT LIVES HERE, NOT IN THE COMPONENT. audit-summary.tsx carries the rule
 * that plain.ts writes these words, because a sentence composed in the JSX is a
 * second voice describing the same measurement and free to drift from the one
 * the technical view shows. Composing it here keeps one voice.
 *
 * The four checks are the same four verdict() cascades over, in the same
 * severity order, grouped into the two questions a reader actually has: can
 * they get in, and is there anything to read when they do.
 */
export function readability(report: AuditReport): string {
  const all = report.pillars.flatMap((p) => p.findings);
  const at = (id: string) => all.find((f) => f.id === id);
  const ok = (id: string) => at(id)?.status === 'pass';
  const present = (id: string) => at(id) !== undefined;

  const blockers = ['crawlers', 'googlebot', 'raw-html', 'noindex']
    .map(at)
    .filter((f): f is Finding => Boolean(f));

  /* Nothing to report on. Not a pass — we did not run these. */
  if (blockers.length === 0) {
    const n = report.crawled.length;
    return `We read ${n} ${n === 1 ? 'page' : 'pages'} on your site.`;
  }

  const broken = blockers.filter((f) => f.status === 'fail' || f.status === 'warn');

  /*
    Something is in the way. The PLAIN entries for these already read as prose —
    two or three sentences each — so they carry the detail, and all this adds is
    the one-word answer to the question in the heading.
  */
  if (broken.length > 0) {
    const lead = broken.some((f) => f.status === 'fail') ? 'Not properly, no.' : 'Mostly, but not cleanly.';
    return `${lead} ${broken.map(plainFor).join(' ')}`;
  }

  /*
    Everything passed, and this is the case the old join read worst on. Built as
    two sentences on the two questions rather than one per check, so the answer
    reads like an answer.
  */
  const getIn =
    present('googlebot') && ok('googlebot')
      ? 'The AI assistants can reach your pages, and so can Google.'
      : 'The AI assistants can reach your pages.';

  const toRead: string[] = [];
  if (ok('raw-html')) {
    toRead.push(
      'your words sit in the page itself, rather than being drawn in afterwards by code they can’t run',
    );
  }
  if (present('noindex') && ok('noindex')) {
    toRead.push('nothing is quietly asking search engines to skip you');
  }

  const found =
    toRead.length === 2
      ? `When they do, ${toRead[0]}, and ${toRead[1]}.`
      : toRead.length === 1
        ? `When they do, ${toRead[0]}.`
        : '';

  return `Yes, and that isn’t something to take for granted. ${getIn}${found ? ` ${found}` : ''}`;
}

export function verdict(report: AuditReport, context: VerdictContext = {}): string {
  const all = report.pillars.flatMap((p) => p.findings);
  const at = (id: string) => all.find((f) => f.id === id);
  const failing = (id: string) => at(id)?.status === 'fail';
  const shaky = (id: string) => at(id)?.status === 'fail' || at(id)?.status === 'warn';

  const pages = report.crawled.length;
  /* "Letsroof" when we know the name, "your site" when we don't. Used as the
     subject of a sentence, so it never carries a possessive of its own. */
  const site = context.siteName ?? 'your site';
  /* ⚠️ ONLY WHEN WE DIDN'T GUESS IT — the caller passes `trade` for a
     profileSource of 'schema' or 'manual' and withholds it for 'inferred'.
     Woven into the opening clause now rather than standing as its own
     sentence, but the condition is unchanged: never state a guess as a fact. */
  const forA = context.trade ? `for a ${context.trade.toLowerCase()}, ` : '';
  const read = `We read ${pages} ${pages === 1 ? 'page' : 'pages'} the way an AI assistant would`;

  /*
    The citation figures, said with what they mean.

    ⚠️ NO CAUSAL CLAIM. A site can be named while its own pages are unreadable —
    assistants cite directories and reviews too — and we have not measured where
    a mention came from. So this states the count and its plain significance and
    stops there.
  */
  const checked = context.checked ?? 0;
  const named = context.named ?? 0;
  const mentions =
    checked > 0
      ? named > 0
        ? ` You came up in ${named} of the ${checked} questions we asked, so you’re already showing up.`
        : ` None of the ${checked} questions we asked have brought you up yet.`
      : '';

  /*
    ⚠️ THE FOUR CRISIS BRANCHES DELIBERATELY OMIT `mentions`.

    Each one says in its own words that nothing else counts while the blocker is
    switched on. Following that with a citation count argues with it inside one
    paragraph. The figure is not lost: VisibilityLine reports it further down
    this same page — see components/dashboard/audit-extras.tsx.
  */

  if (failing('crawlers')) {
    return `Right now nothing you publish can be quoted, and it comes down to a single setting. ${site} is telling the AI assistants not to read it, so they turn around at the door. ${read}, and none of that work can reach them until this changes. It’s a two-minute fix, and it’s the only one worth doing first.`;
  }

  /* ⚠️ GOOGLEBOT GETS ITS OWN BRANCH, NOT THE CRAWLERS ONE. These shared a
     branch, which read "your site turns them away at the door" for a site that
     lets every AI assistant in and blocks only Google — while part 1 of the
     report, directly below, correctly said the assistants were allowed. Same
     severity, different fact, so it needs its own words. */
  if (failing('googlebot')) {
    return `The AI assistants can read ${site}, but Google can’t. One setting turns Google away, and that costs you the ordinary search results as well as the AI answers sitting above them. ${read}, and everything else about them looks reachable. It’s a two-minute fix, and it’s the one to do first.`;
  }

  if (failing('raw-html')) {
    return `As far as an AI assistant is concerned, ${site} is a blank page. Your site builds its content in the visitor’s browser, and assistants don’t wait around for that, so every one of the ${pages} ${pages === 1 ? 'page' : 'pages'} we read came back with nothing on it. Fix that and the rest of this report starts counting.`;
  }

  if (failing('noindex')) {
    return `One setting is quietly asking search engines to leave ${site} out altogether, and while it’s switched on very little else matters. ${read}, and this stands in front of all of them. Turn it off first, then work down the list below.`;
  }

  if (failing('qa-markup') && failing('question-headings')) {
    return `AI can read ${site} perfectly well — it just can’t find an answer to quote. Nothing on the site is set out as a question with a reply underneath, and that’s the shape an assistant looks for first. So when a customer asks about what you do, there’s nothing to match, and it names someone else.${mentions} This is the gap that costs you most, and it’s the one we’re built to close.`;
  }

  if (failing('org-schema')) {
    return `AI can read ${site}, but nothing on it says which business these answers belong to. So an assistant can repeat what you wrote and credit someone else — you do the work, and a competitor gets the name check.${mentions} It takes about fifteen minutes to fix, and it’s worth doing first.`;
  }

  if (shaky('qa-markup') || shaky('answer-first')) {
    return `The foundations are solid — assistants can reach ${site} and read it fine. What’s missing is the shape. Your answers aren’t set out as a question with the reply right under it, and that’s the form an assistant quotes.${mentions} ${read}, and it’s the same story on most of them.`;
  }

  if (report.score >= 85) {
    return `Good news — ${forA}${site} is in good shape. ${read}. It can get in, work out whose site it is, and find its way around.${mentions} From here it’s about depth: answer more of what your customers ask, and answer it better than anyone else nearby.`;
  }

  return `Nothing on ${site} is badly broken. There are just several small things, each costing you a little. ${read}, and the list below is in the order worth working through.${mentions} Start at the top — the first two or three make most of the difference.`;
}

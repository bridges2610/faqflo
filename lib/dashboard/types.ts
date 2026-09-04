/**
 * Dashboard data model.
 *
 * Written to map onto Postgres tables rather than onto the current localStorage
 * store: every row carries its own id, every child row carries the id of what
 * owns it, and timestamps are ISO strings. When Supabase lands, these types
 * become the row types and nothing in the components has to change.
 *
 * Tone and Language are imported rather than redeclared — the dashboard may
 * only offer what the API will actually accept, and lib/faq.ts is where that's
 * decided.
 */

import type { AuditReport } from '@/lib/audit/types';
import type { SourceKind } from './platforms';
import type { Language, Tone } from '@/lib/faq';

/**
 * Which plan the account is on.
 *
 * ⚠️ A LADDER NOW, WHICH IT DELIBERATELY WAS NOT BEFORE. This type used to be
 * `'none' | 'stay_cited'` with a warning that flattening the two products into
 * one enum "would make a Get Cited purchase for one site silently unlock every
 * other site the customer owns" — true, because Get Cited belonged to a SITE
 * and Stay Cited to the ACCOUNT. Both are retired. There is one product, it
 * belongs to the account, and a ladder is now the honest shape.
 */
export type PlanId = 'free' | 'pro';

export type User = {
  id: string;
  name: string;
  email: string;
  plan: PlanId;
  /** When the current Pro subscription started; null on free. */
  planSince: string | null;
  /**
   * When the account was made.
   *
   * Not cosmetic: it anchors the free tier's lifetime check allowance, because
   * a period that never resets still needs somewhere to start counting from.
   * See trackingPeriod() in lib/dashboard/plans.ts.
   */
  createdAt: string | null;
  /**
   * What the model has already written for this account, ever.
   *
   * ⚠️ ONLY MEANINGFUL ON FREE, AND ONLY FOR DISPLAY. Pro's article budget is
   * monthly and counted from rows; these are the free tier's lifetime spend,
   * used so the generator can say what is left instead of offering a control
   * the server will refuse. The numbers the customer is actually held to are
   * claimed server-side — see claim_free_generation() in 0021.
   */
  freeArticlesUsed: number;
  /** Generation RUNS spent in the Answers tab. An article's own FAQs are not counted. */
  freeFaqSetsUsed: number;
};

export type Site = {
  id: string;
  name: string;
  /** Bare host, no scheme and no trailing slash. */
  domain: string;
  createdAt: string;
  /**
   * When the next automatic weekly check is due. Null when nothing is scheduled.
   *
   * ⚠️ A CURSOR, NOT A SETTING. The cron moves it forward a week each time it
   * fires; upgrading sets it and downgrading clears it. It is service-role only
   * for the obvious reason — a browser that could write it could set it to now()
   * in a loop and bill us for three engines every sweep.
   */
  nextCheckAt: string | null;
  /** Latest stored audit for this site, if one has been run. */
  lastAudit: SiteAudit | null;

  /**
   * What the business does and where — "Roofing contractor", "Rockland County, NY".
   *
   * Both null until something fills them: the audit reads them from the site's
   * own markup, an LLM infers them from the homepage when there is none, and
   * the customer can correct either. Content and Discover are both written
   * against a category and an area, and until now the copy promised that while
   * nothing supplied it.
   */
  industry: string | null;
  location: string | null;
  /**
   * How we came to believe the two fields above.
   *
   * Kept because they are not equally trustworthy and the UI has to say which
   * one it used — but mostly because `manual` is a promise: once a customer has
   * corrected us, no later audit or inference may overwrite their answer.
   */
  profileSource: 'schema' | 'inferred' | 'manual' | null;
  /**
   * Which country the answer engines are asked from. Null = no location sent.
   *
   * ⚠️ Applies to ChatGPT and Perplexity only — Gemini rejects a location, so
   * its results are never labelled with this. See lib/tracking/gemini.ts.
   */
  country: string | null;
};

/**
 * A set of answers bound to one page of the customer's site.
 *
 * Groups exist because a site has more than one page worth of questions: the
 * ones that belong on a service page are not the ones that belong on pricing.
 * Each group is exported, pasted and tracked separately, which is what lets the
 * schema point at the page the answers actually live on and lets the stale
 * nudge say which page needs re-pasting.
 */
export type FaqGroup = {
  id: string;
  siteId: string;
  /** What the customer calls it: "Service page". */
  name: string;
  /**
   * Path on the site, leading slash, no origin — "/services".
   *
   * A path rather than a full URL on purpose: the site already owns the domain,
   * and storing an absolute URL here would let the two disagree. The export
   * would then emit schema pointing at a domain the customer doesn't own.
   *
   * ⚠️ NULL UNTIL THE OWNER SAYS, AND THAT IS WHY IT IS NULLABLE. A set is
   * created the moment its answers are written, long before anyone has decided
   * which page it goes on. Minting a plausible slug would make the schema
   * assert that page exists on their site — the exact inversion of what this
   * field is for. Null means "not placed yet": the block still copies, and
   * buildSchemaJson() omits @id and url rather than guessing, the same rule
   * buildArticleSchemaJson() follows for an article.
   */
  path: string | null;
  /** Ordering on the Answers page. */
  position: number;
  createdAt: string;
  /** When this group's export was last marked as pasted onto the live page. */
  publishedAt: string | null;
  /**
   * Fingerprint of the answers at the moment they were pasted. Comparing it
   * with the current set is what powers the "your live copy is out of date"
   * nudge — the content is re-pasted by hand, so drift is expected and has to
   * be visible rather than assumed away.
   */
  publishedHash: string | null;
};

/**
 * The last audit run for a site.
 *
 * The full report rather than a summary: the Audit page should show what it
 * found when you come back to it, and the Overview's score tile should be the
 * same number that report arrived at — not a copy that can drift from it.
 */
export type SiteAudit = AuditReport;

export type FaqStatus = 'published' | 'draft';

export type FaqEntry = {
  id: string;
  /** The group owns the answer; the group knows its site. */
  groupId: string;
  question: string;
  answer: string;
  /** Only published entries reach the export and the schema. */
  status: FaqStatus;
  /** Ordering WITHIN the group — reordering swaps two positions rather than
      relying on array index, which wouldn't survive a real query's ORDER BY. */
  position: number;
  source: 'generated' | 'manual' | 'discovered';
  /**
   * What the set this came from is about — "Roof replacement costs".
   *
   * ⚠️ A LABEL FOR ONE GENERATION RUN, NOT A CATEGORY SOMEBODY PICKS. The model
   * names each batch and every answer in that batch carries the same string,
   * which is what lets the Answers list show one row per topic.
   *
   * Optional because every row written before the column existed has none, and
   * because a hand-written answer never had a batch. The list buckets those two
   * cases separately — see the note in answers-workspace.tsx.
   */
  topic?: string;
  tone: Tone;
  language: Language;
  createdAt: string;
  updatedAt: string;
};

/**
 * A question people put to AI, surfaced by Discover.
 *
 * ⚠️ `volume` was required, was described as "rough monthly ask volume across
 * the engines we sample", and was rendered as "About 480 asks a month". No such
 * measurement exists anywhere in this product — there is no keyword provider and
 * no engine sampling — and the only values it ever held came from a hand-written
 * demo fixture. It is optional now, nothing writes it, and nothing renders it.
 *
 * It is kept rather than deleted only so a stored snapshot from before this
 * change still parses. If a real volume source is ever wired up, make it
 * required again in the same commit that starts populating it.
 */
export type DiscoveredQuestion = {
  id: string;
  siteId: string;
  question: string;
  /** @deprecated Never measured. See the note above. Do not render. */
  volume?: number;
  /** One sentence on why answering this would help this business get cited. */
  why?: string;
  /** What the asker is after — pricing, service, trust, logistics, problem. */
  intent?: string;
  /** Whether an existing published answer already covers it. */
  covered: boolean;
  /**
   * The owner said they are never answering this one.
   *
   * ⚠️ NOT A KIND OF `covered`, AND MERGING THE TWO WOULD LIE TWICE. `covered`
   * means the site answers it — it feeds the "x of y answered" count and the
   * coverage recheck. Dismissed means the opposite: nobody is going to answer
   * it, and it should stop being suggested. Folding it into `covered` would
   * inflate the answered figure and let recheckCoverage() un-dismiss it.
   *
   * ⚠️ IT MUST SURVIVE A DISCOVER RE-RUN. addQuestions() in 'replace' mode
   * keeps only covered and manual rows; a dismissed one dropped there comes
   * straight back on the next run, and the Ignore button looks broken. The
   * keep-predicate there names this field for that reason.
   *
   * Optional because rows written before this column existed have no value, and
   * absent means "not dismissed" — which is true of every one of them.
   */
  dismissed?: boolean;
  /**
   * Who put this question on the list.
   *
   * ⚠️ LOAD-BEARING FOR SURVIVAL, NOT DECORATION. A Discover re-run replaces
   * the uncovered questions — right for a model's suggestions, which is what a
   * re-run produces a better version of, and wrong for something a person
   * typed. addQuestions() keeps `manual` rows through a replace for that reason.
   *
   * Optional because rows already in customers' localStorage predate it, and
   * absent means 'discovered' — those are all model-generated, so the default
   * is the truth rather than a guess.
   */
  source?: 'discovered' | 'manual';
  /**
   * Ordering on the AI Mentions page.
   *
   * ⚠️ A VALUE, BECAUSE THE ORDER USED TO BE AN ACCIDENT. The list was read
   * `.order('added_at')` — the order the model happened to return them in. The
   * owner drags them now, so it has to be stored. Same swap-two-positions idiom
   * as FaqEntry.position; 0015 added the column and backfilled it from
   * added_at so nobody's existing list reshuffled.
   */
  position: number;
  addedAt: string;
};

/**
 * The engines we ask, and the only ones the UI may name.
 *
 * ⚠️ THESE ARE APIs, NOT THE CONSUMER APPS, AND THE UI SAYS SO.
 *
 * "ChatGPT" here is the OpenAI API with its web search tool; "Gemini" is the
 * Gemini API with Google Search grounding. Neither is byte-identical to what a
 * person sees typing into chatgpt.com or gemini.google.com — different system
 * prompt, different retrieval, no personalisation. They are the closest honest
 * proxy available, and calling them the app would be the same overclaim
 * components/marketing/pricing-teaser.tsx already stripped out of our own
 * pricing copy.
 *
 * ⚠️ WAS 'Google AIO', AND THAT WAS NOT QUERYABLE. Google AI Overviews has no
 * API at all — tools that report on it collect Google result pages at scale.
 * Listing an engine we cannot ask would have made the third line of every chart
 * permanently zero, which reads as "you are never cited there" rather than "we
 * never looked". Gemini can actually be asked, so it is what we name.
 *
 * These exact strings key the chart's colour map (components/dashboard/
 * citation-chart.tsx) and the seed fixture. Renaming one means renaming it in
 * all three places.
 */
export const ENGINES = ['ChatGPT', 'Perplexity', 'Gemini'] as const;
export type Engine = (typeof ENGINES)[number];

/**
 * One check of one question against one engine.
 *
 * `cited` means our customer's domain appeared as a source in the answer.
 * `mentioned` means the business was named without a link — worth knowing and
 * worth separating, because they're different outcomes.
 */
export type CitationCheck = {
  id: string;
  siteId: string;
  question: string;
  engine: Engine;
  outcome: 'cited' | 'mentioned' | 'absent';
  /** Who got cited instead, when we weren't. */
  citedInstead: string | null;
  /**
   * What the engine actually said, capped at MAX_EXCERPT_CHARS below.
   *
   * ⚠️ THE EVIDENCE, AND THE ANSWER TO THE ONLY QUESTION THIS PAGE REALLY GETS.
   * "Why does it say I wasn't cited?" cannot be answered by a count. It was
   * stored from the first run (see the column comment in 0006) and read by
   * nothing for just as long — the outcome was shown and the reason for it was
   * not. Null on older rows, which renders as "not stored" rather than blank.
   */
  excerpt: string | null;
  /** Every source that answer cited, in the engine's own ranking. */
  sources: string[];
  checkedAt: string;
};

/**
 * How much of an answer we keep as evidence.
 *
 * Enough to see a mention in context; not the whole answer. This table gets one
 * row per prompt per engine per run, and full answers would quickly make it the
 * largest thing in the database — see the column comment in migration 0006.
 *
 * ⚠️ Lives in this client-safe module, not in lib/tracking/types.ts, because
 * BOTH sides need it: the classifier truncates with it on the server, and the
 * Results page needs it to tell a truncated excerpt from an engine that simply
 * stopped talking. lib/tracking/types.ts is `server-only`, so a component
 * importing it from there would pull server code into the browser bundle —
 * and copying the number instead is how the two quietly stop agreeing.
 */
export const MAX_EXCERPT_CHARS = 600;

/** A day's citation counts per engine — the shape of a daily rollup row. */
export type CitationDay = {
  date: string;
  /** Questions where the customer's domain was a source, per engine. */
  byEngine: Record<Engine, number>;
  /** Questions checked that day, so a rate can be computed honestly. */
  checked: number;
  /** That day's totals, so a change between run-days can be shown without
   *  re-deriving them from `byEngine` (which counts citations only). */
  cited: number;
  mentioned: number;
};

/**
 * A rival the customer NAMED.
 *
 * ⚠️ NOT CompetitorShare, WHICH IS BELOW AND IS THE OPPOSITE KIND OF THING.
 * That one is derived — every domain the engines actually cited, counted from
 * the checks, with no rows of its own precisely because nobody chose its
 * contents. This one is a short list the owner keeps: these are the businesses
 * I compete with, tell me how often AI names them.
 *
 * ⚠️ NO CITATION COUNT ON IT. How often a domain was cited is known only to the
 * measurements; storing a copy here would let the two drift. The page joins
 * them by `domain` at read time, which is why that field is a bare host —
 * matching Site.domain and the keys CompetitorShare uses.
 *
 * ⚠️ AND A WATCHED RIVAL WITH NO CITATIONS READS AS ZERO, NEVER AS BLANK. The
 * absence is the finding the owner asked us to watch for.
 */
export type Competitor = {
  id: string;
  siteId: string;
  /** What the owner calls them: "Summit Roofing". */
  name: string;
  /** Bare host, no scheme and no trailing slash. */
  domain: string;
  /** Ordering on the Competitors page. */
  position: number;
  createdAt: string;
};

/**
 * A fix the customer says they have done.
 *
 * ⚠️ A CLAIM, NOT A MEASUREMENT, AND THE TWO MUST NOT BLUR. The audit decides
 * whether a fix landed; this records that somebody ticked a box. `reportCheckedAt`
 * scopes the tick to the audit that raised it, so a newer scan clears the slate
 * rather than letting the report show "done" for something still failing.
 */
export type ActionTick = {
  id: string;
  siteId: string;
  /** The RECIPES constant from lib/audit/actions.ts — stable across runs. */
  actionId: string;
  reportCheckedAt: string;
  createdAt: string;
};

/**
 * Is this tick stamped with the report on screen?
 *
 * ⚠️ COMPARE THE INSTANT, NEVER THE STRING. The two stamps reach us in
 * different spellings of the same moment: `report.checkedAt` is a JSONB string
 * written by `new Date().toISOString()`, so it ends in `Z`, while a tick's
 * `report_checked_at` is a timestamptz column, which Postgres renders as
 * `+00:00`. `===` on those is false for the same millisecond.
 *
 * That is not a cosmetic bug. The tick held in memory keeps the `Z` form, so
 * the box ticks and stays ticked — until the page reloads and the value comes
 * back from Postgres, at which point every tick silently fails this gate and
 * the customer's progress looks discarded.
 */
export function sameReport(tickStamp: string, reportCheckedAt: string): boolean {
  const a = Date.parse(tickStamp);
  const b = Date.parse(reportCheckedAt);
  // An unparseable stamp is not a match. Falling back to === would resurrect
  // exactly the bug this exists to close.
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

export type CompetitorShare = {
  domain: string;
  /**
   * Times this domain appeared as a source across the checks we ran.
   *
   * ⚠️ THIS COUNTS EVERY SOURCE, NOT ONE PER CHECK. It used to be built from
   * `cited_instead` — the single domain that took the click when we didn't —
   * which threw away the rest of each answer's source list: 45 data points out
   * of 296 on a real site. An engine citing six publishers is six facts about
   * who is winning, not one.
   */
  citations: number;
  isYou: boolean;

  /**
   * A business like theirs, or a platform they can't compete with.
   *
   * ⚠️ FROM AN EXPLICIT LIST, AND UNKNOWN MEANS 'business'. See
   * lib/dashboard/platforms.ts for why there is no cleverness here: a directory
   * shown among rivals is untidy, a rival hidden among directories defeats the
   * page. Nothing is dropped on the strength of this — it groups, it does not
   * filter.
   */
  kind: SourceKind;

  /**
   * This domain's share of every source cited, 0–100.
   *
   * The denominator is `sourceAppearances.total`, so the page can print the
   * ratio without a second definition of what a citation is.
   */
  share: number;

  /** Which engines cited it, in ENGINES order. */
  engines: Engine[];

  /**
   * The questions it was cited on, most-cited first.
   *
   * ⚠️ "CITED ON", NOT "BEAT YOU ON". An answer can cite this domain and name
   * the customer in the same breath, so any surface calling this "what they
   * beat you on" would be claiming something nobody measured.
   */
  topQuestions: string[];

  /**
   * Movement between the two most recent check dates.
   *
   * ⚠️ `null` MEANS THERE WAS NOTHING TO COMPARE, AND IT IS NOT 'steady'. An
   * account with one run has no trend, and drawing a flat arrow for it would
   * report an absence of data as a measurement of no change — the same rule
   * PillarResult.score follows for a pillar nobody could score.
   */
  trend: 'up' | 'down' | 'steady' | 'new' | null;
};

/**
 * One of our own URLs, and how often an engine cited it.
 *
 * The actionable half of being cited: not "you were cited five times" but
 * "this page earned them". Full URLs are stored on every check, so this costs
 * nothing to derive.
 */
export type CitedPage = {
  url: string;
  citations: number;
};

/** How one engine answered, across every check in the window. */
export type EngineBreakdown = {
  engine: Engine;
  cited: number;
  mentioned: number;
  absent: number;
  /** Checks run against this engine — the denominator, never assumed equal. */
  checked: number;
};

export type SiteTracking = {
  siteId: string;
  daily: CitationDay[];
  latest: CitationCheck[];
  competitors: CompetitorShare[];
  /** Our own cited URLs, most-cited first. */
  citedPages: CitedPage[];
  /** Per-engine outcome counts, in ENGINES order so the UI reads consistently. */
  byEngine: EngineBreakdown[];
  /**
   * Source appearances in the window: ours, and everyone's.
   *
   * Kept as counts rather than a precomputed percentage because share of voice
   * is meaningless without its denominator — see the tiles, which print both.
   */
  sourceAppearances: { ours: number; total: number };
  /**
   * The tracking budget, in the unit the customer actually buys.
   *
   * A PROMPT is one question we watch. It is deliberately independent of the
   * page budget: pages are scanned, prompts are asked, and the two scale
   * differently. Nothing here may ever be computed from a page count.
   *
   * `checksUsed` is the cost side — engine calls actually spent — shown so the
   * price of the allowance is visible, not so anyone has to think in it.
   */
  promptsTracked: number;
  promptCap: number;
  /** How much of promptCap may be hand-written. Null falls back to the wider plan. */
  manualCap: number;
  /** How many times each prompt is asked per period. */
  runsPerPeriod: number;
  /** The enforced ceiling, so the meter stops recomputing it from three parts. */
  checksCap: number;
  checksUsed: number;
  /**
   * When the allowance refills. NULL MEANS NEVER, which is the free tier.
   *
   * ⚠️ Null is a real state, not a missing value. Free buys one run metered over
   * a period with no end, so "resets on the 3rd" would be a date that never
   * arrives. Anything rendering this must say "one check" rather than print a
   * fallback date.
   */
  periodResetsAt: string | null;

  /** Which plan's rules these numbers came from. */
  planId: PlanId;
  /**
   * 'once' — the onboarding run, no button. 'weekly' — scheduled and on demand.
   *
   * The Results page reads this to decide whether to show a Run button or an
   * explanation of why there isn't one.
   */
  schedule: 'once' | 'weekly';
  /** When the next automatic check is due. Null on free — there isn't one. */
  nextCheckAt: string | null;
};

/**
 * A page the site ought to have, and whether it does.
 *
 * `slugs` is what makes this checkable without a second model call: the LLM
 * proposes the page set for the industry AND how to recognise each one, so
 * matching it against the crawl afterwards is ordinary string work. Without
 * them we'd be asking a model the same question on every render and getting a
 * slightly different answer each time.
 */
export type MustHavePage = {
  /** Stable key — 'about', 'services', 'pricing'. */
  role: string;
  /** What the customer calls it: "Services". */
  label: string;
  /** Why this industry needs it. Shown when the page is missing. */
  why: string;
  /** URL-path or title fragments that identify the page. */
  slugs: string[];
};

/** An article worth writing, and the reason it's worth writing. */
export type ArticleTopic = {
  title: string;
  /** The angle to take — what makes this piece different from the obvious one. */
  angle: string;
  /** What someone would type into a search box. */
  primaryKeyword: string;
  /** What someone would ask an assistant out loud. The AEO half. */
  aeoQuestion: string;
  why: string;
};

/**
 * The generated plan for one site. One per site, replaced on regenerate.
 *
 * Stored rather than derived because it costs a model call: without this the
 * page would bill on every visit and show a different answer each time, which
 * is not a plan so much as a slot machine.
 */
export type ContentPlan = {
  siteId: string;
  /** Resolved at generation time — what the plan was actually written for. */
  industry: string;
  location: string | null;
  mustHave: MustHavePage[];
  topics: ArticleTopic[];
  /**
   * Titles of suggestions the owner has waved away.
   *
   * ⚠️ A LIST OF TITLES, NOT A FLAG ON THE TOPIC, AND NO MIGRATION EITHER WAY.
   * The whole plan is one jsonb column (content_plans.plan), so this rides
   * along inside it — but a flag on ArticleTopic would also have to survive the
   * model's schema, which returns topics with no such field. Keeping the
   * decision beside the topics rather than inside them means the generated
   * shape stays exactly what the model produces.
   *
   * ⚠️ AND IT IS DELIBERATELY CLEARED BY A REGENERATE. Refreshing replaces the
   * suggestions wholesale; carrying old titles forward would silently hide
   * brand-new topics that happened to be named the same thing.
   *
   * Optional because every plan stored before this has none.
   */
  hiddenTopics?: string[];
  generatedAt: string;
};

/**
 * One `<h2>` and the prose under it.
 *
 * ⚠️ STRUCTURE, NOT MARKDOWN, AND THAT IS THE WHOLE REASON THIS TYPE EXISTS.
 * The ask was "use proper headings like H2". A markdown blob would put that
 * promise in the model's hands and then need a parser to make HTML out of it —
 * a parser handling untrusted model output, which is the thing
 * lib/dashboard/answer-markdown.ts exists to keep small and auditable. A schema
 * with a heading field cannot come back without headings, and the HTML builder
 * becomes a mapping through escapeHtml() with nothing to interpret.
 *
 * `body` may hold blank-line-separated paragraphs; the builder splits on them.
 */
export type ArticleSection = { heading: string; body: string };

/**
 * A question and answer that belongs to ONE article.
 *
 * ⚠️ NOT A FaqEntry, AND THE DIFFERENCE IS OWNERSHIP RATHER THAN SHAPE. A
 * FaqEntry belongs to a group — a page of the customer's site — has a publish
 * status, a position among its siblings, and reaches the site through that
 * group's paste block. These belong to the article: they are written from its
 * text, they sit at the foot of it, they go out inside its paste block, and
 * they are deleted with it. Storing them as FaqEntry rows would have put them
 * in the Answers list, which is the thing this change exists to stop.
 *
 * No status field on purpose: an article is a draft the owner is editing, and
 * everything in it goes when they copy it. See the note on publishable() in
 * export.ts.
 */
export type ArticleFaq = { q: string; a: string };

/**
 * A generated article, kept.
 *
 * ⚠️ NOT AN ArticleTopic. That one is a SUGGESTION — a title and an angle the
 * content plan proposes. This is the finished piece. They sit in the same file
 * and the names are one letter apart, so: topics are what to write, Articles
 * are what was written.
 *
 * Stored rather than handed over and forgotten, for the same reason ContentPlan
 * is: it costs a real model call. It is also what the monthly allowance is
 * counted from — a cap on something nobody keeps is a cap nobody can see.
 */
export type Article = {
  id: string;
  siteId: string;
  title: string;
  /** The opening, before the first heading. */
  intro: string;
  sections: ArticleSection[];
  /** Questions and answers written from this article. See ArticleFaq. */
  faqs: ArticleFaq[];
  /** What the owner typed as a brief, kept so a rewrite can reuse it. */
  brief: string | null;
  /**
   * ⚠️ MEASURED AFTER THE FACT, NEVER TAKEN FROM THE MODEL'S WORD. A language
   * model asked how many words it wrote will give a number, and it will be
   * wrong. countWords() in lib/article.ts is the only thing that sets this.
   */
  wordCount: number;
  createdAt: string;
  updatedAt: string;
};

/** Everything the app keeps for one account. One row per key, in DB terms. */
export type DashboardData = {
  user: User;
  sites: Site[];
  groups: FaqGroup[];
  faqs: FaqEntry[];
  questions: DiscoveredQuestion[];
  tracking: SiteTracking[];
  contentPlans: ContentPlan[];
  /** The rivals the customer named. Not the ones we measured — see Competitor. */
  competitors: Competitor[];
  /** Fixes ticked off the audit plan. See ActionTick. */
  actionTicks: ActionTick[];
  /** Articles written for this account. See Article. */
  articles: Article[];
};

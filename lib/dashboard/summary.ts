/*
  What the help panel is allowed to say, and about which page.

  ⚠️ CLIENT-SAFE ON PURPOSE, AND THE SPLIT IS THE HOUSE ONE. The facts are built
  in the browser from the snapshot the page is already rendering; the Anthropic
  call lives in lib/summary-generate.ts behind `server-only`. Same division as
  lib/questions.ts / lib/questions-generate.ts, and for the same reason its note
  gives: putting the SDK in a module a workspace imports pulls the whole SDK
  into the browser bundle.

  ⚠️ AND THE FACTS COME FROM THE BROWSER, WHICH IS DELIBERATE. The dashboard
  snapshot is assembled client-side (lib/dashboard/store.ts uses the browser
  Supabase client), so a server rebuilding these numbers would be a second
  implementation of every derivation — and the first time the two disagreed, the
  panel would explain "3 of 9" beside a screen reading "3 of 12". A summary that
  argues with the page it is summarising is worse than no summary.

  What is NOT taken from the browser: the plan, the allowance and the business
  name. Those are read from the profile and site rows server-side, because a
  client that tells the server which tier it is on is not authorization.
*/

import { matchMustHave } from '@/lib/content';
import type { Article, ContentPlan, FaqEntry, Site, SiteTracking } from './types';
import { ENGINES } from './types';

/* Stable keys, not route paths — a renamed URL must not orphan what was
   written about it. These are what page_summaries.page_key stores (0023). */
export type SummaryPageKey = 'home' | 'audit' | 'content' | 'competitors' | 'tracking';

/**
 * The pages the panel speaks about.
 *
 * ⚠️ THE FIVE NAV PAGES AND NOTHING ELSE. Plan, Sites, Help and Start are about
 * the account rather than the work, and the detail routes (one article, one
 * group) are already the thing itself rather than a screen that needs
 * interpreting. Adding one later is an entry here plus a builder below.
 */
export const SUMMARY_PAGES: {
  key: SummaryPageKey;
  href: string;
  label: string;
  /*
    ⚠️ WHAT THE SCREEN IS, AND IT IS NOT OPTIONAL. Without it a model handed an
    empty fact block invents the page's purpose from its name — measured: given
    only "No scan has run yet" and the label "your report", it confidently
    described the report as showing how AI answers questions about the business,
    which is a different screen entirely. The numbers are the only thing the
    model may not know; what the page is for is a fact we have, so we state it.
  */
  purpose: string;
}[] = [
  {
    key: 'home',
    href: '/dashboard',
    label: 'Home',
    purpose:
      'their dashboard home — the headline numbers from their latest check and a short list of what to do next',
  },
  {
    key: 'audit',
    href: '/dashboard/audit',
    label: 'your report',
    purpose:
      'the report on whether AI crawlers can actually read their website — a readability score out of 100, what is holding it back, and the fixes in order. It is about their own site, NOT about what AI says when asked about them',
  },
  {
    key: 'content',
    href: '/dashboard/faqs',
    label: 'Content',
    purpose:
      'what to publish — the pages their industry expects a business like theirs to have, the answers written for their site, and article topics worth writing',
  },
  {
    key: 'competitors',
    href: '/dashboard/competitors',
    label: 'Competitors',
    purpose:
      'which other domains the AI engines cited when asked their questions, and how often, next to how often their own domain was cited',
  },
  {
    key: 'tracking',
    href: '/dashboard/tracking',
    label: 'AI Mentions',
    purpose:
      'the result of putting their questions to ChatGPT, Perplexity and Gemini — who got linked, who got named without a link, and who got neither',
  },
];

/*
  ⚠️ LONGEST MATCH WINS, AND /dashboard IS WHY. Every dashboard route starts
  with it, so a plain `startsWith` scan in array order would answer 'home' for
  every page in the product. Sorting by descending href length means
  /dashboard/faqs is tested before /dashboard, and Home is left as what it
  actually is: the exact route, plus nothing.
*/
const BY_LENGTH = [...SUMMARY_PAGES].sort((a, b) => b.href.length - a.href.length);

export function summaryPageFor(pathname: string): (typeof SUMMARY_PAGES)[number] | null {
  if (pathname === '/dashboard') return SUMMARY_PAGES[0];
  return BY_LENGTH.find((page) => page.href !== '/dashboard' && pathname.startsWith(page.href)) ?? null;
}

/**
 * The numbers one summary is allowed to use.
 *
 * ⚠️ EVERY VALUE HERE IS ALREADY ON THE SCREEN, and the model gets nothing that
 * is not. `null` means not measured — which is never the same as zero, the rule
 * lib/dashboard/types.ts states for CompetitorShare.trend and this file inherits
 * whole. The prompt says so in words as well, because a model handed a null will
 * otherwise round it down to a confident nothing.
 */
export type SummaryFacts = {
  page: SummaryPageKey;
  /** Free accounts get one check, ever; Pro gets a weekly one. Changes the advice. */
  schedule: 'once' | 'weekly';
  scanned: boolean;
  lines: string[];
};

/* Small helpers. Kept local because they are about phrasing a fact block, not
   about the data — nothing else in the app wants them. */
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * What one summary is built from — the active site's own numbers.
 *
 * ⚠️ HANDED IN, NOT DUG OUT OF DashboardData, AND THE FIRST VERSION DID THE
 * SECOND. It read `data.tracking.find(...)`, and lib/dashboard/store.ts's
 * readFromDb() returns `tracking: []` — always. Citations are fetched
 * separately by the provider (loadTracking) into their own state, because they
 * need the plan's period window, so that array is empty on every account no
 * matter how many checks have run.
 *
 * The symptom was a panel calmly reporting "no checks have run" to a site with
 * 279 of them, while the audit and article counts beside it were correct —
 * which is the worst version of this bug, because it looks like a considered
 * answer rather than a missing field.
 *
 * These are exactly the values useDashboard() already computes for the screen
 * the reader is on, so the panel now describes the same objects the page
 * renders instead of assembling its own.
 */
export type SummarySources = {
  site: Site | null;
  tracking: SiteTracking | null;
  contentPlan: ContentPlan | null;
  faqs: FaqEntry[];
  articles: Article[];
};

/**
 * How many questions are being watched, and what the plan covers.
 *
 * ⚠️ TWO FACTS, NOT A RATIO, AND A REAL ACCOUNT IS WHY. An account that has been
 * running a while can hold more tracked prompts than its current cap — 44
 * against a cap of 25 on the site this was found on — so "44 of 25" is what the
 * screen shows and what this used to hand the model. It reasoned off it exactly
 * as written and advised the owner to close the gap "between the 44 questions
 * you're watching and the 25-question core set", which means nothing.
 *
 * Stated as two independent numbers, both true and neither dividing into the
 * other: the list is this long, and a run asks up to this many of them
 * (pickWatchList in lib/dashboard/questions.ts is what enforces the second).
 */
function watchLine(tracking: SiteTracking): string {
  return `Questions on their watch list: ${tracking.promptsTracked}. Each check asks up to ${tracking.promptCap} of them, which is what their plan covers.`;
}

/** "cited on 3 of 9 questions" per engine, in ENGINES order. */
function engineLines(tracking: SiteTracking | null): string[] {
  if (!tracking || tracking.byEngine.length === 0) return [];
  return ENGINES.map((engine) => {
    const row = tracking.byEngine.find((e) => e.engine === engine);
    if (!row || row.checked === 0) return `${engine}: not checked yet`;
    return `${engine}: linked to you on ${row.cited} of ${row.checked} questions asked, named without a link on ${row.mentioned}`;
  });
}

/**
 * Build the fact block for one page.
 *
 * Returns `scanned: false` when there is genuinely nothing measured yet. The
 * panel still writes something in that state — what the page is for and what
 * running a check would tell them — it just never dresses an empty account up
 * as a bad result.
 */
export function buildFacts(page: SummaryPageKey, sources: SummarySources): SummaryFacts {
  const { site, tracking, contentPlan: plan, faqs, articles } = sources;
  const audit = site?.lastAudit ?? null;
  const published = faqs.filter((f) => f.status === 'published').length;
  const schedule = tracking?.schedule ?? 'once';

  /*
    ⚠️ MEASURED FOR THIS SCREEN, NOT FOR THE ACCOUNT, AND THE FIRST VERSION GOT
    THIS WRONG. It was one flag for the whole account — an audit OR any watched
    question — so a site with tracking but no audit produced an audit fact block
    reading "no scan has run yet" underneath a prompt line telling the model a
    check HAD run. The model would have had to pick one, and it would have
    picked the encouraging one.

    Each screen answers for itself: has the thing THIS page displays been
    measured. Everything downstream of it — the empty-state sentence in the
    prompt, the advice — hangs on that being true per screen.
  */
  const scannedFor: Record<SummaryPageKey, boolean> = {
    home: Boolean(audit) || Boolean(tracking && tracking.promptsTracked > 0),
    audit: Boolean(audit),
    content: Boolean(plan),
    competitors: Boolean(tracking && tracking.competitors.length > 0),
    tracking: Boolean(tracking && tracking.promptsTracked > 0),
  };
  const scanned = scannedFor[page];

  const lines: string[] = [];

  if (site?.industry) lines.push(`Trade: ${site.industry}`);
  if (site?.location) lines.push(`Serving: ${site.location}`);

  if (page === 'home') {
    lines.push(
      audit
        ? `Readability score: ${audit.score} out of 100, from ${plural(audit.scoredCount, 'check')} across ${plural(audit.crawled.length, 'page')} read`
        : 'Readability score: no scan has run yet',
    );
    lines.push(tracking ? watchLine(tracking) : 'Questions being watched: none yet');
    lines.push(...engineLines(tracking));
    lines.push(
      faqs.length === 0
        ? 'Answers written for their site: none yet'
        : `Answers published to their site: ${published} of ${faqs.length} written`,
    );
    lines.push(`Articles written: ${articles.length}`);
  }

  if (page === 'audit') {
    if (!audit) {
      lines.push('No scan has run yet, so there is no report to explain.');
    } else {
      lines.push(`Score: ${audit.score} out of 100, from ${plural(audit.scoredCount, 'check')}`);
      lines.push(
        `Pages read: ${audit.crawled.length} of ${audit.discovered} found${audit.stoppedBecause === 'budget' ? ' (stopped at the plan page budget)' : ''}`,
      );
      for (const pillar of audit.pillars) {
        lines.push(
          pillar.score === null
            ? `${pillar.label}: nothing to score`
            : `${pillar.label}: ${pillar.score} out of 100`,
        );
      }
      const open = audit.actions.slice(0, 4);
      lines.push(
        open.length
          ? `Top fixes still open: ${open.map((a) => `"${a.what}" (${a.effort})`).join('; ')}`
          : 'No fixes are open.',
      );
    }
  }

  if (page === 'content') {
    if (!plan) {
      lines.push('No content plan has been generated yet.');
    } else {
      /*
        ⚠️ PRESENCE IS MATCHED, NOT STORED, AND IT NEEDS A FULL AUDIT. `pages` is
        optional on AuditReport — a quick run reads one page and records none —
        so an empty list means "we have not looked", not "the site has none of
        them". Reporting the second as the first would tell a customer their
        site is missing an About page we never went looking for.
      */
      const crawled = audit?.pages ?? [];
      if (crawled.length === 0) {
        lines.push(
          `Pages the plan expects: ${plan.mustHave.length}. Which ones the site already has has not been checked — that needs a full scan.`,
        );
      } else {
        const missing = matchMustHave(crawled, plan.mustHave).filter((m) => !m.page);
        lines.push(
          missing.length
            ? `Pages the site is missing: ${missing.map((p) => p.label).join(', ')}`
            : 'Every page the plan expects is present.',
        );
      }
      lines.push(`Article topics suggested: ${plan.topics.length}`);
      const next = plan.topics.slice(0, 3).map((t) => `"${t.title}"`);
      if (next.length) lines.push(`Next up: ${next.join(', ')}`);
    }
    lines.push(
      faqs.length === 0
        ? 'Answers written for their site: none yet'
        : `Answers published: ${published} of ${faqs.length} written`,
    );
    lines.push(`Articles written so far: ${articles.length}`);
  }

  if (page === 'competitors') {
    const rivals = (tracking?.competitors ?? []).filter((c) => !c.isYou).slice(0, 5);
    const you = tracking?.competitors.find((c) => c.isYou);
    if (!tracking || tracking.competitors.length === 0) {
      lines.push('No checks have run, so nobody has been measured yet.');
    } else {
      /* ⚠️ THE UNIT IS NAMED, for the reason the tracking page's version gives:
         an appearance count sitting next to a question count invites the model
         to divide one by the other. */
      lines.push(
        `Source appearances (how often a domain was cited, NOT how many questions were asked): their own domain ${you?.citations ?? tracking.sourceAppearances.ours}, all domains together ${tracking.sourceAppearances.total}`,
      );
      lines.push(
        rivals.length
          ? `Domains ahead of or near them: ${rivals.map((c) => `${c.domain} (${plural(c.citations, 'appearance')})`).join(', ')}`
          : 'No rival domains were cited.',
      );
    }
  }

  if (page === 'tracking') {
    if (!tracking || tracking.promptsTracked === 0) {
      lines.push('No questions are being watched yet.');
    } else {
      lines.push(watchLine(tracking));
      lines.push(...engineLines(tracking));
      const top = tracking.competitors.filter((c) => !c.isYou)[0];
      if (top) {
        /* ⚠️ THEIR OWN COUNT GOES WITH IT. Measured: given only "angi.com (4
           appearances)" the summary wrote "Angi shows up more than you do" —
           true here, but arrived at without the number that decides it, which
           is a guess that happened to land. Both sides or neither. */
        lines.push(
          `Source appearances (how often a domain was cited, NOT how many questions were asked): their own domain ${tracking.sourceAppearances.ours}, the most-cited rival ${top.domain} ${top.citations}, all domains together ${tracking.sourceAppearances.total}`,
        );
      }
      lines.push(
        schedule === 'weekly'
          ? `Checks run weekly. Used ${tracking.checksUsed} of ${tracking.checksCap} this period.`
          : 'Their plan runs one check rather than a weekly one, so there is no trend to read yet.',
      );
    }
  }

  return { page, schedule, scanned, lines: lines.filter(Boolean) };
}

/**
 * A stable fingerprint of the facts, so a stored summary can be replayed
 * instead of rewritten.
 *
 * ⚠️ NOT A SECURITY HASH AND NOT REQUIRED TO BE ONE. It answers "have the
 * numbers on this page moved since I wrote about them", where the cost of a
 * collision is one stale paragraph. djb2 over the joined lines is enough, it is
 * synchronous, and it works identically in both runtimes — crypto.subtle is
 * async and would push this into an effect for no benefit.
 */
export function factsHash(facts: SummaryFacts): string {
  const input = `${facts.page}|${facts.schedule}|${facts.scanned}|${facts.lines.join('|')}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/** Roughly a paragraph and a half. Interpolated into the prompt, never retyped. */
export const SUMMARY_MAX_WORDS = 130;

/**
 * The prompt.
 *
 * House shape, matching lib/article.ts:122 — role sentence, business block,
 * evidence block, then the hard rules. Second person to the model, business
 * named up front, an explicit fallback line wherever a field could be missing.
 *
 * ⚠️ THE VOICE BLOCK IS TONE AND THE HARD RULES ARE NOT. They sit next to each
 * other and read alike, and a request to "make it more casual" is a request to
 * edit the first one only. The hard rules are what stop the model inventing a
 * number, and live testing has already caught it doing exactly that twice —
 * once describing the wrong screen, once comparing two figures when it had been
 * given one. Loosen those and the panel starts making things up in Beau's
 * voice, which is worse than making them up in nobody's.
 *
 * ⚠️ THE ANTI-INVENTION CLAUSE IS THE LOAD-BEARING PART. Everything else here is
 * tone. lib/questions.ts:159 states the rule this follows — the model does not
 * know traffic, volume or rank, and neither do we, so it may not imply any of
 * them. The facts block below is the complete set of numbers that exist.
 */
export function buildSummaryPrompt(input: {
  businessName: string | null;
  domain: string;
  pageLabel: string;
  pagePurpose: string;
  facts: SummaryFacts;
}): string {
  const { businessName, domain, pageLabel, pagePurpose, facts } = input;

  /* ⚠️ GATED ON A REAL NAME, per lib/questions.ts:96-105. brand_name can be a
     domain echo, and "Here's how gikas-roofing-com is doing" is a sentence no
     human would write. Without one, address them by their trade instead. */
  const who = businessName ? `${businessName} (${domain})` : domain;

  return `You are Beau, writing a short note to a small business owner who is looking at one screen of their AI visibility dashboard. You built this product. You are talking to a customer, not writing marketing copy.

Business: ${who}
Screen they are looking at: ${pageLabel}
What that screen is: ${pagePurpose}

What this screen currently shows them — this is the complete set of numbers that exist:
${facts.lines.map((line) => `- ${line}`).join('\n')}

${
  facts.scanned
    ? 'They have had at least one check run, so talk about what actually happened.'
    : 'Nothing has been measured for them yet. Say what this screen will tell them once a check has run, and do not describe an empty account as a bad result.'
}

Write ${SUMMARY_MAX_WORDS} words or fewer, in two or three short paragraphs. Cover, in this order:
1. What this screen is showing them, in one sentence a busy person can take at a glance.
2. What their own numbers mean — good, bad, or too early to say.
3. The one thing worth doing next, and why it matters.

Hard rules:
- NEVER state a number that is not in the list above. No search volumes, no traffic estimates, no percentages you worked out yourself, no rankings, no "most businesses" comparisons. You do not know those and neither do we.
- Where a number is missing or says "not checked yet", say it has not been measured. Not measured is not zero.
- Every number above belongs to the unit named beside it. Do NOT combine two numbers from different lines into a ratio, a total or a percentage — questions watched, questions asked and source appearances are three different things that can share a value by coincidence.
- Stay under ${SUMMARY_MAX_WORDS} words. This is a small panel; going long is a failure, not thoroughness.
- Do not congratulate them on something the numbers do not show, and do not alarm them about something the numbers do not show.
- No headings, no bullet points, no markdown, no bold. Plain paragraphs only.
- Do not open with "This page" or "This screen shows". Start with what it means for them.

Voice — friendly, but composed:
- Warm and relaxed, the way you would explain this to a customer you like. Use contractions ("you're", "there's", "it's"). Write so a sixth-grader could follow it.
- Full sentences. No filler openers — do not start with "Right,", "So,", "Okay", "Well" or "Alright". No sentence fragments standing on their own.
- Address them as "you" ("your site", "your questions").
- First person where it is natural — you are Beau, you built this — but never claim to have personally looked at their business.
- No hype, no "unlock", no "supercharge", no exclamation marks, and no jokes.`;
}

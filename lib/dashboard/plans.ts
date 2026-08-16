/**
 * What the customer is entitled to, and where each entitlement lives.
 *
 * ⚠️ SOURCE OF TRUTH FOR WHAT EACH TIER BUYS IS THE PRICING PAGE
 * (components/marketing/pricing-teaser.tsx). If a bullet changes there, change
 * it here in the same commit: a dashboard that grants more than the page sells
 * is a support ticket, and one that grants less is a refund.
 *
 * The important structural point: these are two DIFFERENT scopes.
 *
 *   Get Cited  — one-time, per SITE.    site.getCitedAt
 *   Stay Cited — subscription, ACCOUNT. user.subscription
 *
 * So the gating helpers take whichever object actually owns the answer. A
 * single "plan" enum would have to pick one scope and be wrong about the other.
 *
 * ⚠️ AND A THIRD AXIS: TIME. Get Cited buys the setup permanently and the
 * ability to GENERATE for 30 days. So `getCitedAt` answers two different
 * questions, and conflating them is the mistake this file is arranged to
 * prevent — see hasGetCited vs getCitedActive below.
 */

import { ENGINES, type DashboardData, type Site, type Subscription, type User } from './types';

export const FREE_FAQ_CAP = 5;

/**
 * How long Get Cited keeps generating for.
 *
 * ⚠️ Deadlines are COMPUTED from `getCitedAt`, not stored. Changing this number
 * therefore moves the deadline for every existing customer, retroactively —
 * shortening it takes access away from people who already paid. If either that
 * or comping an individual extension is ever needed, add a stored
 * `sites.get_cited_expires_at` and read it here instead.
 */
export const GET_CITED_WINDOW_DAYS = 30;

/** When the window closes for a site, or null if it was never bought. */
export function getCitedExpiry(site: Site | null): Date | null {
  if (!site?.getCitedAt) return null;

  const expiry = new Date(site.getCitedAt);
  expiry.setDate(expiry.getDate() + GET_CITED_WINDOW_DAYS);
  return expiry;
}

/**
 * Whole days left in the window. Negative once it has closed, null if unbought.
 *
 * Rounded UP, so "1 day left" means there is still some of today rather than a
 * countdown that reads 0 while the feature is demonstrably still working.
 */
export function getCitedDaysLeft(site: Site | null, now: Date = new Date()): number | null {
  const expiry = getCitedExpiry(site);
  if (!expiry) return null;

  return Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);
}

/**
 * How many pages an audit may read.
 *
 * A BUDGET, NOT A GOAL. The crawler spends it on the pages most worth reading
 * rather than the first hundred it trips over — see scoreCandidate() in
 * lib/audit/fetcher.ts. The free tier is one page because that endpoint is
 * unauthenticated and every page is an outbound request to somebody else's
 * server.
 */
export const PAGE_BUDGET = { free: 1, paid: 100 } as const;

export function pageBudgetFor(site: Site | null, user: User | null): number {
  return canGenerate(site, user) ? PAGE_BUDGET.paid : PAGE_BUDGET.free;
}

/**
 * How many prompts a subscription may track.
 *
 * ⚠️ THIS IS NOT DERIVED FROM A PAGE COUNT, AND MUST NOT BE.
 *
 * Scanning is priced per page; tracking is priced per query. They scale
 * differently and belong to different jobs: someone with 30 pages might care
 * about 15 prompts, and someone with 3 pages might care about 40. Tying the two
 * would charge people for questions they never asked.
 *
 * A prompt is one question we watch. What it COSTS is derived from it —
 * engineChecksFor() below — so the cost is visible without being the unit
 * anyone has to reason in.
 *
 * ⚠️ THIS TOTAL IS MADE OF TWO PARTS, AND THE SPLIT IS LOAD-BEARING. Questions
 * arrive two ways: a model proposes them, or the customer types them. When the
 * total was the only limit, "Find more questions" filled every slot to the cap
 * and the manual field went permanently dead — one feature made the other
 * unreachable. Discovery now stops at DISCOVERED_PROMPT_CAP, leaving the manual
 * allowance reserved whether or not it has been used.
 */
export const STAY_CITED_PROMPT_CAP = 35;

/**
 * How many of those a customer may write themselves.
 *
 * Reserved out of the total, not added to it: a hand-written prompt costs the
 * same three engine calls per run as a proposed one, so it spends the same
 * allowance. Lives here beside the other caps because this is the file that
 * says what a plan buys, and because DISCOVERED_PROMPT_CAP is derived from it.
 */
export const MANUAL_QUESTION_CAP = 10;

/**
 * How many the model may propose — the total, less the reserved manual slots.
 *
 * ⚠️ Derived, never typed. Three numbers that must agree, written independently,
 * is how you end up with a discovery ceiling that quietly overruns the plan.
 */
export const DISCOVERED_PROMPT_CAP = STAY_CITED_PROMPT_CAP - MANUAL_QUESTION_CAP;

/** How often each tracked prompt is put to the engines. Weekly. */
export const TRACKING_RUNS_PER_PERIOD = 4;

/** The real cost of a prompt allowance: every prompt, every engine, every run. */
export function engineChecksFor(promptCap: number, engines: number, runs: number): number {
  return promptCap * engines * runs;
}

/**
 * Engine checks one account may spend on one site in a period.
 *
 * ⚠️ THIS IS ENFORCED NOW, NOT DECORATIVE. It was displayed on the Results page
 * for a long time while nothing checked it, which was survivable only because
 * tracking was subscription-only. Get Cited buys tracking for thirty days on a
 * single payment, so the ceiling has to be real: without it, a one-off $129 can
 * fund an unbounded recurring bill on somebody else's API. The old comment on
 * canTrack was right about the risk and wrong about the remedy.
 */
export const TRACKING_CHECKS_PER_PERIOD = engineChecksFor(
  STAY_CITED_PROMPT_CAP,
  ENGINES.length,
  TRACKING_RUNS_PER_PERIOD,
);

/** The window a tracking budget is counted over. */
export type TrackingPeriod = { start: Date; end: Date };

/**
 * Which period a site is currently in, or null if it has no tracking access.
 *
 * ⚠️ ANCHORED TO A STORED DATE, NEVER TO `now`. store.ts used to end the period
 * "thirty days from now", and its own comment warned that this moves every time
 * the page loads and "must NOT become the thing a quota is enforced against.
 * When enforcement arrives it wants a real period row." Enforcement has
 * arrived. The anniversary that comment said did not exist does now:
 * `profiles.subscription_since` and `sites.get_cited_at` are both stored.
 *
 * A rolling window would also make the budget unspendable in a different way —
 * checks would age out of it one at a time, so a customer at the ceiling would
 * be let through in dribs rather than told to wait for a date.
 *
 * Takes primitives rather than a Site or a SiteRow: the server holds snake_case
 * database rows and the client holds camelCase models, and this has to be the
 * same arithmetic on both sides.
 */
export function trackingPeriod(input: {
  getCitedAt: string | null;
  subscription: Subscription;
  subscriptionSince: string | null;
  /** Injected only by tests; production always means "now". */
  now?: Date;
}): TrackingPeriod | null {
  const now = input.now ?? new Date();

  /*
    Subscribers renew on their billing anniversary, so the budget does too —
    walking whole months forward from the start until the window contains `now`.
    Month arithmetic rather than 30-day arithmetic because that is what Stripe
    bills on, and a budget that reset on a different day from the invoice would
    be impossible to explain.
  */
  if (input.subscription === 'stay_cited' && input.subscriptionSince) {
    const start = new Date(input.subscriptionSince);
    if (!Number.isNaN(start.getTime())) {
      const cursor = new Date(start);
      while (addMonth(cursor) <= now) cursor.setTime(addMonth(cursor).getTime());
      return { start: cursor, end: addMonth(cursor) };
    }
  }

  /*
    Get Cited: the thirty-day window IS the period. There is no second one —
    when it ends, access ends, so a budget that reset inside it would be giving
    away a second allowance the customer never bought.
  */
  if (input.getCitedAt) {
    const start = new Date(input.getCitedAt);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start);
      end.setDate(end.getDate() + GET_CITED_WINDOW_DAYS);
      if (now < end) return { start, end };
    }
  }

  return null;
}

/**
 * One calendar month on, clamped — 31 Jan + 1 month is 28/29 Feb, not 3 Mar.
 *
 * ⚠️ ENTIRELY IN UTC, AND THAT IS NOT A STYLE CHOICE. Written with local-time
 * getters this drifted by the machine's offset: a 31 Jan anchor clamped to
 * 28 Feb *local*, which is 1 March UTC, so the period landed in a different
 * month depending on where the code ran. Vercel is UTC and a developer's laptop
 * usually isn't, so the budget would have been enforced over one window in
 * production and a different one in testing. `checked_at` is stored in UTC and
 * compared in UTC; the boundary has to be too.
 */
function addMonth(date: Date): Date {
  const next = new Date(date);
  const day = next.getUTCDate();

  // To the 1st first: setting the month while sitting on the 31st is what makes
  // "one month after 31 Jan" overflow into March.
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(Math.min(day, daysInUtcMonth(next.getUTCFullYear(), next.getUTCMonth())));
  return next;
}

/** Day 0 of the next month is the last day of this one. */
function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export type EntitlementId = 'get_cited' | 'stay_cited';

export const ENTITLEMENTS: Record<
  EntitlementId,
  { label: string; price: string; scope: 'site' | 'account'; blurb: string }
> = {
  get_cited: {
    label: 'Get Cited',
    price: '$129 once',
    scope: 'site',
    blurb:
      'The whole platform for this site, for 30 days: the full audit, the answer set, the publish-ready export, and citation tracking across every engine.',
  },
  /*
    ⚠️ THE BLURB LEADS ON TRACKING NOW, BECAUSE IT RUNS. It used to say
    "citation tracking is coming" and lead on re-opened generation, which was
    the honest order while no engine-querying code existed.

    ⚠️ STILL DO NOT PROMISE A SCHEDULED CHECK HERE. Runs are started by hand
    from the Results page; there is no scheduler, so "watched weekly" or
    anything like it remains a promise nothing in this codebase can keep. The
    pricing card carries the matching wording and the two change together.
  */
  stay_cited: {
    label: 'Stay Cited',
    price: '$29/month',
    scope: 'account',
    blurb:
      'Keeps citation tracking running once the 30 days end, and keeps every site on your account generating — new audits and fresh answers, for as long as you keep it.',
  },
};

/* ----------------------------------------------------------- capabilities --- */

/*
  ⚠️ THE TWO QUESTIONS `getCitedAt` ANSWERS, AND WHY THEY MUST STAY APART.

    hasGetCited(site)     — did they ever pay for this site?   PERMANENT.
    getCitedActive(site)  — are they still inside the window?  EXPIRES.

  What was bought is a deliverable plus a period of work. The deliverable —
  the audit they already have, the answers already written, the export — is
  theirs forever, because that is what "$129 once, yours to keep" on the
  pricing page promises and taking it back later would be a chargeback. The
  period of work — running NEW audits, generating NEW answers — is what the
  subscription sells, and it has to end or Stay Cited has nothing to offer.

  So: anything that SPENDS money when the customer clicks it (an LLM call, a
  crawl of somebody else's server) is gated on canGenerate. Anything that only
  reads back what they already paid for is gated on hasGetCited.
*/

/** Ever bought for this site. Permanent — never expires. */
export function hasGetCited(site: Site | null): boolean {
  return Boolean(site?.getCitedAt);
}

export function hasStayCited(user: User | null): boolean {
  return user?.subscription === 'stay_cited';
}

/** Bought, and still inside the 30-day window. */
export function getCitedActive(site: Site | null, now: Date = new Date()): boolean {
  const left = getCitedDaysLeft(site, now);
  return left !== null && left > 0;
}

/** Bought, but the window has closed and no subscription is covering it. */
export function getCitedExpired(site: Site | null, user: User | null): boolean {
  return hasGetCited(site) && !getCitedActive(site) && !hasStayCited(user);
}

/**
 * May this site do work that costs us money right now?
 *
 * The single predicate every generating feature defers to. Stay Cited is
 * account-wide, so it re-opens a site whose own window has closed — which is
 * the entire upgrade path, and the reason these take `user` as well as `site`.
 */
export function canGenerate(site: Site | null, user: User | null): boolean {
  return hasStayCited(user) || getCitedActive(site);
}

/** The full audit — the free score is on the marketing page, not in here. */
export function canRunFullAudit(site: Site | null, user: User | null): boolean {
  return canGenerate(site, user);
}

/** Discover: what people actually ask AI in this category. */
export function canDiscover(site: Site | null, user: User | null): boolean {
  return canGenerate(site, user);
}

/**
 * The publish-ready HTML, schema and llms.txt export.
 *
 * ⚠️ NOT time-limited, deliberately. This is how a customer takes what they
 * paid for away with them, and it reads from work already done rather than
 * commissioning any. Gating it on the window would mean selling someone their
 * own HTML and then locking the door — see the block above.
 */
export function canPublish(site: Site | null): boolean {
  return hasGetCited(site);
}

/**
 * The content plan: which pages the site is missing, and what to write next.
 *
 * Get Cited rather than free, for a reason that isn't only commercial — it is
 * built on the full crawl. A free audit reads exactly one page, and a
 * must-have-pages table derived from the home page alone would report every
 * other page as missing. The gate keeps the feature from lying.
 */
export function canContent(site: Site | null, user: User | null): boolean {
  return canGenerate(site, user);
}

/**
 * Running a check — Stay Cited, or inside a live Get Cited window.
 *
 * ⚠️ Was subscription-only. Get Cited now buys tracking for its 30 days, with
 * TRACKING_CHECKS_PER_PERIOD as the ceiling that keeps a one-off payment from
 * funding an unbounded engine bill. Enforced server-side in the tracking route;
 * this twin only decides what to render. See the fuller note on the server copy
 * in lib/auth/entitlements.ts.
 */
export function canTrack(site: Site | null, user: User | null): boolean {
  return canGenerate(site, user);
}

/**
 * Seeing results already collected. PERMANENT, like canPublish.
 *
 * The window governs what may be RUN, never what may be READ — a lapsed
 * customer keeps the report they paid to collect.
 */
export function canViewTracking(site: Site | null, user: User | null): boolean {
  return hasGetCited(site) || hasStayCited(user);
}

/** Regenerating an answer set — an LLM call, so it follows the window. */
export function canRegenerate(site: Site | null, user: User | null): boolean {
  return canGenerate(site, user);
}

/**
 * How many answers a site may hold.
 *
 * Keyed to hasGetCited rather than the window: this is a cap on what may be
 * KEPT, and shrinking it at day 31 would mean deleting answers somebody paid
 * to have written. What stops at day 31 is writing new ones — canRegenerate.
 */
export function faqCapFor(site: Site | null): number {
  return hasGetCited(site) ? Number.POSITIVE_INFINITY : FREE_FAQ_CAP;
}

/**
 * May this account start a Stay Cited subscription?
 *
 * Get Cited comes first: the subscription watches whether the answers Get
 * Cited wrote are being picked up, so subscribing with nothing set up buys a
 * monthly report on an empty set. Mirrored server-side in
 * app/api/stripe/checkout/route.ts, which is where it is actually enforced.
 */
export function canBuyStayCited(sites: Site[]): boolean {
  return sites.some((s) => Boolean(s.getCitedAt));
}

/** Sites are unlimited — the money is per site, so a cap would only cost us. */
export function canAddSite(): boolean {
  return true;
}

/* --------------------------------------------------------------- summary --- */

export type AccountSummary = {
  subscription: Subscription;
  sitesOwned: number;
  sitesWithGetCited: number;
};

export function summarise(data: DashboardData): AccountSummary {
  return {
    subscription: data.user.subscription,
    sitesOwned: data.sites.length,
    sitesWithGetCited: data.sites.filter((s) => s.getCitedAt).length,
  };
}

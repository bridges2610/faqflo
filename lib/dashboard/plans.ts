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
 * ⚠️ THIS IS NOW A FALLBACK, NOT THE ANSWER. Deadlines used to be computed from
 * `getCitedAt` everywhere, and the warning that used to sit here said what went
 * wrong with that: changing the number moved the deadline for every existing
 * customer retroactively. Raising it from 30 to 90 was exactly that change, so
 * 0011 moved the deadline into `sites.get_cited_expires_at` and each site keeps
 * the date its customer was actually told.
 *
 * This still applies to rows written before that migration landed. Migrations
 * here are applied by hand in the Supabase editor, so a deploy can arrive first
 * and the fallback is what makes that survivable — do not remove it.
 */
export const GET_CITED_WINDOW_DAYS = 90;

/**
 * Days after purchase that a scheduled check runs.
 *
 * Four points plus the day-0 check the purchase scan already runs, which is
 * what makes a trend rather than a pair of readings. The gaps widen on purpose:
 * the first week is when publishing changes something, and after that a
 * citation moves on the scale of months.
 */
export const GET_CITED_CHECK_DAYS = [7, 30, 60, 90] as const;

/**
 * Slack between the last check and the door closing.
 *
 * ⚠️ NOT COSMETIC. Milestones are due at UTC midnight and the sweep runs once a
 * day, within an hour of its slot. Without this, a day-90 check on a site
 * bought at 14:00 lands after its own window has closed, `trackingPeriod()`
 * returns null, and the run is refused — a check the customer was promised,
 * lost to an arithmetic race. The number they are quoted stays 90.
 */
export const GET_CITED_GRACE_DAYS = 2;

/** When the window closes for a site, or null if it was never bought. */
export function getCitedExpiry(site: Site | null): Date | null {
  if (!site?.getCitedAt) return null;
  return expiryFrom(site.getCitedAt, site.getCitedExpiresAt);
}

/**
 * The stored deadline, or the computed one for rows that predate 0011.
 *
 * Primitives in, like trackingPeriod() below and for the same reason: the
 * server holds snake_case rows and the client holds camelCase models, and this
 * has to be the same arithmetic on both sides.
 */
export function expiryFrom(getCitedAt: string, getCitedExpiresAt: string | null): Date | null {
  if (getCitedExpiresAt) {
    const stored = new Date(getCitedExpiresAt);
    if (!Number.isNaN(stored.getTime())) return stored;
  }

  const start = new Date(getCitedAt);
  if (Number.isNaN(start.getTime())) return null;

  const expiry = new Date(start);
  expiry.setDate(expiry.getDate() + GET_CITED_WINDOW_DAYS + GET_CITED_GRACE_DAYS);
  return expiry;
}

/**
 * When each scheduled check is due, floored to UTC midnight.
 *
 * ⚠️ THE FLOOR IS THE POINT. Due-ness is compared against `now()` by a sweep
 * that runs once a day, so an anchor at 14:07 would make "day 7" mean "day 7,
 * but only if today's sweep happens to run later than 14:07" — a different day
 * for different customers, decided by when they happened to pay.
 */
export function milestoneSchedule(getCitedAt: string): { day: number; dueAt: Date }[] {
  const start = new Date(getCitedAt);
  if (Number.isNaN(start.getTime())) return [];

  return GET_CITED_CHECK_DAYS.map((day) => {
    const dueAt = new Date(start);
    dueAt.setUTCDate(dueAt.getUTCDate() + day);
    dueAt.setUTCHours(0, 0, 0, 0);
    return { day, dueAt };
  });
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
 * How many prompts a plan may track.
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
 * ⚠️ AND IT IS NO LONGER ONE NUMBER. These were globals shared by both plans,
 * which was survivable only while the plans differed in nothing but duration.
 * Get Cited now watches 15 questions on a fixed schedule and Stay Cited watches
 * 35 on demand, so the cap arrives from the plan — see TRACKING_PLANS.
 */

/** The real cost of a prompt allowance: every prompt, every engine, every run. */
export function engineChecksFor(promptCap: number, engines: number, runs: number): number {
  return promptCap * engines * runs;
}

/**
 * What one plan's tracking actually buys.
 *
 * ⚠️ THE OLD GLOBALS ARE GONE ON PURPOSE — STAY_CITED_PROMPT_CAP,
 * DISCOVERED_PROMPT_CAP and TRACKING_CHECKS_PER_PERIOD. They were not renamed
 * and not aliased, because this repo has no test suite and `npm run check`
 * refusing to compile every stale call site is the only tool that can find them
 * all. If you are reading this because the typechecker sent you here: the
 * replacement is trackingPlanFor(site, user), and the server twin of the same
 * name in lib/auth/entitlements.ts.
 *
 * `checksPerPeriod` is ENFORCED, not decorative. Without it a one-off $129 funds
 * an unbounded bill on somebody else's API — the reason canTrack was allowed to
 * stop being subscription-only at all.
 */
export type TrackingPlanId = 'get_cited' | 'stay_cited';

export type TrackingPlan = {
  id: TrackingPlanId;
  /** Questions watched. One question costs one engine call per engine per run. */
  promptCap: number;
  /** Reserved out of promptCap for questions the customer types themselves. */
  manualCap: number;
  /** What discovery may propose — the remainder. Never typed, always derived. */
  discoveredCap: number;
  runsPerPeriod: number;
  checksPerPeriod: number;
  /**
   * How runs happen.
   *
   *   'milestones' — the cron only, on GET_CITED_CHECK_DAYS. No button.
   *   'weekly'     — the cron every week, and the button as well.
   *
   * The difference is what the upgrade sells: a fixed schedule versus a check
   * whenever you want one.
   */
  schedule: 'milestones' | 'weekly';
};

/**
 * ⚠️ THE MANUAL/DISCOVERED SPLIT SURVIVES ON BOTH PLANS, AND IT IS LOAD-BEARING.
 * Questions arrive two ways: a model proposes them, or the customer types them.
 * When the total was the only limit, "Find more questions" filled every slot and
 * the manual field went permanently dead — one feature made the other
 * unreachable. Discovery stops at `discoveredCap`, leaving the manual allowance
 * reserved whether or not it has been used.
 *
 * ⚠️ Get Cited's `runsPerPeriod` is 5, not 4. Four are the scheduled checks; the
 * fifth is the day-0 pass the purchase scan already runs (lib/scan/run.ts), and
 * leaving it out of the budget means the last milestone is refused for want of
 * an allowance somebody already spent.
 */
export const TRACKING_PLANS: Record<TrackingPlanId, TrackingPlan> = {
  get_cited: build('get_cited', { promptCap: 15, manualCap: 5, runs: 5, schedule: 'milestones' }),
  stay_cited: build('stay_cited', { promptCap: 35, manualCap: 10, runs: 4, schedule: 'weekly' }),
};

function build(
  id: TrackingPlanId,
  input: { promptCap: number; manualCap: number; runs: number; schedule: TrackingPlan['schedule'] },
): TrackingPlan {
  return {
    id,
    promptCap: input.promptCap,
    manualCap: input.manualCap,
    discoveredCap: input.promptCap - input.manualCap,
    runsPerPeriod: input.runs,
    checksPerPeriod: engineChecksFor(input.promptCap, ENGINES.length, input.runs),
    schedule: input.schedule,
  };
}

/**
 * Which plan's tracking rules apply, from primitives.
 *
 * ⚠️ THE PRECEDENCE MUST MATCH trackingPeriod() BELOW — Stay Cited first. A
 * subscriber given the Get Cited cap would be held to 15 questions while their
 * budget was counted over a calendar month, which is wrong in both directions at
 * once and looks like a bug in whichever half you notice second.
 */
export function trackingPlan(input: {
  subscription: Subscription;
  getCitedAt: string | null;
  getCitedExpiresAt: string | null;
  now?: Date;
}): TrackingPlan | null {
  if (input.subscription === 'stay_cited') return TRACKING_PLANS.stay_cited;

  if (input.getCitedAt) {
    const expiry = expiryFrom(input.getCitedAt, input.getCitedExpiresAt);
    if (expiry && (input.now ?? new Date()) < expiry) return TRACKING_PLANS.get_cited;
  }

  return null;
}

/** The client twin. The server's lives in lib/auth/entitlements.ts. */
export function trackingPlanFor(site: Site | null, user: User | null): TrackingPlan | null {
  return trackingPlan({
    subscription: user?.subscription ?? 'none',
    getCitedAt: site?.getCitedAt ?? null,
    getCitedExpiresAt: site?.getCitedExpiresAt ?? null,
  });
}

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
  getCitedExpiresAt: string | null;
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
    Get Cited: the whole window IS the period. There is no second one — when it
    ends, access ends, so a budget that reset inside it would be giving away a
    second allowance the customer never bought.

    The end comes from the stored expiry, so a site grandfathered at 30 days and
    one bought under the 90-day rule are both counted over the window they were
    actually sold.
  */
  if (input.getCitedAt) {
    const start = new Date(input.getCitedAt);
    const end = expiryFrom(input.getCitedAt, input.getCitedExpiresAt);
    if (!Number.isNaN(start.getTime()) && end && now < end) return { start, end };
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
      'The whole platform for this site, for 90 days: the full audit, the answer set, the publish-ready export, and citation tracking checked at setup and again on days 7, 30, 60 and 90.',
  },
  /*
    ⚠️ THE BLURB LEADS ON TRACKING NOW, BECAUSE IT RUNS. It used to say
    "citation tracking is coming" and lead on re-opened generation, which was
    the honest order while no engine-querying code existed.

    ⚠️ A SCHEDULED CHECK MAY FINALLY BE PROMISED HERE, AND THE REASON MATTERS.
    This block carried the opposite instruction for a long time — "there is no
    scheduler, so 'watched weekly' remains a promise nothing in this codebase can
    keep." A scheduler exists now: app/api/cron/tracking, fired daily by the
    crons entry in vercel.json, driving the same scan_jobs machinery the purchase
    scan uses. What is STILL not built is alerting, so nothing here may say we
    tell you when a citation appears or disappears. The pricing card carries the
    matching wording and the two change together.
  */
  stay_cited: {
    label: 'Stay Cited',
    price: '$29/month',
    scope: 'account',
    blurb:
      'Keeps citation tracking running once the 90 days end — 35 questions checked every week and whenever you ask — and keeps every site on your account generating.',
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

/** Bought, and still inside the window. */
export function getCitedActive(site: Site | null, now: Date = new Date()): boolean {
  const left = getCitedDaysLeft(site, now);
  return left !== null && left > 0;
}

/**
 * May this customer start a check themselves, right now?
 *
 * ⚠️ NOT THE SAME QUESTION AS canTrack, and keeping them apart is the point.
 * canTrack asks whether a check may run at all — the cron needs that. This asks
 * whether a PERSON may start one, which only Stay Cited may do. Get Cited buys
 * five checks on fixed days; a button beside them would either overspend the
 * window or do nothing, and both read as broken.
 */
export function canRunCheckNow(site: Site | null, user: User | null): boolean {
  return canTrack(site, user) && trackingPlanFor(site, user)?.schedule === 'weekly';
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
 * May a check run for this site at all — by anyone, including the scheduler.
 *
 * ⚠️ Was subscription-only. Get Cited now buys tracking for its window, with
 * the plan's `checksPerPeriod` as the ceiling that keeps a one-off payment from
 * funding an unbounded engine bill. Enforced server-side in the tracking route
 * and in the milestone runner; this twin only decides what to render. See the
 * fuller note on the server copy in lib/auth/entitlements.ts.
 *
 * For "may the customer press a button", see canRunCheckNow above.
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

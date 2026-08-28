/**
 * What the customer is entitled to, and where each entitlement lives.
 *
 * ⚠️ SOURCE OF TRUTH FOR WHAT EACH PLAN BUYS IS THE PRICING PAGE
 * (components/marketing/pricing-teaser.tsx). If a bullet changes there, change
 * it here in the same commit: a dashboard that grants more than the page sells
 * is a support ticket, and one that grants less is a refund.
 *
 * ⚠️ THERE IS NOW ONE AXIS, AND THAT IS THE WHOLE POINT OF THIS REWRITE.
 *
 * This file used to describe two products of different shapes — Get Cited, a
 * one-time purchase belonging to a SITE and expiring after 90 days, and Stay
 * Cited, a subscription belonging to the ACCOUNT. Every gate had to reason
 * about site scope, account scope and a time window at once, so "did they ever
 * pay" and "is it still open" were separate predicates that had to be picked
 * between correctly at each of forty-odd call sites.
 *
 * Both are retired. An account is 'free' or 'pro', the plan lives on the
 * profile, and every question below is that one question wearing a different
 * name. Do not reintroduce a per-site entitlement without reading the note on
 * canPublish first — the permanence rules are different for a subscription and
 * getting them wrong in that direction is a chargeback.
 */

import { ENGINES, type DashboardData, type PlanId, type Site, type User } from './types';

/* --------------------------------------------------------------- prices --- */

/**
 * What Pro costs.
 *
 * ⚠️ NOT DERIVED FROM STRIPE, AND STRIPE DOES NOT READ THIS. Stripe charges
 * whatever its own price object says; these numbers are what the pricing page
 * and the dashboard quote. If the two disagree, a customer is quoted one figure
 * and billed another — so a price change is always two edits: here, and the
 * price in the Stripe dashboard (whose id lives in STRIPE_PRICE_* so the amount
 * can move without a deploy). Test mode and live mode have SEPARATE price
 * objects, so a change in one does not follow into the other.
 *
 * They live here rather than in the pricing component because the dashboard
 * quotes them too — the upgrade card and the plan page. Three copies of $39 is
 * three chances to change two of them.
 */
export const PRO_PRICE = { monthly: 39, annualTotal: 390 } as const;

/**
 * The money-back window, in days. ⚠️ ANNUAL ONLY.
 *
 * Monthly needs no guarantee — the most anyone can lose is one month, and they
 * can cancel from the billing portal themselves. Annual asks for $390 up front,
 * which is the objection this answers.
 *
 * Enforcement is a human refunding in Stripe, not code. What IS automatic is
 * the consequence: cancelling the subscription fires
 * customer.subscription.deleted, and applySubscription() drops the account back
 * to free. Nothing here needs to know a refund happened.
 */
export const GUARANTEE_DAYS = 30;

/* ------------------------------------------------------------ the caps --- */

/**
 * How many answers a FREE account may keep.
 *
 * A cap on what may be STORED, not on what may be generated in one go — that
 * is MAX_FAQ_COUNT_PRO in lib/faq.ts. Someone who generates six, deletes four
 * and generates six more is at eight, not twelve.
 */
export const FREE_FAQ_CAP = 10;

/**
 * Sites per account. Both plans.
 *
 * ⚠️ THE SAME ON BOTH ON PURPOSE, WHICH IS NOT WHAT THE OLD MODEL DID. Get
 * Cited was priced per site and therefore had to allow unlimited ones —
 * canAddSite() returned a bare `true` with the comment "the money is per site,
 * so a cap would only cost us". Pro is priced per account, so the opposite is
 * true: every extra site is a full crawl and 75 more engine calls a week
 * against one $39 subscription.
 *
 * One is also the honest answer for who this is sold to. A plumber has one
 * website. When multi-site Pro arrives it is this constant and a second Stripe
 * price, not a new scope.
 */
export const SITE_CAP = 1;

/**
 * How many discovered questions a FREE account sees.
 *
 * ⚠️ A DISPLAY CAP, NOT A GENERATION CAP, AND THE DIFFERENCE IS DELIBERATE.
 * Discovery costs one model call whether it returns five questions or fifteen,
 * so the onboarding scan stores all fifteen and free shows five. Upgrading then
 * reveals the rest instantly, with no second call and no waiting.
 *
 * This is therefore NOT a security boundary and must not be relied on as one.
 * The rows are the customer's own and readable under RLS from their browser.
 * What is actually gated is the thing that costs money — running discovery
 * again — and that is enforced server-side at app/api/dashboard/questions.
 */
export const FREE_QUESTION_SAMPLE = 5;

/**
 * How many pages an audit may read.
 *
 * A BUDGET, NOT A GOAL. The crawler spends it on the pages most worth reading
 * rather than the first hundred it trips over — see scoreCandidate() in
 * lib/audit/fetcher.ts. Free is one page because a single page is enough to
 * answer the three questions the free tier promises (can AI read it, are the
 * bots allowed in, is there any Q&A markup) and because every page is an
 * outbound request to somebody else's server.
 */
export const PAGE_BUDGET = { free: 1, pro: 100 } as const;

export function pageBudgetFor(user: User | null): number {
  return isPro(user) ? PAGE_BUDGET.pro : PAGE_BUDGET.free;
}

/* ------------------------------------------------------------ tracking --- */

/** How often Pro's automatic check runs. Matches the interval in 0012's RPC. */
export const WEEKLY_CHECK_DAYS = 7;

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
 */

/** The real cost of a prompt allowance: every prompt, every engine, every run. */
export function engineChecksFor(promptCap: number, engines: number, runs: number): number {
  return promptCap * engines * runs;
}

export type TrackingPlan = {
  id: PlanId;
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
   *   'once'   — the onboarding scan, and nothing after it. No button.
   *   'weekly' — the cron every week, and the button as well.
   *
   * The difference is most of what the upgrade sells: a single reading versus
   * a line on a chart.
   */
  schedule: 'once' | 'weekly';
};

/**
 * What each plan's tracking actually buys.
 *
 * ⚠️ FREE SPENDS REAL MONEY, WHICH IS WHY IT HAS A PLAN ENTRY AT ALL. Three
 * questions against three search-backed engines, three times over, is
 * twenty-seven billable calls per free signup. It is bounded by being counted
 * over a period that never resets — see trackingPeriod() — so
 * `checksPerPeriod` is a LIFETIME ceiling on free and a monthly one on Pro.
 * Same field, same enforcement, different window.
 *
 * ⚠️ FREE WAS 5 PROMPTS ONCE, AND IS NOW 3 PROMPTS THREE TIMES. The old shape
 * gave a wider first look at a report nobody could change; the report shows a
 * ranking table with a button under it now, so what free needs is the ability
 * to fix something and look again. Fewer prompts pays for the re-runs: the two
 * shapes are 15 calls and 27, and the second one is the one that can show a
 * number moving.
 *
 * ⚠️ FREE'S manualCap IS 0 ON PURPOSE, AND THAT IS WHY THE BUTTON TAKES NO
 * INPUT. The three prompts are the ones discovery already found and the
 * onboarding scan already asked; the button re-asks exactly those. A field
 * that accepts a typed question and then never checks it is worse than no
 * field, so there isn't one — the UI says "Pro watches questions you write
 * yourself" instead.
 *
 * ⚠️ FREE'S schedule STAYS 'once'. It describes the SCHEDULER, not the button:
 * free still gets no automatic weekly re-check, which is most of what Pro
 * sells, and flipping this would put free sites into the cron sweep in
 * app/api/cron/tracking/route.ts. Whether a person may press Run is
 * canRunCheckNow(), which is a different question and now has a different
 * answer.
 *
 * ⚠️ PRO'S runsPerPeriod IS 5, NOT 4. A calendar month holds five weekly checks
 * often enough to matter, and a budget of four would refuse the fifth — a check
 * the customer was promised, declined for want of an allowance arithmetic
 * assumed away. The same reasoning applied to the old Get Cited plan, where the
 * fifth run was the day-0 scan.
 */
export const TRACKING_PLANS: Record<PlanId, TrackingPlan> = {
  free: build('free', { promptCap: 3, manualCap: 0, runs: 3, schedule: 'once' }),
  pro: build('pro', { promptCap: 25, manualCap: 10, runs: 5, schedule: 'weekly' }),
};

function build(
  id: PlanId,
  input: { promptCap: number; manualCap: number; runs: number; schedule: TrackingPlan['schedule'] },
): TrackingPlan {
  return {
    id,
    promptCap: input.promptCap,
    manualCap: input.manualCap,
    /*
      ⚠️ THE MANUAL/DISCOVERED SPLIT IS LOAD-BEARING ON PRO. Questions arrive
      two ways: a model proposes them, or the customer types them. When the
      total was the only limit, "Find more questions" filled every slot and the
      manual field went permanently dead — one feature made the other
      unreachable. Discovery stops at discoveredCap, leaving the manual
      allowance reserved whether or not it has been used.
    */
    discoveredCap: input.promptCap - input.manualCap,
    runsPerPeriod: input.runs,
    checksPerPeriod: engineChecksFor(input.promptCap, ENGINES.length, input.runs),
    schedule: input.schedule,
  };
}

/** Which plan's tracking rules apply. Always one of them — free is a plan. */
export function trackingPlanFor(user: User | null): TrackingPlan {
  return TRACKING_PLANS[planOf(user)];
}

/**
 * The window a tracking budget is counted over.
 *
 * `end` is null when the budget never resets, which is how free's three runs are
 * enforced: twenty-seven engine calls counted from the day the account was made,
 * against a ceiling of twenty-seven, forever.
 */
export type TrackingPeriod = { start: Date; end: Date | null };

/**
 * Which period an account is currently in.
 *
 * ⚠️ ANCHORED TO A STORED DATE, NEVER TO `now`. An earlier version ended the
 * period "thirty days from now", which moves every time the page loads and can
 * therefore never be the thing a quota is enforced against. Both anchors here
 * are columns: profiles.plan_since and profiles.created_at.
 *
 * A rolling window would also make the budget unspendable in a different way —
 * checks would age out of it one at a time, so a customer at the ceiling would
 * be let through in dribs rather than told a date.
 *
 * Takes primitives rather than a User or a ProfileRow: the server holds
 * snake_case database rows and the client holds camelCase models, and this has
 * to be the same arithmetic on both sides.
 */
export function trackingPeriod(input: {
  plan: PlanId;
  planSince: string | null;
  /** profiles.created_at — the anchor for free's lifetime allowance. */
  accountCreatedAt: string | null;
  /** Injected only by tests; production always means "now". */
  now?: Date;
}): TrackingPeriod | null {
  const now = input.now ?? new Date();

  /*
    Pro renews on its billing anniversary, so the budget does too — walking
    whole months forward from the start until the window contains `now`. Month
    arithmetic rather than 30-day arithmetic because that is what Stripe bills
    on, and a budget that reset on a different day from the invoice would be
    impossible to explain.
  */
  if (input.plan === 'pro' && input.planSince) {
    const start = new Date(input.planSince);
    if (!Number.isNaN(start.getTime())) {
      const cursor = new Date(start);
      while (addMonth(cursor) <= now) cursor.setTime(addMonth(cursor).getTime());
      return { start: cursor, end: addMonth(cursor) };
    }
  }

  /*
    Free: one window, from the day the account was made, that never closes.

    ⚠️ THIS IS THE ENTIRE ENFORCEMENT OF "ONE CHECK, EVER", and it is enforcement
    by reuse rather than by a new code path. The tracking route already counts
    citation_checks since period.start and refuses past checksPerPeriod; giving
    free a period with no end makes that same count a lifetime total. Nothing
    else needed writing, and there is no second rule that can drift from the
    first.

    Falls back to the epoch when created_at is somehow missing, which counts
    every check the site ever has. Erring toward refusing a free run is the
    right direction: the failure is a customer who is told to upgrade, not a
    bill for an unbounded number of runs.
  */
  const start = input.accountCreatedAt ? new Date(input.accountCreatedAt) : new Date(0);
  return { start: Number.isNaN(start.getTime()) ? new Date(0) : start, end: null };
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

/** When the next automatic check is due, or null when nothing is scheduled. */
export function nextCheckDate(site: Site | null): Date | null {
  if (!site?.nextCheckAt) return null;
  const due = new Date(site.nextCheckAt);
  return Number.isNaN(due.getTime()) ? null : due;
}

/* --------------------------------------------------------------- offers --- */

/**
 * The plans, as the app describes them to a customer.
 *
 * ⚠️ EVERY CLAIM HERE MUST BE TRUE TODAY. This copy is read inside the product
 * by someone who has already paid, so an aspirational line is not marketing, it
 * is a support ticket. Alerts — telling someone when a citation appears or
 * disappears — are STILL NOT BUILT and are named nowhere. Nothing in this file
 * or on the pricing page may imply we email you about a result; you find out by
 * looking. If alerting ships, the pricing card and this block change together.
 */
export const PLAN_COPY: Record<PlanId, { label: string; price: string; blurb: string }> = {
  free: {
    label: 'Free',
    price: '$0',
    blurb:
      'Where you stand right now: your AI-visibility score, whether AI can read your site and get in, and three real questions put to ChatGPT, Perplexity and Google’s Gemini — with who they named instead of you. Run it three times as you fix things.',
  },
  pro: {
    label: 'Pro',
    price: `$${PRO_PRICE.monthly}/month`,
    blurb:
      'The full check of every page, answers written to be quoted, publish-ready code for your own site, and 25 questions watched every week so you can see whether the engines start naming you.',
  },
};

/* ----------------------------------------------------------- the plan --- */

/** The account's plan. Free is the answer for a missing user, not an error. */
export function planOf(user: User | null): PlanId {
  return user?.plan === 'pro' ? 'pro' : 'free';
}

/**
 * The one question.
 *
 * Every capability below is this predicate under a different name. They stay as
 * separate one-liners rather than collapsing into `isPro` at the call sites for
 * two reasons: the name says WHY a thing is gated, and the twins in
 * lib/auth/entitlements.ts stay obvious to diff against these.
 */
export function isPro(user: User | null): boolean {
  return user?.plan === 'pro';
}

/* ----------------------------------------------------------- capabilities --- */

/*
  ⚠️ THE PERMANENCE RULE INVERTED WHEN THE PRODUCT BECAME A SUBSCRIPTION, AND
  THE OLD ONE MUST NOT COME BACK BY HABIT.

  Get Cited was a one-time payment for a deliverable, so everything it made had
  to be permanent — the pricing page said "yours to keep", and taking the export
  away on day 91 would have been a chargeback. canPublish was therefore gated on
  "did they ever pay", never on "are they still paying".

  Pro is a subscription. Nothing is bought outright, so nothing outlives the
  subscription, and canPublish follows the plan like everything else. What
  replaces "yours to keep" is the plain-text copy every free account gets
  (buildPlainText in lib/dashboard/export.ts) — a lapsed customer can still take
  their own words with them, they just lose the publish-ready HTML and schema.
  The pricing page says exactly that; keep the two in step.

  The one thing that stays permanent is READING BACK measurements already
  collected — see canViewTracking.
*/

/** The full audit — every page, every check. Free reads one page. */
export function canRunFullAudit(user: User | null): boolean {
  return isPro(user);
}

/** Discover: what people actually ask AI in this category. */
export function canDiscover(user: User | null): boolean {
  return isPro(user);
}

/**
 * Writing answers with the model, in the dashboard.
 *
 * ⚠️ PRO ONLY AGAIN, AND THE HISTORY MATTERS BECAUSE IT NEARLY REPEATS. This
 * was Pro-only as `canRegenerate`, then opened to every plan on the grounds
 * that a signed-in free account was getting LESS than an anonymous stranger,
 * who could use the ungated generator on the marketing home page. That argument
 * was right and it still is — which is why what closes here is only the
 * DASHBOARD generator.
 *
 * ⚠️ THE PUBLIC TOOL AT /free-report IS UNTOUCHED AND MUST STAY THAT WAY. It
 * posts to /api/generate, not /api/dashboard/generate, and needs no account.
 * The moment this predicate is used to gate that route, the backwards tier is
 * back: someone who signed up would be worse off than someone who did not.
 *
 * What changed is the free report itself. It is one page, and that page now
 * ends in three prompts put to the engines rather than in an answer writer —
 * so free is sold a diagnosis, and writing the answers is part of what Pro
 * buys. FREE_FAQ_CAP and faqCapFor() stay as they are: accounts that wrote
 * answers under the old shape still own those rows.
 */
export function canGenerate(user: User | null): boolean {
  return isPro(user);
}

/** The content plan: which pages the site is missing, and what to write next. */
export function canContent(user: User | null): boolean {
  return isPro(user);
}

/**
 * The publish-ready HTML, schema and llms.txt export.
 *
 * See the block above before changing this to something permanent — it used to
 * be, for a reason that no longer holds.
 */
export function canPublish(user: User | null): boolean {
  return isPro(user);
}

/**
 * May we offer the done-for-you service to this account?
 *
 * ⚠️ THE ODD ONE OUT: IT GATES A PITCH, NOT A FEATURE. Everything else here
 * answers "may they use this". Nobody is being denied anything by this one —
 * DoneForYouCard is an advert, and hiding an advert takes nothing away.
 *
 * It is named rather than written as bare isPro() at four call sites because
 * the reason lives in another file entirely. /done-for-you quotes $497 and
 * deliberately does not mention the Pro subscription on top, on the stated
 * grounds that every reader already pays — and calls that assumption
 * load-bearing, because a stranger reads "$497 once" as all-in and the second
 * charge becomes a refund. This function is that assumption. Loosen it and the
 * order has to go back into that page's copy in the same commit.
 *
 * ⚠️ NOT AN EntitlementId. See the header of
 * components/dashboard/done-for-you-card.tsx: the service never touches Stripe,
 * so this must not grow into the checkout route or UpgradeCard.
 */
export function canOfferDoneForYou(user: User | null): boolean {
  return isPro(user);
}

/**
 * May a check run for this account at all — by anyone, including the scheduler.
 *
 * True on free as well, and that is not a mistake: free buys three runs,
 * metered by the plan's checksPerPeriod counted over a period that never
 * resets. The ceiling is what makes it safe, exactly as it was when a one-off
 * payment had to fund a recurring cost. ⚠️ IF THAT METER IS EVER REMOVED, THIS
 * MUST GO BACK TO isPro — an unmetered free tier is an unbounded bill on
 * somebody else's API.
 *
 * For "may the customer press a button", see canRunCheckNow.
 */
export function canTrack(): boolean {
  return true;
}

/**
 * May this customer start a check themselves, right now?
 *
 * ⚠️ NOT THE SAME QUESTION AS canTrack, and keeping them apart is still the
 * point even though both now answer yes for free. canTrack asks whether a
 * check may run at all — the onboarding scan needs that, and the scheduler
 * asks it too. This asks whether a PERSON may start one.
 *
 * ⚠️ THIS USED TO BE isPro, FOR A REASON THAT NO LONGER HOLDS. It read: "Free
 * gets a single automatic run; a button beside it would spend the whole
 * allowance on the first click and then do nothing forever, which reads as
 * broken twice." That was correct while free bought one run. It buys three, so
 * the first click leaves two and the button has somewhere to go.
 *
 * ⚠️ IT IS NOT A BUDGET CHECK, AND MUST NOT BECOME ONE. This says the plan
 * permits a person to press Run; whether there is anything left to spend is
 * counted server-side against checksPerPeriod in
 * app/api/dashboard/tracking/route.ts, from citation_checks rows. Deciding
 * "runs remaining" here would mean a second implementation of the meter, on the
 * client, reading numbers the client can't be trusted with. The UI derives a
 * runs-left figure for display from the same rows — see runsLeftFor() — and
 * the server still refuses independently.
 *
 * No argument, like canTrack() and canGenerate() beside it: a predicate that
 * ignores its input should not accept one, or every call site implies a
 * distinction that isn't there.
 */
export function canRunCheckNow(): boolean {
  return true;
}

/**
 * How many more times this account can press Run.
 *
 * ⚠️ DERIVED, NEVER STORED. This codebase does not keep progress flags — "a
 * flag can disagree with reality, and the thing it would disagree about is
 * already knowable". `checksUsed` is a count of citation_checks rows since the
 * period start, which on free is the beginning of time, so the arithmetic below
 * is a reading of what actually happened rather than a tally somebody has to
 * remember to increment.
 *
 * ⚠️ FOR DISPLAY ONLY. The server refuses past the budget on its own; this
 * exists so the page can say "2 checks left" instead of offering a button that
 * fails. If the two ever disagree the server is right.
 *
 * A partly-failed run — Perplexity 429s through half of it — spends less than a
 * whole run and therefore leaves more here. That is correct rather than
 * generous: the route skips question/engine pairs it already has for today, so
 * pressing again buys only what is missing.
 */
export function runsLeftFor(
  tracking: { checksCap: number; checksUsed: number; promptCap: number } | null,
): number {
  if (!tracking) return 0;
  const perRun = tracking.promptCap * ENGINES.length;
  if (perRun <= 0) return 0;
  return Math.max(0, Math.floor((tracking.checksCap - tracking.checksUsed) / perRun));
}

/**
 * Has a check already run today?
 *
 * ⚠️ RUNS LEFT IS NOT THE ONLY LIMIT, AND THIS IS THE OTHER ONE. The tracking
 * route skips any question/engine pair it already holds a row for since
 * midnight UTC — "re-asking the same question twice in one day tells you
 * nothing new and bills twice for it". So a second press on the same day
 * returns `{checked: 0, done: true}` and changes nothing on screen.
 *
 * Without this the button would spend a click, report success and leave the
 * table identical, which reads as broken. With it the page can say the run is
 * available tomorrow — which is also the honest shape of the offer, since the
 * point of a re-check is to see whether a fix moved anything.
 *
 * ⚠️ UTC, BECAUSE THE ROUTE IS. Comparing against local midnight would let the
 * two disagree for hours either side of it, and the one that actually decides
 * is the server's.
 */
export function checkedTodayUtc(latest: { checkedAt: string }[]): boolean {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const iso = since.toISOString();
  return latest.some((c) => c.checkedAt >= iso);
}

/**
 * Seeing results already collected. PERMANENT.
 *
 * The plan governs what may be RUN, never what may be READ. A customer who
 * cancels keeps the readings they paid to collect — hiding measurements after
 * the fact would be rewriting their own history to sell them a resubscribe.
 */
export function canViewTracking(): boolean {
  return true;
}

/** How many answers an account may hold. */
export function faqCapFor(user: User | null): number {
  return isPro(user) ? Number.POSITIVE_INFINITY : FREE_FAQ_CAP;
}

/** How many discovered questions to show. Pro sees everything found. */
export function questionCapFor(user: User | null): number {
  return isPro(user) ? Number.POSITIVE_INFINITY : FREE_QUESTION_SAMPLE;
}

/**
 * May another site be added?
 *
 * ⚠️ THIS IS THE FIRST VERSION OF THIS FUNCTION THAT IS ACTUALLY CALLED. The
 * old one took no arguments, returned a bare `true`, and had no call sites at
 * all — a cap that existed only as a name. The form, the workspace and the
 * onboarding route all check it now.
 *
 * Takes a COUNT rather than an array, so the same function serves the browser
 * (holding camelCase Site models) and the server (holding snake_case SiteRows)
 * without either having to reshape rows to satisfy a signature. Same reasoning
 * as trackingPeriod() taking primitives.
 */
export function canAddSite(siteCount: number): boolean {
  return siteCount < SITE_CAP;
}

/** May this account start a Pro subscription? Not if it already has one. */
export function canBuyPro(user: User | null): boolean {
  return !isPro(user);
}

/* --------------------------------------------------------------- summary --- */

export type AccountSummary = {
  plan: PlanId;
  sitesOwned: number;
};

export function summarise(data: DashboardData): AccountSummary {
  return {
    plan: planOf(data.user),
    sitesOwned: data.sites.length,
  };
}

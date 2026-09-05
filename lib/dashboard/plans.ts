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
 *
 * ⚠️ IT WAS 10 AND HAD TO RISE, BECAUSE IT WAS SILENTLY CANCELLING A GRANT.
 * Free writes FREE_GENERATED_FAQ_SET_CAP sets and a set is 3-12 answers, so at
 * ten stored the third set had nowhere to go — the plan offered five and the
 * storage refused after two. Twenty-five is five sets at free's five-answer
 * per-call maximum. A cap that blocks something the pricing table sells is the
 * refund this file's header warns about.
 */
export const FREE_FAQ_CAP = 25;

/**
 * Articles a Pro account may generate per month.
 *
 * ⚠️ A GENERATION CAP, NOT A STORAGE CAP — THE OPPOSITE OF FREE_FAQ_CAP ABOVE,
 * WHICH IS WHY THEY READ SO SIMILARLY AND BEHAVE SO DIFFERENTLY. Deleting an
 * article does not give the month back: the model call is what cost money, and
 * it already happened. Someone who writes ten and deletes nine has none left.
 *
 * Ten because a thousand words on a real subject is the most expensive thing in
 * this product per press of a button — every other generator returns a page of
 * short answers — and ten a month is more than a small business publishes.
 *
 * ⚠️ FREE IS NO LONGER ZERO. This note used to end "there is no FREE constant
 * to pair with this one, because the whole dashboard generator is already
 * Pro-only". Free now writes one article and five answers, so the pair below
 * exists — and canGenerate() no longer answers the question on its own.
 */
export const ARTICLE_CAP = 10;

/**
 * What a FREE account may have written for it, ever.
 *
 * ⚠️ EVER, NOT PER PERIOD, AND NOT A CAP ON WHAT IS HELD. trackingPeriod()
 * never ends for a free account, so a period-based count would be lifetime
 * anyway — saying "ever" plainly avoids implying a monthly refill that is never
 * coming. And it counts model calls that happened: deleting the article or the
 * answers does not hand the allowance back, because the call is what cost
 * money. That is why the count lives in profiles.free_articles_used /
 * free_faqs_used (migration 0021) rather than being derived from rows, which
 * are hard-deleted.
 *
 * ⚠️ FIVE RUNS, NOT FIVE ANSWERS, AND AN EARLIER VERSION OF THIS COUNTED
 * ANSWERS. One run writes MIN_FAQ_COUNT to MAX_FAQ_COUNT of them, so counting
 * answers meant a run of 3 left a remainder of 2 that no run could use —
 * clampCount()'s floor turns a request for 2 into the maximum. Counting runs
 * removes the whole problem: every set may be as large as the plan allows.
 *
 * ⚠️ AN ARTICLE'S OWN FAQs ARE NOT ONE OF THESE. They are bounded by
 * MAX_ARTICLE_FAQS on the article itself and are exempt here — see the note in
 * app/api/dashboard/generate/route.ts about why that exemption is verified
 * against the stored article rather than trusted from the request.
 *
 * ⚠️ DIFFERENT FROM FREE_FAQ_CAP, WHICH CAPS WHAT IS STORED and includes
 * hand-written answers. This caps how many times the model is asked.
 */
export const FREE_ARTICLE_CAP = 1;
export const FREE_GENERATED_FAQ_SET_CAP = 5;

/** What this account may still have written. Pro's article budget is monthly and
 *  counted from rows; free's is a lifetime counter it cannot reach. */
export function articleCapFor(user: User | null): number {
  return isPro(user) ? ARTICLE_CAP : FREE_ARTICLE_CAP;
}

/**
 * Articles used and left in the current window, or null when the account has no
 * allowance at all.
 *
 * ⚠️ THE WINDOW IS trackingPeriod()'S, NOT A NEW ONE. That function already
 * walks whole months from the Stripe billing anniversary in UTC, and carries
 * the warning about why a budget anchored to `now` can never be enforced. A
 * second month-boundary implementation here would be a second answer to "when
 * does this reset", and the two would eventually disagree in front of a
 * customer who is being refused.
 *
 * ⚠️ THIS IS FOR RENDERING ONLY. The count the customer is actually held to is
 * taken server-side in app/api/dashboard/article, from rows they cannot forge.
 * This one is computed from the browser's own snapshot so the screen can say
 * what is left without a round trip — the same division of labour this file
 * draws with lib/auth/entitlements.ts at the top.
 */
export function articleAllowance(
  user: User | null,
  articles: { createdAt: string }[],
  /** Injected only by tests; production always means "now" — as trackingPeriod. */
  now?: Date,
): { used: number; left: number; cap: number; resetsAt: Date | null } | null {
  if (!canGenerate(user)) return null;

  /* ⚠️ PRO'S BUDGET IS MONTHLY AND COUNTED FROM ROWS; FREE'S IS A LIFETIME
     COUNTER THIS CANNOT SEE. profiles.free_articles_used is service-role only
     (0021), so the honest client-side answer for a free account is the cap and
     whatever rows survive — the server is what actually refuses. */
  const cap = articleCapFor(user);

  const period = trackingPeriod({
    plan: planOf(user),
    planSince: user?.planSince ?? null,
    accountCreatedAt: user?.createdAt ?? null,
    now,
  });

  const start = period?.start ?? new Date(0);
  const used = articles.filter((a) => new Date(a.createdAt) >= start).length;

  return {
    used,
    left: Math.max(0, cap - used),
    cap,
    resetsAt: period?.end ?? null,
  };
}

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

/*
  How many rivals a Pro account may name.

  ⚠️ MOVED HERE FROM store.ts WHEN WATCHING BECAME PRO-ONLY. PLAN_FEATURES has
  to quote this number, and store.ts already imports from this file — reaching
  back the other way would have made the cycle plans → store → plans. Every
  other allowance already lives here; this one was simply in the wrong place
  while it was a storage detail rather than something a plan buys.
*/
export const COMPETITOR_CAP = 10;

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
 * ⚠️ THE 27 ABOVE IS HISTORY, NOT THE CURRENT CEILING. It compares the two old
 * shapes and is still the right comparison for why free re-runs. What free
 * actually spends now is 27 on an account that only watches what the model
 * found, and up to 36 on one that adds a question of its own — see the manualCap
 * note below.
 *
 * ⚠️ FREE'S manualCap IS 1, AND IT WAS 0 UNTIL THE WATCH LIST COULD HONOUR ONE.
 * The old note here said a field that accepts a typed question and then never
 * checks it is worse than no field — which was true, and is now the condition
 * this cap depends on rather than an argument against it. pickWatchList() in
 * lib/scan/run.ts takes manual questions FIRST, so the one a customer types is
 * asked on the next run instead of sitting below the cut at position 15.
 *
 * ⚠️ IT ADDS A FOURTH PROMPT RATHER THAN TAKING ONE OF THE THREE. promptCap is 4
 * and discoveredCap stays 3, so the discovered set is untouched and the question
 * a customer types is watched alongside it. That is the whole reason promptCap
 * and discoveredCap are separate numbers here: the ceiling counts what may be
 * ASKED, the other counts what may be FOUND.
 *
 * ⚠️ AND THE CEILING ONLY RISES FOR ACCOUNTS THAT USE IT. checksPerPeriod is
 * 4 × 3 × 3 = 36, but pickWatchList() in lib/scan/run.ts caps the discovered
 * take at discoveredCap, so an account that never types a question watches three
 * prompts and spends the same 27 it always did. Take that cap out and every free
 * signup quietly starts billing for a fourth prompt nobody asked for.
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
  free: build('free', { promptCap: 4, manualCap: 1, runs: 3, schedule: 'once' }),
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
 *
 * ⚠️ `tagline` AND `blurb` ARE TWO DIFFERENT LENGTHS FOR TWO DIFFERENT JOBS,
 * AND COLLAPSING THEM BREAKS A PAGE. `tagline` is one line under a plan name on
 * a pricing card. `blurb` is a paragraph, and help-workspace.tsx prints it whole
 * in the plan explainer while upgrade-card.tsx uses it as body copy — neither
 * has anything else to say about the plan, so a one-liner there would leave the
 * Help page's plan section a heading with nothing under it. Keep both.
 *
 * ⚠️ THE TAGLINES LIVE HERE BECAUSE THEY USED TO LIVE IN TWO PLACES. They were
 * literals inside pricing-teaser.tsx's local PLANS array — the same shape the
 * feature bullets were in before they moved, two hand-kept copies of one
 * sentence with nothing but memory keeping them equal. Both surfaces read these.
 *
 * ⚠️ ONE VALUE SENTENCE EACH, AND THEY WERE FRAGMENTS. "Find out where you
 * stand." and "Get quoted by AI, and stay quoted." were positioning, not
 * value — they told you the posture of the plan without telling you what you
 * get. Each now says the thing the plan is actually for, in one sentence.
 *
 * ⚠️ NEITHER PROMISES A RESULT, and that line is thin here. "Get named" is the
 * same aspirational register the pricing page has always used; "get named more
 * often" or any figure attached to it would be a performance claim, which
 * /about calls out by name — anyone guaranteeing citations is selling
 * something — and /terms carries a No Guarantee of Results section. "Proof of
 * whether it worked" is deliberately two-sided: the tracking shows you when it
 * did not.
 */
export const PLAN_COPY: Record<
  PlanId,
  { label: string; price: string; tagline: string; blurb: string }
> = {
  free: {
    label: 'Free',
    price: '$0',
    tagline: 'See how AI answers about your business today.',
    blurb:
      'Where you stand right now: your AI-visibility score, whether AI can read your site and get in, and three real questions put to ChatGPT, Perplexity and Google’s Gemini — with who they named instead of you. Run it three times as you fix things.',
  },
  pro: {
    label: 'Pro',
    price: `$${PRO_PRICE.monthly}/month`,
    tagline: 'Everything it takes to get named, and proof of whether it worked.',
    blurb:
      'The full check of every page, answers written to be quoted, publish-ready code for your own site, and 25 questions watched every week so you can see whether the engines start naming you.',
  },
};

/**
 * What each plan buys, as one table both surfaces read.
 *
 * ⚠️ THIS EXISTS BECAUSE THREE HAND-KEPT COPIES DRIFTED, UNDER COMMENTS SAYING
 * THEY WOULD NOT. plan-workspace.tsx and pricing-teaser.tsx each held their own
 * array, each under a note promising the other would be edited in the same
 * commit, and they still ended up disagreeing: one said "Are the AI bots
 * allowed in?" where the other said "Are the AI bots allowed in, or is your
 * site accidentally shut to them?". who-and-features.tsx says the quiet part —
 * "these lists drifted once already, under a comment promising they couldn't"
 * — and built-for-owners.tsx refuses to add a fourth on the grounds that "a
 * third copy is a third thing to keep in step".
 *
 * So the rule is no longer a promise, it is the module system. A bullet cannot
 * change on one surface only, because there is only one surface.
 *
 * ⚠️ EVERY NUMBER INTERPOLATES FROM THE CONSTANT THE APP ENFORCES — not from a
 * literal typed to match it. Change a cap and the sales copy follows in the
 * same edit; that is the entire point, and typing "25" here would quietly undo
 * it. Same reason PLAN_COPY reads PRO_PRICE.
 *
 * ⚠️ EVERY ROW MUST BE TRUE TODAY, which is PLAN_COPY's rule above and applies
 * with more force here because this table is also the public pricing page.
 * Alerts are still not built and are named nowhere. No row may imply we email
 * anyone about a result.
 *
 * ⚠️ `free` IS WHAT FREE ACTUALLY GETS, NOT A DASH. A comparison whose left
 * column is empty is an advert wearing a table's clothes, and the free tier
 * genuinely does most of these — it does them once, on one page. Where free
 * gets nothing at all, say so in words.
 *
 * ⚠️ THE PROSE IS SHORT ON PURPOSE, AND IT USED TO BE SENTENCES. Lines like
 * "Are the AI bots allowed in, or is your site accidentally shut to them?" read
 * fine at 14px in a wide column and wrapped to three lines in a plan card. A
 * feature list is scanned, not read: the second clause was explaining the
 * stakes, which is the report's job, not the price card's. Keep new lines to
 * about six words, and put the explanation on the screen that has room.
 *
 * ⚠️ NOT EVERY ROW EARNS A BULLET, AND FOUR NO LONGER HAVE ONE. Pro's list was
 * eleven lines, which is a spec sheet rather than something a roofer scans. Two
 * were merged into neighbours that already implied them — ready-to-paste code
 * belongs to "answers written for you", and "checked every week" belongs to the
 * line about how many questions get asked. Two were dropped outright: the
 * llms.txt file and "the pages your industry expects" were the lines a business
 * owner could not act on.
 *
 * ⚠️ A MISSING `prosePro` DOES NOT MEAN A MISSING FEATURE. All four still
 * happen, and the rows are still here — they simply are not sold as bullets.
 * planProse() skips rows without prose, which is the same mechanism that keeps
 * the paid done-for-you extra off the public pricing card.
 *
 * ⚠️ AND DROPPING llms.txt SATISFIES THE JARGON RULE RATHER THAN BREAKING IT.
 * The pricing page requires that where a technical term is used it is explained
 * in the same breath; not using it clears that bar outright.
 *
 * ⚠️ ONLY THE PROSE IS RENDERED TODAY. `label`, `free` and `pro` fed a
 * Free-vs-Pro matrix on /dashboard/plan; that page became a two-card pricing
 * layout and the matrix went with it, so nothing reads those three fields at
 * the moment. They are kept because they are the honest structured form of each
 * row — a comparison is the obvious thing to want back, and reconstructing it
 * from prose would mean guessing what free gets. Fill them on any new row.
 */
export type PlanFeature = {
  /** The thing being compared, short enough to be a table row header. */
  label: string;
  /** What Free gets. `null` means genuinely nothing — render it as such. */
  free: string | null;
  pro: string;
  /**
   * The prose form, for the marketing card, which reads as a list of promises
   * rather than as a grid. Derived from the same row so the two cannot say
   * different things about one feature.
   */
  proseFree?: string;
  prosePro?: string;
};

export const PLAN_FEATURES: PlanFeature[] = [
  {
    /*
      ⚠️ FIRST ON PURPOSE, AND IT WAS SECOND FROM LAST. This is the row that
      says somebody else is being recommended in your place, which is the whole
      reason a reader is on this page — buried under twelve rows about file
      formats, it was doing none of that work.

      ⚠️ AND IT USED TO SAY "Yes" ON FREE, which quietly closed the gap it
      exists to open: a tick beside a tick reads as parity. The honest
      difference is scope, not presence — free gets this on its three
      questions, Pro on all twenty-five and ranked.

      ⚠️ "On your 3 questions", NOT "You see 1". The draft of this row
      understated free, and understating free is the same failure as
      overstating Pro pointed the other way. Free really does get the
      named-instead result on every question it runs — the report the reader
      just came from shows that column on all three — so a table claiming
      otherwise is contradicted one click away.
    */
    label: 'Who got named instead of you',
    free: `On your ${TRACKING_PLANS.free.promptCap} questions`,
    pro: `On all ${TRACKING_PLANS.pro.promptCap}, ranked`,
    proseFree: 'Who got named instead of you',
    prosePro: 'Who gets named instead of you, ranked',
  },
  {
    /*
      ⚠️ THIS ROW DID NOT EXIST WHILE THE FEATURE WAS FREE, AND THAT WAS THE
      BUG. Watching named competitors moved behind Pro (canWatchCompetitors),
      and a Pro-only feature absent from this table is one nobody is ever sold —
      the mirror of the failure the header of this file describes, where the
      table promised less than the dashboard granted.

      ⚠️ DELIBERATELY NOT THE SAME THING AS THE ROW ABOVE. That one is who the
      engines DID cite, which free still sees on its own questions. This one is
      the list the owner writes: ten rivals counted by name whether or not they
      came up. Two rows because they are two features, and collapsing them would
      make free look like it has neither.
    */
    label: 'Competitors you watch',
    free: null,
    pro: `${COMPETITOR_CAP} you name yourself`,
    prosePro: `Track ${COMPETITOR_CAP} rivals you name, counted every week`,
  },
  {
    label: 'Pages checked',
    free: PAGE_BUDGET.free === 1 ? 'Your home page' : `${PAGE_BUDGET.free} pages`,
    pro: 'Every page on your site',
    proseFree: 'Your visibility score, out of 100',
    prosePro: 'Every page on your site checked, not just the home page',
  },
  {
    /* Scoped rather than ticked: the raw-HTML check runs per page, so free
       genuinely answers this for one page and Pro for all of them. */
    label: 'Can AI read your site',
    free: 'Yes, on one page',
    pro: 'Yes, on every page',
    proseFree: 'Whether AI can read your site',
  },
  {
    /*
      ⚠️ "Yes" ON BOTH SIDES, AND IT STAYS THAT WAY. Every other bare tick in
      this column was rewritten to state its scope, because free was reading as
      equal to Pro on rows where it is not. This row is the exception: the check
      reads a single robots.txt for the whole domain, so free and Pro get the
      identical answer and there is no scope to narrow. Making it look weaker on
      free would mean inventing a difference, which is the one thing this file
      is not allowed to do. Leave it.
    */
    label: 'Are the AI bots allowed in',
    free: 'Yes',
    pro: 'Yes',
    proseFree: 'Whether AI is allowed to read it',
  },
  {
    /* "industry", not "trade" — the row below already said industry, and this
       list is read by clinics and e-commerce as well as the trades. */
    label: 'Questions people ask in your industry',
    free: `You see ${FREE_QUESTION_SAMPLE}`,
    pro: 'All of them',
    prosePro: 'The questions customers really ask in your industry',
  },
  {
    label: 'Pages your industry expects',
    free: null,
    pro: 'Yes, and which of yours are missing',
    /* Dropped from the bullet list — see the note above PLAN_FEATURES. */
  },
  {
    /* ⚠️ free IS A NUMBER NOW, NOT null. It read null while writing was Pro-only;
       free writes FREE_GENERATED_FAQ_SET_CAP sets and FREE_ARTICLE_CAP article,
       so a blank here would sell less than the dashboard grants — which the
       header of this file calls a refund waiting to happen. Built from the
       constants so the table cannot drift from what the routes enforce. */
    label: 'Answers written to be quoted',
    free: `${FREE_GENERATED_FAQ_SET_CAP} sets to start`,
    pro: 'A complete set',
    prosePro: 'Answers written for you, ready to paste on your site',
  },
  {
    /*
      ⚠️ THE ACTION IS THE SELL, AND THIS ROW USED TO DESCRIBE ONLY THE SOURCE
      MATERIAL — "written from your own pages", which says where the words come
      from and nothing about what the customer does. What Pro actually buys here
      is that a topic row's button IS the whole flow: write-panel.tsx wires it as
      `onWrite={() => run(q.question)}`, one press, no form.

      ⚠️ AND IT STOPS AT THE MECHANIC ON PURPOSE. The topic list is sorted
      least-named-first, but write-panel.tsx deliberately stopped narrating that
      — some of those rows ARE questions AI names you on, and calling all five
      gaps was "the invented-measurement rule broken in words instead of
      digits". Do not sell this as "starting with the questions AI names you on
      least": it would put back in marketing exactly what the app removed.
    */
    label: 'Articles written for you',
    free: `${FREE_ARTICLE_CAP} to start`,
    pro: `${ARTICLE_CAP} a month, one click each`,
    prosePro: `${ARTICLE_CAP} articles a month, written from the questions your customers actually ask — one click each`,
  },
  {
    label: 'Code to paste on your site',
    free: null,
    pro: 'Ready to paste, whoever built it',
    /* Absorbed by the answers line above. */
  },
  {
    /*
      ⚠️ THE LABEL SAYS WHAT IT DOES; THE PROSE KEEPS THE NAME. This read
      "llms.txt file", which was the one line in a plain-language table that a
      roofer could not parse — sitting between "Code to paste on your site" and
      "Questions put to AI". The marketing card's rule is that a technical term
      "gets explained in the same breath rather than assumed", and prosePro
      already does that; the table label was the half that never got the memo.
      Do not put the filename back as the label.
    */
    label: 'A file that tells AI what’s on your site',
    free: null,
    pro: 'Yes',
    /* Dropped from the bullet list — see the note above PLAN_FEATURES. */
  },
  {
    label: 'Questions put to AI',
    free: `${TRACKING_PLANS.free.promptCap}`,
    pro: `${TRACKING_PLANS.pro.promptCap}`,
    /* Both halves derived, and the free one names its manual slot for the same
       reason the Pro one always has: a customer comparing the two rows should
       be able to see that writing your own question is a difference of degree
       between the plans, not something only one of them can do. */
    proseFree: `${TRACKING_PLANS.free.promptCap} real questions your customers ask — ${TRACKING_PLANS.free.manualCap} of them yours`,
    prosePro: `${TRACKING_PLANS.pro.promptCap} questions asked every week — ${TRACKING_PLANS.pro.manualCap} of them yours`,
  },
  {
    label: 'Questions you write yourself',
    /* manualCap is 0 on free, and a field that accepts a typed question and
       never checks it is worse than no field — see the note on manualCap. */
    free: null,
    pro: `${TRACKING_PLANS.pro.manualCap}`,
  },
  {
    label: 'How often it is checked',
    /* ⚠️ Free CAN press the button — canRunCheckNow() is true for both plans.
       What free does not get is the automatic weekly run, and that distinction
       is most of what Pro sells. Do not write this row as "Pro can re-check". */
    free: `${TRACKING_PLANS.free.runsPerPeriod} times, whenever you like`,
    pro: 'Every week automatically, plus any time you press the button',
    proseFree: `Check again ${TRACKING_PLANS.free.runsPerPeriod} times as you fix things`,
    /* Absorbed by the questions line above. */
  },
  {
    /*
      ⚠️ THE TREND IS THE THING WEEKLY CHECKING IS FOR, AND IT WAS MISSING FROM
      THE LIST. Every other Pro line describes a single reading — who was named,
      what was said. None of them said that the readings stack up into a line
      you can watch move, which is what `schedule: 'weekly'` above calls "most
      of what the upgrade sells: a single reading versus a line on a chart".

      ⚠️ IT IS A REAL SCREEN, NOT AN ASPIRATION. CitationChart plots citations
      per engine across the last thirty days on /dashboard/tracking.

      ⚠️ FREE CAN NOW SEE THAT SCREEN, WHICH MAKES THIS ROW A COMPARISON RATHER
      THAN A DESCRIPTION OF SOMEWHERE THEY CANNOT GO. The route used to call
      requirePro(); it does not any more. Free's schedule is still 'once', which
      is why the chart's span prop reads "from your one check" for that plan —
      a reading, not a trend. That difference is now visible side by side, which
      is a better argument than a locked door was.
    */
    label: 'Where you show up over time',
    free: 'One reading at a time',
    pro: 'Charted, week by week',
    prosePro: 'Where you show up, charted week by week',
  },
  {
    /* Scoped to match the first row: same three questions, same twenty-five. */
    label: 'What the AI actually said',
    free: `On your ${TRACKING_PLANS.free.promptCap} questions`,
    pro: 'Every week, and which of your pages earned it',
    prosePro: 'What AI said, and which of your pages it used',
  },
  {
    label: 'Re-checks and rewrites',
    free: null,
    pro: 'Unlimited',
    prosePro: 'Unlimited re-checks and rewrites',
  },
  {
    label: 'Want it done for you',
    free: null,
    pro: 'Available as a paid extra',
    /*
      ⚠️ NO prosePro, AND THE OMISSION IS THE POINT — DO NOT "COMPLETE" THIS ROW.

      Every other row's prose becomes a ticked bullet on the public pricing card,
      where pricing-teaser.tsx's rule is that "every tick below is something that
      works today" — meaning included in the price beside it. This is not
      included in anything: it is a separate service, quoted and invoiced by
      hand. A tick for it under "$39/month" would be a false claim to a stranger,
      and planProse() skips rows without prose, so leaving this field out is what
      keeps it off that card.

      ⚠️ NO PRICE AND NO LINK, EITHER, and that is what makes the row safe on a
      page free accounts read. canOfferDoneForYou() exists because /done-for-you
      opens by telling the reader "You've got Pro running", which is false for
      anyone who has not paid, and quotes a retainer — a setup fee and a monthly
      fee — that only makes sense to somebody already inside the product. A cell
      stating that a paid extra exists sends nobody there and quotes nothing, so
      none of that applies. Add a price or a link and all of it does.
    */
  },
];

/** The marketing card's list for one plan, in the order the table declares. */
export function planProse(plan: PlanId): string[] {
  const key = plan === 'pro' ? 'prosePro' : 'proseFree';
  return PLAN_FEATURES.map((row) => row[key]).filter((line): line is string => Boolean(line));
}

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
 * ⚠️ IT IS NO LONGER isPro, AND THE REFUSAL MOVED FROM THE PLAN TO THE
 * ALLOWANCE. This used to read "free is sold a diagnosis, and writing the
 * answers is part of what Pro buys". Free now gets FREE_ARTICLE_CAP articles
 * and FREE_GENERATED_FAQ_SET_CAP sets of answers, so the question it answers
 * changed shape: everybody may write, and what differs is how much.
 *
 * ⚠️ SO A `true` HERE IS NOT PERMISSION TO SPEND. It says the screen should
 * offer the control. Whether there is anything left is claimed server-side in
 * app/api/dashboard/generate and app/api/dashboard/article, by a conditional
 * update that cannot be raced — the same division of labour canRunCheckNow()
 * drew with the tracking meter before it. Deciding "how many left" here would
 * be a second implementation of a counter the client cannot be trusted with.
 *
 * ⚠️ THE ARGUMENT IS KEPT THOUGH IT IS UNUSED, WHICH canRunCheckNow() ARGUES
 * AGAINST — and the reason it stays is that this predicate is one plan change
 * away from discriminating again, while dropping it would edit every call site
 * twice. articleAllowance() below reads the CAP per plan rather than this, so
 * nothing downstream mistakes `true` for "unlimited".
 */
export function canGenerate(_user: User | null): boolean {
  return true;
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
 * Naming the rivals you want counted — "Competitors you watch".
 *
 * ⚠️ THIS IS THE CURATED LIST, NOT THE MEASURED ONE, AND THE COMPETITORS PAGE
 * SHOWS BOTH. Free keeps the measured summary: who the engines actually cited
 * on the questions its check asked, which the "Who got named instead of you"
 * row above sells honestly. What Pro buys is the list you build BY HAND — ten
 * names you choose, counted whether or not they happened to come up.
 *
 * Gating the page would take the measured half away too, which free is
 * entitled to and which is most of why that screen is worth opening.
 */
export function canWatchCompetitors(user: User | null): boolean {
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
 * the reason lives in another file entirely. /done-for-you is written for a
 * reader who is already inside the product — it opens by telling them their
 * plan is running, and prices a retainer against work the dashboard is already
 * doing for them. A stranger arriving cold reads all of that as an offer to
 * somebody else.
 *
 * ⚠️ THE OLD VERSION OF THIS NOTE DESCRIBED A DIFFERENT RISK, AND IT IS WORTH
 * KNOWING THE RISK MOVED. It said the page quoted "$497 once" while silently
 * assuming a $39/mo subscription underneath, so a cold reader would meet a
 * second charge and ask for a refund. The monthly fee INCLUDES Pro now and the
 * page says so, which closes that particular hole — this function survives on
 * the audience argument alone.
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

/*
  canRunCheckNow() USED TO SIT HERE, AND IT WENT WITH PRO'S MANUAL BUTTON.

  It asked "may this customer start a check themselves, right now?" and returned
  true for everyone. The only client that consulted it was the AI Mentions page's
  "Check now", which has been removed: Pro's 375 checks a month are exactly the
  five weekly runs the cron needs (25 prompts × 3 engines × 5), so a manual run
  could only be taken from the cadence the subscription is sold on.

  ⚠️ THE SERVER-SIDE canRunCheckNow() IN lib/auth/entitlements.ts STAYS, and is
  not the same function. It guards /api/dashboard/tracking, which free's own
  report still calls through RunControl in prompt-ranking.tsx — free buys three
  runs on a 'once' schedule with no cron, and pressing that button is the whole
  loop. Deleting that one would break the free tier.
*/

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

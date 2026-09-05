import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { runAudit } from '@/lib/audit/run';
import { AUDIT_TIME_BUDGET_MS } from '@/lib/audit/limits';
import type { AuditReport, PageContent } from '@/lib/audit/types';
import { isAuditReport } from '@/lib/audit/types';
import { isNamedAfterDomain } from '@/lib/dashboard/domain';
import { TRACKING_PLANS, trackingPeriod } from '@/lib/dashboard/plans';
import { PAGE_BUDGET } from '@/lib/dashboard/plans';
import { trackingPlanFor } from '@/lib/auth/entitlements';
import type { ProfileRow } from '@/lib/supabase/types';
import type { ContentPlan, Engine } from '@/lib/dashboard/types';
import { buildContentPlan } from '@/lib/content-generate';
import { generateQuestions } from '@/lib/questions-generate';
import { questionKey } from '@/lib/questions';
import { ALL_ENGINES, checkBatch, PROMPTS_PER_RUN, type QuestionSlice } from '@/lib/tracking/run';

/*
  The onboarding scan: audit, then questions, then citation tracking.

  ⚠️ ONE SLICE PER CALL, ALWAYS. Every function here is written to do a bounded
  piece of work and report whether its stage is finished, because the whole
  point of the job row is that no single request has to survive the customer's
  attention span. A full first scan is a crawl of up to a hundred pages, an Opus
  call, and ~45 search-backed engine calls — minutes of work against a platform
  that gives a request about sixty seconds.

  ⚠️ THE STAGES ARE ORDERED BY DATA DEPENDENCY, NOT BY TASTE. Discovery reads
  the pages the audit crawled; tracking asks the questions discovery produced.
  That ordering is why `report` had to move into audit_runs in 0009 — before
  that, the pages existed only in a browser and no server-side scan was possible
  at all.

  ⚠️ EVERY STAGE IS SAFE TO RE-ENTER. A lease can expire mid-flight and the next
  tick will call the same stage again, so each one computes what is left from
  what is already stored rather than from a counter it kept. Tracking already
  worked this way; the other two are written to match.
*/

/* ⚠️ 'topics' IS NEW AND IT NEEDS MIGRATION 0022 IN THE DATABASE FIRST. The
   column is text, but 0010 put a check constraint on it listing the four stages
   that existed then — so without 0022 the tick route's UPDATE to 'topics' is
   rejected and every scan stalls after discovery, never reaching tracking.
   0022 swaps the constraint for one that includes it.

   A job already mid-flight when this deploys is at one of the older values and
   still advances through NEXT_STAGE below; the new stage is idempotent by
   check, so nothing double-spends. */
export type Stage = 'audit' | 'questions' | 'topics' | 'tracking' | 'done';

export type ScanJob = {
  id: string;
  site_id: string;
  user_id: string;
  stage: Stage;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: Record<string, unknown>;
  error: string | null;
};

/** What one slice did, and whether its stage is finished. */
export type SliceResult = {
  done: boolean;
  progress: Record<string, unknown>;
};

/** Refusals a stage can hit that no amount of retrying will fix. */
export class ScanFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScanFailed';
  }
}

type Db = SupabaseClient;

/* ------------------------------------------------------------- the site --- */

/**
 * Only the columns this file selects — a local shape, not lib/supabase/types.
 *
 * ⚠️ Adding a field here means adding it to the select list in siteFor() too;
 * the two are a pair, and a column named in one and missing from the other is
 * `undefined` at runtime with no type error to catch it.
 */
type SiteRow = {
  id: string;
  user_id: string;
  domain: string;
  name: string;
  industry: string | null;
  location: string | null;
  country: string | null;
  brand_name: string | null;
};

async function siteFor(db: Db, siteId: string): Promise<SiteRow> {
  const { data, error } = await db
    .from('sites')
    /* ⚠️ An explicit list, unlike dal.ts and store.ts which select('*') — a new
       column has to be added here by hand or the tracking stage computes the
       window from a fallback and silently disagrees with the rest of the app. */
    .select(
      'id, domain, name, industry, location, country, brand_name, user_id',
    )
    .eq('id', siteId)
    .single<SiteRow>();

  if (error || !data) throw new ScanFailed('That site no longer exists.');
  return data;
}

/* -------------------------------------------------------------- stage 1 --- */

/**
 * Crawl the site and store the report.
 *
 * One slice: the crawler already bounds itself with `maxPages` and a 60s
 * budget, so this either finishes or fails — there is no partial audit to
 * resume. Re-entering re-crawls, which is wasteful but correct, and the lease
 * makes it rare.
 *
 * ⚠️ Writes the same three things the interactive route does — the run row, the
 * report, and the inferred business name — because the customer must not be
 * able to tell whether their audit came from the scan or from the button.
 */
export async function runAuditStage(db: Db, job: ScanJob): Promise<SliceResult> {
  const site = await siteFor(db, job.site_id);

  /*
    ⚠️ THE BUDGET FOLLOWS THE PLAN, AND HARDCODING IT WAS A REAL BUG.

    This read `depth: 'full'` with `maxPages: PAGE_BUDGET.pro`, which was correct
    for as long as this scan only ever ran after somebody had paid $129 — there
    was no such thing as a free scan. The free tier moved the trigger to signup
    and left this behind, so every free account was getting a hundred-page Pro
    audit: about 100× the intended crawl of somebody else's server per signup,
    and a free tier that already did the thing the pricing page sells as Pro's.

    ⚠️ `depth` IS NOT COSMETIC EITHER. audit_runs.depth is stored, and its column
    comment is blunt: "Quick and full runs are not comparable — never plot them
    on one line." A one-page free audit written as 'full' puts a 3-check score
    and a 44-check score on the same trend line, so the day somebody upgrades
    their score appears to collapse.
  */
  /* `owner`, not `profile` — this function already has a local `profile` further
     down, holding the industry/location patch read off the site's own markup. */
  const { data: owner } = await db
    .from('profiles')
    .select('plan')
    .eq('id', job.user_id)
    .maybeSingle();

  const pro = (owner as { plan?: string } | null)?.plan === 'pro';

  const result = await runAudit(`https://${site.domain}`, {
    depth: pro ? 'full' : 'quick',
    budget: {
      maxPages: pro ? PAGE_BUDGET.pro : PAGE_BUDGET.free,
      maxMs: AUDIT_TIME_BUDGET_MS,
    },
  });

  if (!result.ok) {
    throw new ScanFailed(`We couldn't read ${site.domain}. Check the address and try again.`);
  }

  const report = result.report;

  /*
    The business's real name, for mention matching later in the tracking stage.
    A name that is just the domain teaches us nothing sites.name did not already
    say, so writing it would look like we had learned something.
  */
  const found = report.profile?.name?.trim();
  if (found && found.length > 1 && found.length <= 120 && !isNamedAfterDomain(found, site.domain)) {
    await db.from('sites').update({ brand_name: found }).eq('id', site.id);
  }

  /*
    Industry and location feed the question prompt in the next stage. Only
    written when the customer has not set them by hand — 'manual' means a person
    decided, and a crawl must not overrule that.
  */
  const profile: Record<string, string> = {};
  if (report.profile?.industry) profile.industry = report.profile.industry;
  if (report.profile?.location) profile.location = report.profile.location;
  if (Object.keys(profile).length) {
    await db
      .from('sites')
      .update({ ...profile, profile_source: 'schema' })
      .eq('id', site.id)
      .neq('profile_source', 'manual');
  }

  await db.from('audit_runs').insert({
    site_id: site.id,
    user_id: job.user_id,
    score: report.score,
    scored_count: report.scoredCount,
    depth: report.depth,
    pillar_scores: Object.fromEntries(
      report.pillars.filter((p) => p.score !== null).map((p) => [p.id, p.score as number]),
    ),
    report,
    checked_at: report.checkedAt,
  });

  await seedFirstGroup(db, job, site, report);

  return { done: true, progress: { pagesRead: report.pages?.length ?? 0, score: report.score } };
}

/**
 * The first page on the Content screen, made from the page we just crawled.
 *
 * ⚠️ WHY THIS EXISTS: Content opened on "No pages yet" for every new account.
 * A group is the thing answers hang off, and nothing created one until the
 * customer did — so the screen that holds a free plan's whole allowance greeted
 * them with an empty state and a form, immediately after a scan that had just
 * read the very page this row describes. The crawl already knows the page; the
 * customer typing its name back in was ceremony.
 *
 * ⚠️ A ROW, NOT A GENERATION. This writes a container and no content. Filling it
 * would mean spending the free plan's one set of answers on a page nobody chose
 * — and, worse, publishing model output the customer never accepted, which
 * scan-progress.tsx states as the reason the answers stage does not exist.
 *
 * ⚠️ FAILURES ARE SWALLOWED. An empty Content screen is a poor welcome; a failed
 * scan is a broken product. The `path` unique constraint per site is the likely
 * one — a customer who already made "/" between the queue and this line — and
 * being second is a reason to do nothing, not to fail.
 */
async function seedFirstGroup(
  db: Db,
  job: ScanJob,
  site: SiteRow,
  report: AuditReport,
): Promise<void> {
  try {
    const { count } = await db
      .from('faq_groups')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', site.id);

    if ((count ?? 0) > 0) return;

    /* Nothing crawled, nothing to describe. A group pointing at a page we never
       reached would be a container for answers about an unknown. */
    if ((report.pages ?? []).length === 0) return;

    /*
      Named the way a person would name it rather than by the page's <title>:
      titles are written for search engines and run to sixty characters of
      keywords, which is not a label for a list.

      "/" for the reason the column's own note in 0009 gives — the site row owns
      the domain, and a full URL here would let the two disagree.
    */

    await db.from('faq_groups').insert({
      id: `grp_${crypto.randomUUID()}`,
      site_id: site.id,
      user_id: job.user_id,
      name: 'Home page',
      path: '/',
      position: 0,
    });
  } catch (err) {
    console.error('Could not seed the first content group:', err);
  }
}

/* -------------------------------------------------------------- stage 2 --- */

/** The newest stored report for a site, or null. */
async function latestReport(db: Db, siteId: string): Promise<AuditReport | null> {
  const { data } = await db
    .from('audit_runs')
    .select('report')
    .eq('site_id', siteId)
    .not('report', 'is', null)
    .order('checked_at', { ascending: false })
    .limit(1);

  const report = data?.[0]?.report;
  // Dropped rather than coerced when the shape no longer matches — the same
  // rule the store follows. A partial report would produce partial questions.
  return isAuditReport(report) ? report : null;
}

/**
 * Ask Claude what this site's customers would put to an assistant.
 *
 * ⚠️ Idempotent by check, not by hope. If the site already has questions the
 * stage returns immediately — a re-entry after an expired lease must not spend
 * another Opus call, and must not replace a list the customer may already have
 * started editing.
 */
export async function runQuestionsStage(db: Db, job: ScanJob): Promise<SliceResult> {
  const site = await siteFor(db, job.site_id);

  const { count: existing } = await db
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('site_id', site.id);

  if ((existing ?? 0) > 0) return { done: true, progress: { questions: existing } };

  const report = await latestReport(db, site.id);
  if (!report) {
    throw new ScanFailed('The site check did not produce any pages to read.');
  }

  const result = await generateQuestions({
    domain: site.domain,
    industry: site.industry,
    location: site.location,
    pages: (report.pages ?? []) as PageContent[],
  });

  if (!result.ok) throw new ScanFailed(result.error);

  /*
    Deduplicated on the normalised key before insert, because the model can
    return two spellings of one question and each would otherwise become a
    separate prompt against the customer's allowance.

    ⚠️ The stored text is the model's exact wording, not the normalised key —
    tracked_prompts is joined to this by plain string equality (see 0006), and a
    normalised value here would break the loop that marks a question covered.
  */
  const seen = new Set<string>();
  const rows = result.questions
    .filter((q) => {
      const text = q.question?.trim();
      if (!text) return false;
      const key = questionKey(text);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    /*
      ⚠️ STORED AT THE PRO CEILING, NOT AT THE ACCOUNT'S OWN CAP, AND ON PURPOSE.

      This used to slice to the caller's discoveredCap, which was right when
      discovery only ran for a plan that had paid for it. It runs for free
      signups now, and a free account's cap is 3 — so slicing here would throw
      away twelve questions this one model call already produced and already
      paid for, then charge a second call to get them back the moment somebody
      upgrades.

      What free actually gets is a SAMPLE: the rows are all stored, and
      questionCapFor() in lib/dashboard/plans.ts shows five of them. Upgrading
      reveals the rest instantly with no waiting and no second call.

      That display cap is a product gate, not a security boundary — the rows are
      the customer's own and readable under RLS. The thing that is genuinely
      gated is running discovery AGAIN, which costs money and is refused
      server-side in app/api/dashboard/questions.
    */
    .slice(0, TRACKING_PLANS.pro.discoveredCap)
    .map((q, i) => ({
      id: `q_${crypto.randomUUID()}`,
      site_id: site.id,
      user_id: job.user_id,
      question: q.question.trim(),
      why: q.why?.trim() || null,
      intent: q.intent ?? null,
      covered: false,
      source: 'discovered',
      /*
        ⚠️ THE MODEL'S RANKING, WRITTEN DOWN. buildQuestionsPrompt asks for the
        questions in priority order and the tracking stage below takes the top
        `promptCap` of them — three, on free. That only means anything if the
        order survives the round trip, and until this line it did not.

        Every row here goes in on one INSERT, so they share `added_at` to the
        microsecond; ordering by it returned them in whatever order Postgres
        felt like. A free account's three tracked prompts were effectively
        arbitrary while the code read as though they were the best three.

        questions.position already exists for exactly this (0015, modelled on
        faqs.position) and the store already knows the swap-two-positions
        idiom for reordering. Nothing new to migrate — it was simply never
        populated here.
      */
      position: i,
    }));

  if (rows.length) {
    const { error } = await db.from('questions').insert(rows);
    if (error) throw new ScanFailed('The questions could not be saved.');
  }

  return { done: true, progress: { questions: rows.length } };
}

/* -------------------------------------------------------------- stage 3 --- */

/**
 * Ten things worth writing, built from the same crawl discovery just read.
 *
 * ⚠️ THIS STAGE EXISTS SO THE CONTENT SCREEN IS NOT EMPTY ON DAY ONE. The plan
 * used to be built only by a button press, so a new account — free especially,
 * where this is most of what they get — landed on "Build your content plan" and
 * a blank page after watching a scan tell them their site was hard to quote.
 *
 * ⚠️ A FAILURE HERE DOES NOT FAIL THE SCAN, AND THAT IS THE WHOLE POINT OF THE
 * try/catch BELOW. Every other stage throws ScanFailed because the thing it
 * produces is the product; a topic list is a head start. Tracking runs after
 * this one, and killing the job — and with it the citation checks the customer
 * actually signed up to see — because a suggestion list timed out would trade
 * the valuable half for the cheap half. The Content screen keeps its own
 * "Build the plan" button, so an account that lands here with nothing is one
 * click from the same result.
 */
export async function runTopicsStage(db: Db, job: ScanJob): Promise<SliceResult> {
  const site = await siteFor(db, job.site_id);

  /*
    Idempotent by check, like discovery above. A lease can expire mid-call, and
    a second Opus call would both cost again and overwrite a plan the customer
    may already have dismissed topics from — hiddenTopics lives inside this same
    jsonb blob.
  */
  const { count: existing } = await db
    .from('content_plans')
    .select('id', { count: 'exact', head: true })
    .eq('site_id', site.id);

  /* ⚠️ NO `topics` COUNT ON THIS PATH. `existing` counts content_plans ROWS —
     always 1, since the table is one plan per site — and reporting it as the
     progress field would put "1 topic to write" under a ticked line describing
     a plan of ten. The modal renders a stage with nothing to report as its
     label alone, which is the honest outcome for a stage that did nothing. */
  if ((existing ?? 0) > 0) return { done: true, progress: {} };

  try {
    const report = await latestReport(db, site.id);
    const pages = (report?.pages ?? []) as PageContent[];
    if (pages.length === 0) return { done: true, progress: { topics: 0 } };

    const result = await buildContentPlan({
      domain: site.domain,
      industry: site.industry,
      location: site.location,
      hint: report?.profileHint ?? '',
      pages,
    });

    if (!result.ok) {
      console.error('Scan topics stage skipped:', result.error);
      return { done: true, progress: { topics: 0 } };
    }

    /*
      mustHave arrives already emptied when the crawl was a single page — a free
      audit reads the home page and nothing else, and "we did not look" must not
      render as "you are missing". buildContentPlan owns that rule so the button
      on the Content screen obeys it too; the long note is at the point it is
      applied.
    */
    const plan: ContentPlan = {
      siteId: site.id,
      industry: result.plan.profile.industry,
      location: result.plan.profile.location || null,
      mustHave: result.plan.mustHave,
      topics: result.plan.topics,
      generatedAt: new Date().toISOString(),
    };

    const { error } = await db
      .from('content_plans')
      .upsert(
        { id: `plan_${crypto.randomUUID()}`, site_id: site.id, user_id: job.user_id, plan },
        { onConflict: 'site_id' },
      );

    if (error) {
      console.error('Scan topics stage could not save:', error.message);
      return { done: true, progress: { topics: 0 } };
    }

    return { done: true, progress: { topics: plan.topics.length } };
  } catch (err) {
    console.error('Scan topics stage failed:', err);
    return { done: true, progress: { topics: 0 } };
  }
}

/* -------------------------------------------------------------- stage 4 --- */

/**
 * Key for one question × engine pair.
 *
 * ⚠️ NUL AS AN ESCAPE, NEVER AS A LITERAL BYTE. Questions carry spaces and
 * punctuation, so a printable delimiter could collide — but a raw NUL in the
 * source makes the whole file non-text, and `grep` then skips it in silence.
 * That has already cost this project an afternoon once. Same call, and the same
 * reasoning, as the tracking route and lib/dashboard/store.ts.
 */
function pairKey(question: string, engine: Engine): string {
  return `${question}\u0000${engine}`;
}

/**
 * Ask the engines one batch of questions.
 *
 * ⚠️ THE ONLY MULTI-SLICE STAGE, and the reason the job row exists. 15
 * questions across 3 engines is 45 search-backed calls; five questions is about
 * as much as fits in one request. It returns `done: false` until nothing is
 * pending, and the runner calls it again.
 *
 * Deliberately mirrors app/api/dashboard/tracking/route.ts rather than sharing
 * a body with it: that route has to defend against a client-supplied question
 * list and charge a rate limit to a browser. Here the list comes off our own
 * table and the caller is us.
 */
export async function runTrackingStage(db: Db, job: ScanJob): Promise<SliceResult> {
  const site = await siteFor(db, job.site_id);

  /*
    ⚠️ THE OWNER'S PLAN, READ FROM THE PROFILE — NOT ASSUMED.

    This used to pass a literal, which was harmless only while both plans had
    identical caps. Free watches 5 questions and Pro 25, so a literal here would
    either hold a paying subscriber to the smaller list on every weekly run, or
    hand a free signup five times the checks their tier is priced for.
  */
  const { data: profile } = await db
    .from('profiles')
    .select('plan, plan_since, created_at')
    .eq('id', job.user_id)
    .maybeSingle();

  const plan = trackingPlanFor((profile as ProfileRow | null) ?? null);

  /*
    ⚠️ BY position, NOT added_at — THE SAME CALL lib/dashboard/store.ts MADE AT
    0015 AND THIS STAGE MISSED. Discovery writes all fifteen rows on one INSERT,
    so their added_at values are identical and ordering by that column put the
    slice below in an order Postgres never promised. The questions stage now
    records the model's ranking in `position`; this reads it back.

    added_at stays as the tiebreaker for anything typed in later — a manual
    question and a discovered one can share a position, and a stable order beats
    an arbitrary one even where the choice barely matters.
  */
  const { data: questionRows } = await db
    .from('questions')
    .select('question')
    .eq('site_id', site.id)
    .order('position')
    .order('added_at');

  /*
    Capped to the plan, best first.

    ⚠️ THIS SLICE IS NEW AND IT IS NOT COSMETIC. The list used to be taken whole,
    which was survivable when the interactive route capped it on the way in.
    A scheduled check has no browser in front of it, so an account that
    accumulated 40 questions would have asked all 40 — nearly triple what the
    window is priced for, four times over.
  */
  const wanted = [...new Set((questionRows ?? []).map((r) => r.question as string))].slice(
    0,
    plan.promptCap,
  );
  if (wanted.length === 0) return { done: true, progress: { checked: 0, remaining: 0 } };

  // Mirrored into tracked_prompts so the rest of the product sees this list the
  // same way it sees one built by the interactive route.
  await db
    .from('tracked_prompts')
    .upsert(
      wanted.map((question) => ({ site_id: site.id, user_id: job.user_id, question })),
      { onConflict: 'site_id,question', ignoreDuplicates: true },
    );

  /*
    ⚠️ THE PAIR IS THE UNIT, NOT THE QUESTION. Engines fail one at a time —
    Perplexity 429'd twelve of fifteen checks in one real run while the other
    two were fine. Treating a question as finished because some engine answered
    it would strand the rest until midnight UTC, on questions already part-paid
    for, and the report would quietly under-count that engine.
  */
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);

  const { data: doneRows } = await db
    .from('citation_checks')
    .select('question, engine')
    .eq('site_id', site.id)
    .gte('checked_at', since.toISOString());

  const done = new Set(
    (doneRows ?? []).map((r) => pairKey(r.question as string, r.engine as Engine)),
  );

  const pending: QuestionSlice[] = wanted
    .map((question) => ({
      question,
      engines: ALL_ENGINES.filter((engine) => !done.has(pairKey(question, engine))),
    }))
    .filter((slice) => slice.engines.length > 0);

  const total = wanted.length;
  if (pending.length === 0) {
    return { done: true, progress: { checked: total, remaining: 0, total } };
  }

  /*
    The budget — TWO ceilings, and a job has to clear both.

    ⚠️ A RUN IS ALSO COUNTED AGAINST ITSELF, NOT ONLY AGAINST THE PERIOD.

    This used to key off `job.milestone_id`, because Get Cited's period ceiling
    was exactly what its five scheduled checks added up to with nothing spare, so
    a check that half-failed and retried the next day would eat the allowance of
    the check after it. The same hazard survives the move to weekly: a run that
    dies mid-slice and resumes tomorrow would otherwise spend twice out of one
    month's 375, and by the fifth week of a bad month the customer silently
    stops getting checked.

    So a job gets its own allowance — `promptCap × engines`, counted from the
    moment the job row was created — AND the period ceiling still applies. The
    first stops one run from eating the month; the second stops the month from
    being exceeded however many runs there are. Taking the lower of the two is
    the only version that holds both.
  */
  const [jobLeft, periodLeft] = await Promise.all([
    jobBudget(db, site.id, job.id, plan.promptCap * ALL_ENGINES.length),
    periodBudget(db, site.id, profile as ProfileRow | null, plan.checksPerPeriod),
  ]);

  const budget = Math.min(jobLeft, periodLeft);

  if (budget <= 0) {
    return { done: true, progress: { checked: total - pending.length, remaining: 0, total } };
  }

  const batch = pending.slice(0, PROMPTS_PER_RUN);

  const { outcomes } = await checkBatch(batch, {
    domain: site.domain,
    country: site.country,
    // The name the engines would actually say, falling back to the label.
    name: site.brand_name ?? site.name,
  });

  if (outcomes.length > 0) {
    await db.from('citation_checks').insert(
      outcomes.map((o) => ({
        site_id: site.id,
        user_id: job.user_id,
        question: o.question,
        engine: o.engine,
        outcome: o.outcome,
        cited_instead: o.citedInstead,
        sources: o.sources,
        answer_excerpt: o.excerpt,
        // Null for Gemini always: it rejects a location parameter, so stamping
        // it would record a targeting that did not happen.
        country: o.engine === 'Gemini' ? null : site.country,
      })),
    );
  }

  const remaining = pending.length - batch.length;
  return {
    done: remaining === 0,
    progress: { checked: total - remaining, remaining, total },
  };
}

/* ------------------------------------------------------------ dispatch --- */

/**
 * What THIS job has left of its own allowance.
 *
 * Counted from when the job row was created rather than from the period's
 * start, so this answers "what has this run spent", not "what has this customer
 * ever spent". A job that resumes after a dead lease keeps the same created_at
 * and therefore the same allowance, which is the point: resuming a run is not a
 * second run.
 *
 * ⚠️ scan_jobs.created_at, NOT the lease. The lease moves every time a slice is
 * claimed, so counting from it would hand each slice a fresh full allowance and
 * make this ceiling meaningless.
 */
async function jobBudget(db: Db, siteId: string, jobId: string, allowance: number): Promise<number> {
  const { data: row } = await db
    .from('scan_jobs')
    .select('created_at')
    .eq('id', jobId)
    .maybeSingle();

  const since = (row as { created_at: string | null } | null)?.created_at;
  if (!since) return allowance;

  const { count } = await db
    .from('citation_checks')
    .select('*', { count: 'exact', head: true })
    .eq('site_id', siteId)
    .gte('checked_at', since);

  return allowance - (count ?? 0);
}

/**
 * What the current period has left — the plan's real ceiling.
 *
 * On free that period never ends, so this is a LIFETIME count and it is the only
 * thing standing between one free signup and unlimited engine calls. On Pro it
 * resets on the billing anniversary.
 */
async function periodBudget(
  db: Db,
  siteId: string,
  profile: ProfileRow | null,
  ceiling: number,
): Promise<number> {
  const period = trackingPeriod({
    plan: profile?.plan === 'pro' ? 'pro' : 'free',
    planSince: profile?.plan_since ?? null,
    accountCreatedAt: profile?.created_at ?? null,
  });

  if (!period) return 0;

  const { count } = await db
    .from('citation_checks')
    .select('*', { count: 'exact', head: true })
    .eq('site_id', siteId)
    .gte('checked_at', period.start.toISOString());

  return ceiling - (count ?? 0);
}

/*
  ⚠️ topics SITS BEFORE tracking, NOT AFTER IT. Both orderings work on the data
  — topics needs the audit, tracking needs the questions — so the tie is broken
  on what the customer is looking at. Tracking is the long tail: ~45 engine
  calls that re-enter over minutes, which is why the report says "we're asking
  AI about you now". Putting one bounded Opus call ahead of it means the Content
  screen is populated by the time anyone finishes reading their report, at the
  cost of starting the citation checks about half a minute later. After it, the
  screen would stay empty for the whole of the slowest stage.
*/
export const NEXT_STAGE: Record<Stage, Stage> = {
  audit: 'questions',
  questions: 'topics',
  topics: 'tracking',
  tracking: 'done',
  done: 'done',
};

export async function runStage(db: Db, job: ScanJob): Promise<SliceResult> {
  switch (job.stage) {
    case 'audit':
      return runAuditStage(db, job);
    case 'questions':
      return runQuestionsStage(db, job);
    case 'topics':
      return runTopicsStage(db, job);
    case 'tracking':
      return runTrackingStage(db, job);
    default:
      return { done: true, progress: {} };
  }
}

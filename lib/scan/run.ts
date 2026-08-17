import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { runAudit } from '@/lib/audit/run';
import { AUDIT_TIME_BUDGET_MS } from '@/lib/audit/limits';
import type { AuditReport, PageContent } from '@/lib/audit/types';
import { isAuditReport } from '@/lib/audit/types';
import { isNamedAfterDomain } from '@/lib/dashboard/domain';
import { DISCOVERED_PROMPT_CAP, TRACKING_CHECKS_PER_PERIOD, trackingPeriod } from '@/lib/dashboard/plans';
import { PAGE_BUDGET } from '@/lib/dashboard/plans';
import type { Engine } from '@/lib/dashboard/types';
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

export type Stage = 'audit' | 'questions' | 'tracking' | 'done';

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

type SiteRow = {
  id: string;
  domain: string;
  name: string;
  industry: string | null;
  location: string | null;
  country: string | null;
  brand_name: string | null;
  get_cited_at: string | null;
};

async function siteFor(db: Db, siteId: string): Promise<SiteRow> {
  const { data, error } = await db
    .from('sites')
    .select('id, domain, name, industry, location, country, brand_name, get_cited_at')
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

  const result = await runAudit(`https://${site.domain}`, {
    depth: 'full',
    budget: { maxPages: PAGE_BUDGET.paid, maxMs: AUDIT_TIME_BUDGET_MS },
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

  return { done: true, progress: { pagesRead: report.pages?.length ?? 0, score: report.score } };
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
    .slice(0, DISCOVERED_PROMPT_CAP)
    .map((q) => ({
      id: `q_${crypto.randomUUID()}`,
      site_id: site.id,
      user_id: job.user_id,
      question: q.question.trim(),
      why: q.why?.trim() || null,
      intent: q.intent ?? null,
      covered: false,
      source: 'discovered',
    }));

  if (rows.length) {
    const { error } = await db.from('questions').insert(rows);
    if (error) throw new ScanFailed('The questions could not be saved.');
  }

  return { done: true, progress: { questions: rows.length } };
}

/* -------------------------------------------------------------- stage 3 --- */

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

  const { data: questionRows } = await db
    .from('questions')
    .select('question')
    .eq('site_id', site.id)
    .order('added_at');

  const wanted = [...new Set((questionRows ?? []).map((r) => r.question as string))];
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
    The period budget, enforced here as it is in the interactive route. A scan
    is the customer's first spend against it, so this will almost never bite —
    but a job that ignored the ceiling would be a way to bypass it entirely.
  */
  const period = trackingPeriod({
    getCitedAt: site.get_cited_at,
    subscription: 'none',
    subscriptionSince: null,
  });

  if (period) {
    const { count: spent } = await db
      .from('citation_checks')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', site.id)
      .gte('checked_at', period.start.toISOString());

    if (TRACKING_CHECKS_PER_PERIOD - (spent ?? 0) <= 0) {
      return { done: true, progress: { checked: total - pending.length, remaining: 0, total } };
    }
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

export const NEXT_STAGE: Record<Stage, Stage> = {
  audit: 'questions',
  questions: 'tracking',
  tracking: 'done',
  done: 'done',
};

export async function runStage(db: Db, job: ScanJob): Promise<SliceResult> {
  switch (job.stage) {
    case 'audit':
      return runAuditStage(db, job);
    case 'questions':
      return runQuestionsStage(db, job);
    case 'tracking':
      return runTrackingStage(db, job);
    default:
      return { done: true, progress: {} };
  }
}

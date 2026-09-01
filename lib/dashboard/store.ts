/**
 * The data layer — the one file that knows where dashboard data lives.
 *
 * Today that's localStorage. Tomorrow it's Supabase. Every function is async
 * and takes/returns plain model objects, so swapping the body of this module
 * for real queries changes nothing above it: no component imports localStorage,
 * and no component builds an id or a timestamp.
 *
 * Each mutation returns the whole updated snapshot rather than just the row it
 * touched. Against a real backend you'd return the row and refetch, but here a
 * write is synchronous and free, and handing the caller a complete snapshot
 * keeps the provider to a single setState with no chance of the two drifting.
 *
 * Ownership runs site → group → answer. Answers no longer know their site;
 * they know their group, and the group knows the site. Anything needing
 * site-wide answers goes through faqsForSite() rather than reaching past the
 * group.
 *
 * SSR: every entry point throws if called on the server. That's deliberate —
 * silently returning empty data would hide a real bug (a Server Component
 * trying to read user state) behind an empty dashboard.
 */

import { isAuditReport } from '@/lib/audit/types';
import { questionKey } from '@/lib/questions';
import { createClient as supabaseBrowser } from '@/lib/supabase/client';
import type {
  ActionTickRow,
  AuditRunRow,
  CitationCheckRow,
  CompetitorRow,
  FaqGroupRow,
  FaqRow,
  QuestionRow,
  SiteRow,
} from '@/lib/supabase/types';
import { normalizeDomain, sourceHost } from './domain';
import { sourceKind } from './platforms';
import { contentHash, normalizePath } from './export';
import type { TrackingPeriod } from './plans';
import {
  canAddSite,
  faqCapFor,
  SITE_CAP,
  TRACKING_PLANS,
  trackingPlanFor,
  type TrackingPlan,
} from './plans';
import { buildSeed, emptyTracking, newId } from './seed';
import { ENGINES } from './types';
import { sameReport } from './types';
import type {
  CitationCheck,
  CitationDay,
  ActionTick,
  CitedPage,
  Competitor,
  CompetitorShare,
  EngineBreakdown,
  ContentPlan,
  DashboardData,
  DiscoveredQuestion,
  Engine,
  FaqEntry,
  FaqGroup,
  Site,
  SiteAudit,
  SiteTracking,
  User,
} from './types';

/*
  v5: accounts arrived.

  `user` and `sites` no longer live here at all — they are rows in Postgres,
  because the server has to be able to check who you are and what you have
  bought, and it cannot do that against a browser's localStorage. What remains
  local is everything the server does not yet need to police: groups, answers,
  discovered questions, tracking and content plans.

  The key is namespaced by account id. Before this, one browser had one
  dashboard; now two people can sign into the same browser, and an unnamespaced
  key would hand the second one the first one's answers.

  (v4: site.lastAudit became the full audit report. v3: answers moved from
  site-scoped to group-scoped.)
*/
const STORAGE_PREFIX = 'faqflo.dashboard.v5';

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}.${userId}`;
}

/**
 * Who this browser session is acting as.
 *
 * Module-scoped because every mutation below returns the whole snapshot and so
 * needs to know which account's local half to merge — threading a user id
 * through forty call sites would change every component for no behavioural
 * gain. Set by loadDashboard() and by nothing else.
 *
 * It is safe only because this module is client-only and one tab is one
 * account: signing out navigates away and unmounts the provider, which is what
 * clears it. `assertClient` is what keeps that promise true.
 */
let activeUserId: string | null = null;

function assertClient(fn: string): void {
  if (typeof window === 'undefined') {
    throw new Error(`${fn} is client-only — call it from an effect or an event handler.`);
  }
}

/**
 * The parts of the snapshot that still live in the browser.
 *
 * `audits` is keyed by site id rather than hanging off the site object, because
 * sites are Postgres rows now and the report is not one of their columns. A
 * report is a large blob only its own account reads; moving it to the database
 * buys nothing until it needs to be shared across devices, which is the next
 * migration rather than this one.
 */
type LocalData = Omit<DashboardData, 'user' | 'sites'> & {
  audits: Record<string, SiteAudit>;
};

const EMPTY_LOCAL: LocalData = {
  groups: [],
  faqs: [],
  questions: [],
  tracking: [],
  contentPlans: [],
  competitors: [],
  actionTicks: [],
  audits: {},
};

/**
 * What Postgres held as of the last read or write.
 *
 * ⚠️ THIS IS A CACHE, NOT THE TRUTH, AND THE DISTINCTION IS THE WHOLE DESIGN.
 *
 * Every mutation below still builds the next complete snapshot in memory and
 * hands it back in one piece — that contract is why no component knows where
 * data lives. What changed in 0009 is the other end: write() now diffs the
 * snapshot it is given against this cache and sends only the rows that moved.
 *
 * Diffing rather than rewriting is not an optimisation. localStorage could be
 * clobbered whole on every keystroke because it was one synchronous string;
 * doing the same to Postgres would mean deleting and re-inserting a customer's
 * entire content on every edit, which loses ids, races other tabs, and turns a
 * one-word fix into a hundred round trips.
 */
let localCache: LocalData | null = null;

/** The browser copy, read only to migrate it — see importLegacyLocal(). */
function readLegacyLocal(userId: string): LocalData | null {
  const raw = window.localStorage.getItem(storageKey(userId));
  if (!raw) return null;
  try {
    return normaliseLocal(JSON.parse(raw) as LocalData);
  } catch {
    window.localStorage.removeItem(storageKey(userId));
    return null;
  }
}

/**
 * Repair what a stored snapshot can't be trusted to contain.
 *
 * Bumping the storage key covers a shape change that has already landed, but
 * not a payload written *while* one was landing — a browser open through a
 * deploy can persist a half-old record under the new key and replay it forever.
 * Rather than let that reach the UI and crash on the first missing array, a
 * stored audit that no longer matches the report shape is dropped, and the
 * Audit page offers to run a fresh one.
 *
 * Dropping beats coercing: a partial report shown as though it were whole would
 * put numbers on screen that nothing measured.
 */
function normaliseLocal(data: LocalData): LocalData {
  /*
    Stored audits are still dropped rather than coerced when they no longer
    match the report shape — a partial report shown as though it were whole
    would put numbers on screen that nothing measured. The Audit page offers to
    run a fresh one.
  */
  const audits: Record<string, SiteAudit> = {};
  for (const [siteId, report] of Object.entries(data.audits ?? {})) {
    if (isAuditReport(report)) audits[siteId] = report;
  }

  return {
    groups: data.groups ?? [],
    faqs: data.faqs ?? [],
    /* ⚠️ BACKFILL position BY INDEX, NEVER TO A CONSTANT. Rows cached before
       0015 have no position, and defaulting them all to 0 would leave the order
       to however the array happened to be stored — a silent reshuffle of a list
       the customer has already read. The array order IS the old order. */
    questions: (data.questions ?? []).map((q, i) => ({ ...q, position: q.position ?? i })),
    tracking: (data.tracking ?? []).map(normaliseTracking),
    contentPlans: data.contentPlans ?? [],
    competitors: data.competitors ?? [],
    actionTicks: data.actionTicks ?? [],
    audits,
  };
}

/**
 * Bring a stored tracking record up to the current shape.
 *
 * The budget changed unit — from "engine queries" to "prompts, with checks as
 * their cost" — and a record written before that has no promptsTracked at all,
 * which reaches the UI as formatNumber(undefined) and throws.
 *
 * Repaired rather than dropped, because unlike an audit this data can't be
 * regenerated by pressing a button: it's a history of checks that already ran.
 *
 * ⚠️ The one thing this must NOT do is turn the old `queryCap` into a prompt
 * cap. They are different units — 420 engine checks is 35 prompts across three
 * engines run four times — and equating them is precisely the conflation the
 * new model exists to prevent. The prompt allowance comes from the plan; only
 * `checksUsed`, which really is the same unit as the old `queriesUsed`,
 * carries over.
 */
function normaliseTracking(raw: SiteTracking): SiteTracking {
  const legacy = raw as Partial<SiteTracking> & { queriesUsed?: number };
  const latest = raw.latest ?? [];

  return {
    ...raw,
    daily: raw.daily ?? [],
    latest,
    competitors: raw.competitors ?? [],
    // How many distinct questions we're actually watching — derived from the
    // checks themselves rather than guessed.
    promptsTracked:
      typeof legacy.promptsTracked === 'number'
        ? legacy.promptsTracked
        : new Set(latest.map((c) => c.question)).size,
    /* Hydrating a snapshot written before these fields existed. The plan is not
       knowable from the blob, so the wider of the two is used — a stored figure
       that is too generous shows a meter with room in it, while one that is too
       tight would tell a subscriber they were out of allowance they had paid
       for. Both are replaced by trackingFromDb() on the next real read. */
    promptCap:
      typeof legacy.promptCap === 'number' ? legacy.promptCap : TRACKING_PLANS.pro.promptCap,
    runsPerPeriod:
      typeof legacy.runsPerPeriod === 'number'
        ? legacy.runsPerPeriod
        : TRACKING_PLANS.pro.runsPerPeriod,
    checksUsed:
      typeof legacy.checksUsed === 'number'
        ? legacy.checksUsed
        : typeof legacy.queriesUsed === 'number'
          ? legacy.queriesUsed
          : latest.length,
    /* ⚠️ Null is a real value here now — free's allowance never resets — so this
       cannot use `??` to substitute a date. An absent field on an old blob and a
       deliberate "never" are indistinguishable in the stored shape, and inventing
       a reset date is the worse of the two errors: it promises a refill that will
       not come. trackingFromDb() replaces it on the next real read either way. */
    periodResetsAt: raw.periodResetsAt ?? null,
  };
}

/* ------------------------------------------------------- row mapping --- */

/*
  snake_case at the boundary, camelCase above it — the same explicit mapping
  toSite() has always done for sites. Written out rather than generated so a
  column rename breaks the build instead of becoming an undefined field.
*/

function groupToRow(g: FaqGroup, userId: string) {
  return {
    id: g.id,
    site_id: g.siteId,
    user_id: userId,
    name: g.name,
    path: g.path,
    position: g.position,
    published_at: g.publishedAt,
    published_hash: g.publishedHash,
    created_at: g.createdAt,
  };
}

function rowToGroup(r: FaqGroupRow): FaqGroup {
  return {
    id: r.id,
    siteId: r.site_id,
    name: r.name,
    path: r.path,
    position: r.position,
    createdAt: r.created_at,
    publishedAt: r.published_at,
    publishedHash: r.published_hash,
  };
}

function faqToRow(f: FaqEntry, userId: string) {
  return {
    id: f.id,
    group_id: f.groupId,
    user_id: userId,
    question: f.question,
    answer: f.answer,
    status: f.status,
    position: f.position,
    source: f.source,
    tone: f.tone,
    language: f.language,
    created_at: f.createdAt,
    updated_at: f.updatedAt,
  };
}

function rowToFaq(r: FaqRow): FaqEntry {
  return {
    id: r.id,
    groupId: r.group_id,
    question: r.question,
    answer: r.answer,
    status: r.status,
    position: r.position,
    source: r.source,
    tone: (r.tone ?? 'Professional') as FaqEntry['tone'],
    language: (r.language ?? 'English') as FaqEntry['language'],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function questionToRow(q: DiscoveredQuestion, userId: string) {
  return {
    id: q.id,
    site_id: q.siteId,
    user_id: userId,
    // ⚠️ Sent exactly as held. tracked_prompts is joined to this by string
    // equality — see 0006. Trimming here would break the coverage loop.
    question: q.question,
    why: q.why ?? null,
    intent: q.intent ?? null,
    covered: q.covered,
    source: q.source ?? 'discovered',
    position: q.position,
    added_at: q.addedAt,
  };
}

/*
  The competitors a customer named.

  ⚠️ NOTHING MAPS A CITATION COUNT, BECAUSE THE ROW DOES NOT HOLD ONE. How
  often AI cited a domain lives in the checks; the Competitors page joins the
  two by `domain` when it renders. See the note on Competitor in types.ts.
*/
function competitorToRow(c: Competitor, userId: string) {
  return {
    id: c.id,
    site_id: c.siteId,
    user_id: userId,
    name: c.name,
    domain: c.domain,
    position: c.position,
    created_at: c.createdAt,
  };
}

function tickToRow(t: ActionTick, userId: string) {
  return {
    id: t.id,
    site_id: t.siteId,
    user_id: userId,
    action_id: t.actionId,
    report_checked_at: t.reportCheckedAt,
    created_at: t.createdAt,
  };
}

function rowToTick(r: ActionTickRow): ActionTick {
  return {
    id: r.id,
    siteId: r.site_id,
    actionId: r.action_id,
    /* ⚠️ NORMALISED HERE SO ONE SPELLING EXISTS IN MEMORY. Postgres renders
       timestamptz as `+00:00`; the report's own stamp is a JSONB string ending
       in `Z`. Everything downstream compares with sameReport(), which parses
       both, but a single canonical form keeps a stored tick and a freshly made
       one identical — including to the diff() that decides what to upsert. */
    reportCheckedAt: new Date(r.report_checked_at).toISOString(),
    createdAt: r.created_at,
  };
}

function rowToCompetitor(r: CompetitorRow): Competitor {
  return {
    id: r.id,
    siteId: r.site_id,
    name: r.name,
    domain: r.domain,
    position: r.position ?? 0,
    createdAt: r.created_at,
  };
}

function rowToQuestion(r: QuestionRow): DiscoveredQuestion {
  return {
    id: r.id,
    siteId: r.site_id,
    question: r.question,
    why: r.why ?? undefined,
    intent: r.intent ?? undefined,
    covered: r.covered,
    source: r.source,
    position: r.position ?? 0,
    addedAt: r.added_at,
  };
}

/* ------------------------------------------------------------ the diff --- */

/**
 * Rows that were added or changed, and ids that disappeared.
 *
 * Compared by serialised value rather than by reference: every mutation above
 * rebuilds its arrays with spreads, so reference equality would report the
 * entire table as changed on every keystroke.
 */
function diff<T extends { id: string }>(
  before: T[],
  after: T[],
): { changed: T[]; removed: string[] } {
  const was = new Map(before.map((r) => [r.id, JSON.stringify(r)]));
  const changed = after.filter((r) => was.get(r.id) !== JSON.stringify(r));
  const now = new Set(after.map((r) => r.id));
  return { changed, removed: before.filter((r) => !now.has(r.id)).map((r) => r.id) };
}

/**
 * Persist the local half and hand back the whole snapshot.
 *
 * `user` and the site rows are deliberately NOT written here: they came from
 * Postgres through their own functions, and a browser that can write its own
 * copy of them is a browser deciding its own entitlements again.
 *
 * ⚠️ `audits` is no longer written by the browser at all. The report is
 * recorded server-side in the after() block in app/api/audit/route.ts, which is
 * what makes it survive the customer navigating away mid-crawl — the defect
 * that outlived every other part of this file.
 *
 * ⚠️ THE CACHE IS UPDATED ONLY AFTER THE WRITES LAND. If a round trip fails we
 * throw with the cache untouched, so the next attempt still knows the real
 * delta. Updating it first would mean one failed save silently convinced this
 * module that the row was already stored, and the change would never be
 * retried.
 */
async function write(data: DashboardData): Promise<DashboardData> {
  const userId = requireUserId('write');
  const previous = localCache ?? EMPTY_LOCAL;
  const supabase = supabaseBrowser();

  const next: LocalData = {
    groups: data.groups,
    faqs: data.faqs,
    questions: data.questions,
    tracking: data.tracking,
    contentPlans: data.contentPlans,
    competitors: data.competitors,
    actionTicks: data.actionTicks,
    // Held so assemble() can keep joining reports onto sites; never persisted
    // from here. See the note above.
    audits: previous.audits,
  };

  const groups = diff(previous.groups, next.groups);
  const faqs = diff(previous.faqs, next.faqs);
  const questions = diff(previous.questions, next.questions);
  const competitors = diff(previous.competitors, next.competitors);
  const actionTicks = diff(previous.actionTicks, next.actionTicks);

  const fail = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`Could not save your ${what}: ${error.message}`);
  };

  /*
    ⚠️ ORDER MATTERS IN BOTH DIRECTIONS.

    Groups are inserted before answers because faqs.group_id references them,
    and answers are deleted before groups for the same reason read backwards.
    The database would cascade the deletes for us, but doing it explicitly keeps
    the cache and the table agreeing about what happened.
  */
  if (groups.changed.length) {
    fail(
      'pages',
      (await supabase.from('faq_groups').upsert(groups.changed.map((g) => groupToRow(g, userId))))
        .error,
    );
  }
  if (faqs.changed.length) {
    fail(
      'answers',
      (await supabase.from('faqs').upsert(faqs.changed.map((f) => faqToRow(f, userId)))).error,
    );
  }
  if (questions.changed.length) {
    fail(
      'questions',
      (
        await supabase
          .from('questions')
          .upsert(questions.changed.map((q) => questionToRow(q, userId)))
      ).error,
    );
  }

  if (faqs.removed.length) {
    fail('answers', (await supabase.from('faqs').delete().in('id', faqs.removed)).error);
  }
  if (groups.removed.length) {
    fail('pages', (await supabase.from('faq_groups').delete().in('id', groups.removed)).error);
  }
  if (questions.removed.length) {
    fail('questions', (await supabase.from('questions').delete().in('id', questions.removed)).error);
  }
  if (competitors.changed.length) {
    fail(
      'competitors',
      (
        await supabase
          .from('competitors')
          .upsert(competitors.changed.map((c) => competitorToRow(c, userId)))
      ).error,
    );
  }
  if (competitors.removed.length) {
    fail(
      'competitors',
      (await supabase.from('competitors').delete().in('id', competitors.removed)).error,
    );
  }
  if (actionTicks.changed.length) {
    fail(
      'progress',
      (
        await supabase
          .from('audit_action_ticks')
          .upsert(actionTicks.changed.map((t) => tickToRow(t, userId)))
      ).error,
    );
  }
  if (actionTicks.removed.length) {
    fail(
      'progress',
      (await supabase.from('audit_action_ticks').delete().in('id', actionTicks.removed)).error,
    );
  }

  // One row per site, so a plan is an upsert on site_id rather than a diff.
  for (const plan of next.contentPlans) {
    const before = previous.contentPlans.find((p) => p.siteId === plan.siteId);
    if (before && JSON.stringify(before) === JSON.stringify(plan)) continue;
    fail(
      'content plan',
      (
        await supabase
          .from('content_plans')
          .upsert(
            { id: newId('plan'), site_id: plan.siteId, user_id: userId, plan },
            { onConflict: 'site_id' },
          )
      ).error,
    );
  }

  localCache = next;
  return data;
}

function requireUserId(fn: string): string {
  assertClient(fn);
  if (!activeUserId) throw new Error(`${fn} called before the dashboard was loaded.`);
  return activeUserId;
}

/** Server rows plus local data, joined on site id. One shape for every caller. */
function assemble(user: User, sites: Site[], local: LocalData): DashboardData {
  return {
    user,
    sites: sites.map((site) => ({ ...site, lastAudit: local.audits[site.id] ?? null })),
    groups: local.groups,
    faqs: local.faqs,
    questions: local.questions,
    competitors: local.competitors,
    actionTicks: local.actionTicks,
    tracking: local.tracking,
    contentPlans: local.contentPlans,
  };
}

/** The snapshot as it stands right now. */
function requireData(fn: string): DashboardData {
  requireUserId(fn);
  if (!serverHalf || !localCache) throw new Error(`${fn} called before the dashboard was loaded.`);

  return assemble(serverHalf.user, serverHalf.sites, localCache);
}

/**
 * The rows that came from Postgres, held so a mutation can return a complete
 * snapshot without re-querying everything. Their `lastAudit` is always null —
 * it is joined on in assemble() — so there is one place that knows where an
 * audit lives.
 */
let serverHalf: { user: User; sites: Site[] } | null = null;

function now(): string {
  return new Date().toISOString();
}

/**
 * Assemble the dashboard for a signed-in account.
 *
 * ⚠️ There is no `?? buildSeed()` here any more, and that absence is the point.
 * It used to mean any fresh browser silently became a fully-entitled account
 * with an active subscription — fine for a demo with no accounts, indefensible
 * once real ones exist. A new account now starts empty, which is the truth.
 *
 * The seed is still reachable for local development; see seedLocalData().
 */
export async function loadDashboard(user: User, sites: Site[]): Promise<DashboardData> {
  assertClient('loadDashboard');

  activeUserId = user.id;
  serverHalf = { user, sites };

  await importLegacyLocal(user.id, sites);
  localCache = await readFromDb(user.id, sites);

  return assemble(user, sites, localCache);
}

/**
 * Everything this account owns, in one round of queries.
 *
 * ⚠️ Scoped by user_id even though RLS already is. Belt and braces: RLS is the
 * boundary, but a filter here means a policy regression shows up as missing
 * data in development rather than as another account's answers in production.
 */
async function readFromDb(userId: string, sites: Site[]): Promise<LocalData> {
  const supabase = supabaseBrowser();
  const siteIds = sites.map((s) => s.id);

  const [groupRows, faqRows, questionRows, planRows, competitorRows, tickRows] = await Promise.all([
    supabase.from('faq_groups').select('*').eq('user_id', userId).order('position'),
    supabase.from('faqs').select('*').eq('user_id', userId).order('position'),
    /* ⚠️ BY position NOW, NOT added_at. 0015 added the column and backfilled it
       from added_at, so this returns exactly the order it used to on the day it
       shipped — and the order the owner drags it into after that. */
    supabase.from('questions').select('*').eq('user_id', userId).order('position'),
    supabase.from('content_plans').select('*').eq('user_id', userId),
    supabase.from('competitors').select('*').eq('user_id', userId).order('position'),
    supabase.from('audit_action_ticks').select('*').eq('user_id', userId),
  ]);

  const firstError =
    groupRows.error ??
    faqRows.error ??
    questionRows.error ??
    planRows.error ??
    competitorRows.error ??
    tickRows.error ??
    null;
  if (firstError) {
    /*
      ⚠️ THROW RATHER THAN FALL BACK TO EMPTY. An empty dashboard is
      indistinguishable from a new account, so a transient read failure would
      look exactly like "your answers are gone" — and the customer's next move
      would be to write them again on top of rows that still exist.
    */
    throw new Error(`Could not load your dashboard: ${firstError.message}`);
  }

  /*
    Audit reports come back attached to their newest run, not from a table of
    their own. Only the latest per site is read: the Audit page renders one
    report, and the trend it plots is the score column, which auditHistory()
    reads separately.
  */
  const audits: Record<string, SiteAudit> = {};
  if (siteIds.length) {
    const { data: runs } = await supabase
      .from('audit_runs')
      .select('site_id, report, checked_at')
      .in('site_id', siteIds)
      .not('report', 'is', null)
      .order('checked_at', { ascending: false });

    for (const run of runs ?? []) {
      const siteId = run.site_id as string;
      // Newest first, so the first one wins and later rows are older runs.
      if (audits[siteId]) continue;
      // Dropped rather than coerced when the shape no longer matches — a
      // partial report shown as whole would put unmeasured numbers on screen.
      if (isAuditReport(run.report)) audits[siteId] = run.report;
    }
  }

  return {
    groups: (groupRows.data ?? []).map(rowToGroup),
    faqs: (faqRows.data ?? []).map(rowToFaq),
    questions: (questionRows.data ?? []).map(rowToQuestion),
    competitors: (competitorRows.data ?? []).map(rowToCompetitor),
    actionTicks: (tickRows.data ?? []).map(rowToTick),
    tracking: [],
    contentPlans: (planRows.data ?? []).map((r) => r.plan as ContentPlan),
    audits,
  };
}

/**
 * Move a browser's stored dashboard into Postgres, once.
 *
 * ⚠️ THIS IS NOT OPTIONAL AND IT IS NOT A CONVENIENCE. Until 0009, one
 * localStorage key held the only copy of every answer a customer had written.
 * Shipping the read path without this would show every existing account an
 * empty dashboard and let them start again on top of work they could not see.
 *
 * ⚠️ Only when the account has no rows yet. The test is "is Postgres empty for
 * this user", not "is there a blob" — a second browser, or the same browser
 * after the customer has since edited things elsewhere, must not have its stale
 * copy replayed over the real data.
 *
 * The key is cleared only after the writes land, so a failure part-way leaves
 * the source intact and the next load tries again.
 */
async function importLegacyLocal(userId: string, sites: Site[]): Promise<void> {
  const legacy = readLegacyLocal(userId);
  if (!legacy) return;

  const supabase = supabaseBrowser();
  const { count, error } = await supabase
    .from('faq_groups')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Unreadable means unknown, and importing on unknown risks duplicating a
  // customer's content. Leave the blob where it is and try again next load.
  if (error) return;
  if ((count ?? 0) > 0) {
    window.localStorage.removeItem(storageKey(userId));
    return;
  }

  const owned = new Set(sites.map((s) => s.id));
  // Rows for a site this account no longer has would fail the foreign key and
  // abort the whole import, taking the rest of the customer's answers with them.
  const groups = legacy.groups.filter((g) => owned.has(g.siteId));
  const groupIds = new Set(groups.map((g) => g.id));
  const faqs = legacy.faqs.filter((f) => groupIds.has(f.groupId));
  const questions = legacy.questions.filter((q) => owned.has(q.siteId));
  const plans = legacy.contentPlans.filter((p) => owned.has(p.siteId));

  if (groups.length) {
    const { error: e } = await supabase
      .from('faq_groups')
      .insert(groups.map((g) => groupToRow(g, userId)));
    if (e) return; // Keep the blob. Nothing is lost by trying again.
  }
  if (faqs.length) {
    const { error: e } = await supabase.from('faqs').insert(faqs.map((f) => faqToRow(f, userId)));
    if (e) return;
  }
  if (questions.length) {
    const { error: e } = await supabase
      .from('questions')
      .insert(questions.map((q) => questionToRow(q, userId)));
    if (e) return;
  }
  for (const plan of plans) {
    await supabase
      .from('content_plans')
      .upsert(
        { id: newId('plan'), site_id: plan.siteId, user_id: userId, plan },
        { onConflict: 'site_id' },
      );
  }

  /*
    The audit report is deliberately NOT imported. It hangs off an audit_runs
    row, and the local blob has no run to attach it to — inventing one would
    put a score into the customer's trend that was never measured on that date.
    The Audit page offers to run a fresh one, which is the honest repair.
  */
  window.localStorage.removeItem(storageKey(userId));
}

/**
 * Replace the local half with the demo fixture.
 *
 * Development only, and it says so on the button. It writes groups, answers,
 * questions and tracking for whichever sites the account actually has — it
 * cannot invent sites any more, because those are rows now.
 */
export async function seedLocalData(): Promise<DashboardData> {
  const data = requireData('seedLocalData');
  const site = data.sites[0];
  if (!site) return data;

  return write({ ...data, ...buildSeed(site.id) });
}

/**
 * Drop the pre-0009 browser copy, if one is still sitting there.
 *
 * ⚠️ THIS NO LONGER DELETES ANY DATA. It used to be the "forget my local data"
 * escape hatch, back when the browser held the only copy; now the answers are
 * rows in Postgres and this clears nothing but the spent legacy blob.
 *
 * It has no callers. It is kept, narrowed, and renamed in intent rather than
 * deleted because a customer who has not opened the app since the migration
 * still has that key, and a support answer of "clear it" needs somewhere to
 * point. Deleting the customer's actual content is deliberately not offered
 * here — that belongs to deleteSite, which cascades.
 */
export async function clearLegacyLocalData(): Promise<void> {
  const userId = requireUserId('clearLegacyLocalData');
  window.localStorage.removeItem(storageKey(userId));
}

/* ---------------------------------------------------------------- sites --- */

export type NewSite = { name: string; domain: string };

/**
 * What can be changed about a site after it exists.
 *
 * Wider than `NewSite` because the profile fields aren't things anyone types
 * when adding a site — they arrive later, from the audit, from an inference, or
 * from the customer correcting one of those. `profileSource` travels with them
 * so the caller states where the value came from rather than this function
 * guessing; only that lets `manual` mean "a person decided this".
 */
export type SitePatch = Partial<NewSite> & {
  industry?: string | null;
  location?: string | null;
  profileSource?: Site['profileSource'];
  /** ISO 3166-1 alpha-2, or null to send no location at all. */
  country?: string | null;
};

/*
  Sites are rows now.

  Every function below writes to Postgres and then re-reads, rather than
  patching the in-memory list and hoping. It costs a round trip and buys the
  guarantee that what the UI shows is what the database has — which matters
  because these rows also carry `get_cited_at`, and a screen that disagrees
  with the server about what you have paid for is a support ticket.

  Row-level security means none of these can touch another account's site even
  if the filter were wrong, and the column grants mean none of them can write
  an entitlement even if we asked.
*/

/**
 * DB row → the shape the app renders.
 *
 * `lastAudit` is always null here; assemble() joins the stored report on by
 * site id. Keeping the null in one place means nothing downstream has to guess
 * whether a site it was handed has had its audit attached yet.
 */
export function toSite(row: SiteRow): Site {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    createdAt: row.created_at,
    nextCheckAt: row.next_check_at ?? null,
    lastAudit: null,
    industry: row.industry,
    location: row.location,
    profileSource: row.profile_source,
    country: row.country,
  };
}

/** Re-read every site and rebuild the snapshot around it. */
async function refreshSites(fn: string): Promise<DashboardData> {
  requireUserId(fn);
  if (!serverHalf) throw new Error(`${fn} called before the dashboard was loaded.`);

  const supabase = supabaseBrowser();
  const { data: rows, error } = await supabase
    .from('sites')
    .select('*')
    .eq('user_id', serverHalf.user.id)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  const sites = ((rows as SiteRow[] | null) ?? []).map(toSite);
  serverHalf = { user: serverHalf.user, sites };

  // assemble() rejoins each site's report from the cache, so a rename doesn't
  // lose the audit attached to the site being renamed.
  return assemble(serverHalf.user, sites, localCache ?? EMPTY_LOCAL);
}

/** Thrown when the account is already at SITE_CAP. Named so the UI can offer help. */
export class SiteCapReached extends Error {
  constructor(readonly cap: number) {
    super(
      cap === 1
        ? 'You can track one website per account.'
        : `You can track up to ${cap} websites per account.`,
    );
    this.name = 'SiteCapReached';
  }
}

export async function createSite(input: NewSite): Promise<DashboardData> {
  const data = requireData('createSite');
  const supabase = supabaseBrowser();

  /*
    ⚠️ THE ONLY PLACE THE SITE CAP IS ACTUALLY APPLIED.

    canAddSite() spent its whole life returning a bare `true` with no call sites
    — a cap that existed as a name and nothing else — because Get Cited was
    priced per site and an extra site was extra revenue. Pro is priced per
    account, so every extra site is a full crawl and 75 more engine calls a week
    against one subscription.

    This is a client-side check and therefore a product gate, not a security
    boundary: `sites` grants INSERT to `authenticated` because a site row is the
    customer's own data. What bounds the actual SPEND is the per-account check
    meter in app/api/dashboard/tracking/route.ts, which does not care how many
    sites the checks were spread across. If sites ever start costing money on
    creation alone, this needs a server route rather than a stronger comment.
  */
  if (!canAddSite(data.sites.length)) throw new SiteCapReached(SITE_CAP);

  const { data: row, error } = await supabase
    .from('sites')
    .insert({
      user_id: data.user.id,
      name: input.name.trim(),
      domain: normalizeDomain(input.domain),
    })
    .select()
    .single<SiteRow>();

  if (error) {
    // 23505 is Postgres' unique_violation — here, the (user_id, domain) index.
    // The form checks for this too, but only the constraint sees a second tab.
    if (error.code === '23505') throw new Error('That domain is already on your account.');
    throw new Error(error.message);
  }

  // A site with no group has nowhere to put an answer, so it gets one for its
  // home page immediately. The customer renames it or adds more.
  const group: FaqGroup = {
    id: newId('grp'),
    siteId: row.id,
    name: 'Home page',
    path: '/',
    position: 0,
    createdAt: now(),
    publishedAt: null,
    publishedHash: null,
  };

  const next = await refreshSites('createSite');
  return write({
    ...next,
    groups: [...next.groups, group],
    tracking: [...next.tracking, emptyTracking(row.id)],
  });
}

export async function updateSite(id: string, patch: SitePatch): Promise<DashboardData> {
  const data = requireData('updateSite');
  const supabase = supabaseBrowser();

  /*
    Only the columns a signed-in user is granted UPDATE on. Sending
    `get_cited_at` here would not quietly succeed — the grant refuses it — but
    building the object without it makes the intent legible at the call site
    rather than only in the migration.
  */
  const update: Record<string, string | null> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.domain !== undefined) update.domain = normalizeDomain(patch.domain);
  if (patch.industry !== undefined) update.industry = trimmedOrNull(patch.industry);
  if (patch.location !== undefined) update.location = trimmedOrNull(patch.location);
  if (patch.profileSource !== undefined) update.profile_source = patch.profileSource;
  // Empty string from a "Not set" option means null — send no location at all,
  // which is what every run did before this column existed.
  if (patch.country !== undefined) update.country = patch.country || null;

  if (Object.keys(update).length === 0) return data;

  const { error } = await supabase.from('sites').update(update).eq('id', id);
  if (error) {
    if (error.code === '23505') throw new Error('That domain is already on your account.');
    throw new Error(error.message);
  }

  return write(await refreshSites('updateSite'));
}

/** Empty is the same as unknown here — a blank industry isn't a value. */
function trimmedOrNull(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function deleteSite(id: string): Promise<DashboardData> {
  const data = requireData('deleteSite');
  const supabase = supabaseBrowser();

  const { error } = await supabase.from('sites').delete().eq('id', id);
  if (error) throw new Error(error.message);

  const next = await refreshSites('deleteSite');

  // The row is gone; its local children have to follow, or they linger as
  // groups belonging to a site that no longer exists.
  const groupIds = new Set(next.groups.filter((g) => g.siteId === id).map((g) => g.id));

  return write({
    ...next,
    groups: next.groups.filter((g) => g.siteId !== id),
    faqs: next.faqs.filter((f) => !groupIds.has(f.groupId)),
    questions: next.questions.filter((q) => q.siteId !== id),
    tracking: next.tracking.filter((t) => t.siteId !== id),
    contentPlans: next.contentPlans.filter((c) => c.siteId !== id),
  });
}

/*
  setGetCited() and setSubscription() are gone.

  They existed so the demo entitlement switcher could grant Get Cited and Stay
  Cited from the browser, which was defensible only while entitlements lived in
  localStorage and nothing server-side believed them. Both columns are now
  writable by the service role alone — see the GRANTs in
  supabase/migrations/0001 — so a client-side setter could not work even if it
  were still here, and having one would suggest it should.

  Stripe's webhook writes them, in the next stage.
*/

/**
 * Show the audit that just finished, without writing it.
 *
 * ⚠️ THE SERVER ALREADY STORED THIS. app/api/audit/route.ts writes the report
 * into audit_runs.report from an after() block, service-role, before the
 * customer's browser has done anything with the response. This function exists
 * only to put it on screen now rather than on the next load.
 *
 * That inversion is the point of 0009. The report used to be saved here, in the
 * component's closure, after the fetch resolved — so navigating away mid-crawl
 * threw away a crawl the customer had already paid for. Persisting it where the
 * work happens means the tab no longer has to survive for the result to.
 */
export async function saveAudit(siteId: string, report: SiteAudit): Promise<DashboardData> {
  const data = requireData('saveAudit');
  const sites = data.sites.map((s) => (s.id === siteId ? { ...s, lastAudit: report } : s));

  // Held on the server half too, so the next mutation's snapshot keeps it.
  if (serverHalf) serverHalf = { ...serverHalf, sites };
  if (localCache) localCache = { ...localCache, audits: { ...localCache.audits, [siteId]: report } };

  return assemble(data.user, sites, localCache ?? EMPTY_LOCAL);
}

/* ------------------------------------------------------------- content --- */

/**
 * Store the generated content plan, replacing any previous one.
 *
 * One per site rather than a history: a plan is the current answer to "what
 * should I write next", and a list of superseded answers is a worse version of
 * that question. Regenerating overwrites.
 */
export async function saveContentPlan(plan: ContentPlan): Promise<DashboardData> {
  const data = requireData('saveContentPlan');
  return write({
    ...data,
    contentPlans: [...data.contentPlans.filter((c) => c.siteId !== plan.siteId), plan],
  });
}

/*
  Moved to lib/dashboard/domain.ts so server code can import it without pulling
  in this module's browser Supabase client. Re-exported here because the site
  form already imports it from this path, and a pure function does not care
  which door it came through.
*/
export { normalizeDomain };

/* --------------------------------------------------------------- groups --- */

export type NewGroup = { name: string; path: string };

/**
 * Refused because another page on this site already publishes to that path.
 *
 * ⚠️ ENFORCED HERE, NOT ONLY IN THE FORM. group-form.tsx has always checked
 * this, and its reason is right: "Two groups on one path would produce two
 * blocks for the same page, each claiming the same schema @id." But a check
 * that lives only in one component is a check the next caller skips — and the
 * damage lands in the customer's published markup, where we cannot see it.
 */
export class DuplicatePath extends Error {
  constructor(readonly path: string) {
    super(`A page already publishes to ${path}`);
    this.name = 'DuplicatePath';
  }
}

function pathTaken(data: DashboardData, siteId: string, path: string, exceptId?: string): boolean {
  return data.groups.some(
    (g) => g.siteId === siteId && g.id !== exceptId && g.path === normalizePath(path),
  );
}

/**
 * Collapse a site's pages into one list of answers.
 *
 * Answers used to be one block per website page — a "Service page" group at
 * /services, a "Pricing" group at /pricing — because the paste block goes onto
 * that specific page and `publishedAt` tracked when each was pasted. The screen
 * is one flat list now, and every export function in lib/dashboard/export.ts
 * takes a single group, so a flat list needs a single group behind it.
 *
 * ⚠️ EVERY ENTRY SURVIVES; ONLY THE CONTAINER CHANGES. Answers are appended to
 * the target in (group position, entry position) order, so what the customer
 * reads top to bottom is what they read before, with the second page's answers
 * following the first page's.
 *
 * ⚠️ THE MERGED GROUP IS 'never published', AND THAT IS NOT DATA LOSS — IT IS
 * THE TRUTH. The combined block has never been pasted anywhere. Carrying the
 * target's publishedAt across would let publishState() report 'current' for a
 * block that exists nowhere but here, and the customer's live pages would
 * quietly hold a partial copy while the dashboard said everything was fine.
 * Nulling both fields makes the next nudge say "paste this", which is exactly
 * what needs to happen.
 *
 * ⚠️ IDEMPOTENT, AND A NO-OP BELOW TWO GROUPS. Safe to call on every visit.
 */
export async function mergeGroupsForSite(siteId: string): Promise<DashboardData> {
  const data = requireData('mergeGroupsForSite');
  const groups = groupsForSite(data, siteId);
  if (groups.length < 2) return data;

  const [target, ...rest] = groups;
  const restIds = new Set(rest.map((g) => g.id));

  // Ordered the way the customer already reads them: page order, then the
  // order within each page.
  const ordered = groups.flatMap((g) => faqsForGroup(data, g.id));

  let rank = 0;
  const faqs = data.faqs.map((f) => {
    const index = ordered.findIndex((o) => o.id === f.id);
    if (index === -1) return f;
    return { ...f, groupId: target.id, position: rank++ };
  });

  return write({
    ...data,
    groups: data.groups
      .filter((g) => !restIds.has(g.id))
      .map((g) => (g.id === target.id ? { ...g, publishedAt: null, publishedHash: null } : g)),
    faqs,
  });
}

export async function createGroup(siteId: string, input: NewGroup): Promise<DashboardData> {
  const data = requireData('createGroup');
  if (pathTaken(data, siteId, input.path)) throw new DuplicatePath(normalizePath(input.path));

  const group: FaqGroup = {
    id: newId('grp'),
    siteId,
    name: input.name.trim(),
    path: normalizePath(input.path),
    position: data.groups.filter((g) => g.siteId === siteId).length,
    createdAt: now(),
    publishedAt: null,
    publishedHash: null,
  };
  return write({ ...data, groups: [...data.groups, group] });
}

export async function updateGroup(id: string, patch: Partial<NewGroup>): Promise<DashboardData> {
  const data = requireData('updateGroup');
  const target = data.groups.find((g) => g.id === id);
  if (!target) return data;

  const nextPath = patch.path !== undefined ? normalizePath(patch.path) : target.path;
  if (nextPath !== target.path && pathTaken(data, target.siteId, nextPath, id)) {
    throw new DuplicatePath(nextPath);
  }

  /*
    ⚠️ MOVING A PAGE UN-PUBLISHES IT.

    `publishedHash` records what was pasted onto a specific page. Point the
    group at a different path and nothing has ever been pasted at the new one —
    but the hash still matched, so publishState() went on reporting `current`
    while the schema's @id named a page the answers were never on. The customer
    was told they were live somewhere they weren't.

    ⚠️ Only on a PATH change. Renaming is cosmetic — clearing the hash for that
    would send someone to re-paste a page that has not changed.
  */
  const moved = nextPath !== target.path;

  return write({
    ...data,
    groups: data.groups.map((g) =>
      g.id === id
        ? {
            ...g,
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
            path: nextPath,
            ...(moved ? { publishedAt: null, publishedHash: null } : {}),
          }
        : g,
    ),
  });
}

/** Deleting a group takes its answers with it — the cascade a foreign key
    would do for us later. */
export async function deleteGroup(id: string): Promise<DashboardData> {
  const data = requireData('deleteGroup');
  const target = data.groups.find((g) => g.id === id);
  if (!target) return data;

  const groups = data.groups
    .filter((g) => g.id !== id)
    .map((g) =>
      g.siteId === target.siteId && g.position > target.position
        ? { ...g, position: g.position - 1 }
        : g,
    );

  return write({ ...data, groups, faqs: data.faqs.filter((f) => f.groupId !== id) });
}

/*
  The competitors a customer watches.

  ⚠️ ADD, EDIT, DELETE AND REORDER ARE ALL LEGITIMATE HERE, AND THEY ARE NOT ON
  THE MEASURED LIST. This is a list the owner keeps: which businesses do I
  consider rivals. `tracking.competitors` is the other thing — every domain the
  engines actually cited, counted — and it has no CRUD because editing it would
  be editing a measurement. The two live on one page and must not learn each
  other's habits.
*/

/** What the customer types. The domain is normalised before it is stored. */
export type NewCompetitor = { name: string; domain: string };

export type AddCompetitorResult =
  | { ok: true; data: DashboardData }
  | { ok: false; reason: 'bad-domain' | 'duplicate' | 'own-domain' | 'cap' };

/**
 * How many rivals one site may watch.
 *
 * ⚠️ A LIST, NOT A DATABASE. Ten is enough to hold the businesses a local owner
 * actually competes with, and past that the page stops being a watch list and
 * becomes the measured table with extra steps — which already exists directly
 * below it and is better at the job.
 */
export const COMPETITOR_CAP = 10;

export async function addCompetitor(
  siteId: string,
  input: NewCompetitor,
): Promise<AddCompetitorResult> {
  const data = requireData('addCompetitor');

  /* ⚠️ NORMALISED ON THE WAY IN, ONCE. The Competitors page joins this row to
     the measured list by `domain`, and the measured side is built from
     sourceHost() output — bare host, no scheme, no www. A stored
     "https://Summit.com/" would never match and the row would read as a
     permanent zero, which is indistinguishable from a real finding. */
  const domain = normalizeDomain(input.domain);
  if (!domain) return { ok: false, reason: 'bad-domain' };

  const site = data.sites.find((s) => s.id === siteId);
  /* Watching yourself would put a row in the list whose "mentions" figure is
     your own citations — a number that already has a home on this page and
     means something else there. */
  if (site && normalizeDomain(site.domain) === domain) return { ok: false, reason: 'own-domain' };

  const mine = data.competitors.filter((c) => c.siteId === siteId);
  if (mine.some((c) => c.domain === domain)) return { ok: false, reason: 'duplicate' };
  if (mine.length >= COMPETITOR_CAP) return { ok: false, reason: 'cap' };

  const created: Competitor = {
    id: newId('cmp'),
    siteId,
    // Falls back to the domain so a row is never nameless. Someone who pastes a
    // URL and tabs away still gets a readable list.
    name: input.name.trim() || domain,
    domain,
    position: mine.length,
    createdAt: now(),
  };

  return { ok: true, data: await write({ ...data, competitors: [...data.competitors, created] }) };
}

export async function updateCompetitor(
  id: string,
  patch: Partial<NewCompetitor>,
): Promise<DashboardData> {
  const data = requireData('updateCompetitor');
  const target = data.competitors.find((c) => c.id === id);
  if (!target) return data;

  // Same normalisation as the add path, for the same reason. An edit that
  // introduced a scheme would silently unmatch a row that was matching.
  const domain = patch.domain === undefined ? target.domain : normalizeDomain(patch.domain);
  if (!domain) return data;

  // A rename onto a domain already watched would break the unique constraint
  // in 0015; refusing here keeps the failure in front of the customer rather
  // than in a save error.
  if (
    domain !== target.domain &&
    data.competitors.some((c) => c.siteId === target.siteId && c.domain === domain)
  ) {
    return data;
  }

  return write({
    ...data,
    competitors: data.competitors.map((c) =>
      c.id === id
        ? { ...c, name: patch.name?.trim() || c.name, domain }
        : c,
    ),
  });
}

export async function deleteCompetitor(id: string): Promise<DashboardData> {
  const data = requireData('deleteCompetitor');
  const target = data.competitors.find((c) => c.id === id);
  if (!target) return data;

  /* ⚠️ CLOSE THE GAP THE DELETE LEAVES. Positions are compared by value when a
     row moves, so a list holding 0,1,3 has a neighbour that moveCompetitor can
     never find — the row at 3 would become undraggable. Renumbering the
     survivors is what keeps every position adjacent to the next. */
  const remaining = data.competitors
    .filter((c) => c.id !== id)
    .sort((a, b) => a.position - b.position);

  let rank = 0;
  const renumbered = remaining.map((c) =>
    c.siteId === target.siteId ? { ...c, position: rank++ } : c,
  );

  return write({ ...data, competitors: renumbered });
}

/**
 * Tick a fix, or untick it.
 *
 * ⚠️ THE TICK CARRIES THE REPORT IT BELONGS TO. Re-ticking after a new scan
 * overwrites reportCheckedAt, and the UI only honours a tick whose stamp
 * matches the report on screen — so a fix ticked against last week's audit does
 * not silently mark this week's finding as done. Migration 0016 carries the
 * long form of why.
 */
export async function toggleActionTick(
  siteId: string,
  actionId: string,
  reportCheckedAt: string,
): Promise<DashboardData> {
  const data = requireData('toggleActionTick');
  const existing = data.actionTicks.find((t) => t.siteId === siteId && t.actionId === actionId);

  /* Ticked against THIS report — untick. Ticked against an older one, which the
     UI is already ignoring, counts as unticked, so this re-stamps it instead. */
  if (existing && sameReport(existing.reportCheckedAt, reportCheckedAt)) {
    return write({ ...data, actionTicks: data.actionTicks.filter((t) => t.id !== existing.id) });
  }

  const next: ActionTick = {
    id: existing?.id ?? newId('tick'),
    siteId,
    actionId,
    reportCheckedAt,
    createdAt: existing?.createdAt ?? now(),
  };

  return write({
    ...data,
    actionTicks: [...data.actionTicks.filter((t) => t.id !== next.id), next],
  });
}

export async function moveCompetitor(
  id: string,
  direction: 'up' | 'down',
): Promise<DashboardData> {
  const data = requireData('moveCompetitor');
  const target = data.competitors.find((c) => c.id === id);
  if (!target) return data;

  const neighbourPosition = target.position + (direction === 'up' ? -1 : 1);
  const neighbour = data.competitors.find(
    (c) => c.siteId === target.siteId && c.position === neighbourPosition,
  );
  if (!neighbour) return data;

  return write({
    ...data,
    competitors: data.competitors.map((c) => {
      if (c.id === target.id) return { ...c, position: neighbourPosition };
      if (c.id === neighbour.id) return { ...c, position: target.position };
      return c;
    }),
  });
}

export async function moveGroup(id: string, direction: 'up' | 'down'): Promise<DashboardData> {
  const data = requireData('moveGroup');
  const target = data.groups.find((g) => g.id === id);
  if (!target) return data;

  const neighbourPosition = target.position + (direction === 'up' ? -1 : 1);
  const neighbour = data.groups.find(
    (g) => g.siteId === target.siteId && g.position === neighbourPosition,
  );
  if (!neighbour) return data;

  return write({
    ...data,
    groups: data.groups.map((g) => {
      if (g.id === target.id) return { ...g, position: neighbourPosition };
      if (g.id === neighbour.id) return { ...g, position: target.position };
      return g;
    }),
  });
}

/**
 * Record that the customer has pasted this group's export onto its page.
 *
 * Storing the hash at this moment is what makes the staleness nudge work later:
 * the content is re-pasted by hand, so the only way to know a page's live copy
 * has drifted is to remember what it looked like when they said they pasted it.
 */
export async function markGroupPublished(id: string): Promise<DashboardData> {
  const data = requireData('markGroupPublished');
  const hash = contentHash(data.faqs.filter((f) => f.groupId === id));

  return write({
    ...data,
    groups: data.groups.map((g) =>
      g.id === id ? { ...g, publishedAt: now(), publishedHash: hash } : g,
    ),
  });
}

/* ----------------------------------------------------------------- faqs --- */

export type NewFaq = {
  question: string;
  answer: string;
  status?: FaqEntry['status'];
  source?: FaqEntry['source'];
  tone?: FaqEntry['tone'];
  language?: FaqEntry['language'];
};

/**
 * Thrown when a free site is already holding as many answers as it may keep.
 *
 * A distinct class rather than a string so the caller can tell "you've hit the
 * cap, here is the upgrade" apart from a genuine failure.
 */
export class FaqCapReached extends Error {
  constructor(readonly cap: number) {
    super(`This site can hold ${cap} answers on the free tier.`);
    this.name = 'FaqCapReached';
  }
}

/*
  ⚠️ The cap is enforced here, and here only.

  faqCapFor() and FREE_FAQ_CAP existed for a long time with no caller, so a free
  site could accumulate unlimited answers — the cap was documented, priced, and
  not actually applied anywhere.

  A cap on what may be STORED, not on what may be written in one go — that is
  MAX_FAQ_COUNT_PRO in lib/faq.ts. Someone who generates six, deletes four and
  generates six more is at eight, not twelve.

  ⚠️ COUNTED PER SITE, and since SITE_CAP is 1 that is currently the same as per
  account. It stays per site because that is the unit a customer thinks in, and
  because multi-site Pro would otherwise silently turn a per-account cap into a
  shared one.
*/
export async function createFaqs(groupId: string, entries: NewFaq[]): Promise<DashboardData> {
  const data = requireData('createFaqs');

  const group = data.groups.find((g) => g.id === groupId);
  if (group) {
    const cap = faqCapFor(data.user);
    if (Number.isFinite(cap)) {
      const held = faqsForSite(data, group.siteId).length;
      if (held + entries.length > cap) throw new FaqCapReached(cap);
    }
  }

  const start = data.faqs.filter((f) => f.groupId === groupId).length;
  const stamp = now();

  const created: FaqEntry[] = entries.map((e, i) => ({
    id: newId('faq'),
    groupId,
    question: e.question.trim(),
    answer: e.answer.trim(),
    status: e.status ?? 'draft',
    position: start + i,
    source: e.source ?? 'manual',
    tone: e.tone ?? 'Professional',
    language: e.language ?? 'English',
    createdAt: stamp,
    updatedAt: stamp,
  }));

  return write({ ...data, faqs: [...data.faqs, ...created] });
}

export async function updateFaq(
  id: string,
  patch: Partial<Pick<FaqEntry, 'question' | 'answer' | 'status'>>,
): Promise<DashboardData> {
  const data = requireData('updateFaq');
  return write({
    ...data,
    faqs: data.faqs.map((f) => (f.id === id ? { ...f, ...patch, updatedAt: now() } : f)),
  });
}

export async function deleteFaq(id: string): Promise<DashboardData> {
  const data = requireData('deleteFaq');
  const target = data.faqs.find((f) => f.id === id);
  if (!target) return data;

  const faqs = data.faqs
    .filter((f) => f.id !== id)
    .map((f) =>
      f.groupId === target.groupId && f.position > target.position
        ? { ...f, position: f.position - 1 }
        : f,
    );

  return write({ ...data, faqs });
}

export async function moveFaq(id: string, direction: 'up' | 'down'): Promise<DashboardData> {
  const data = requireData('moveFaq');
  const target = data.faqs.find((f) => f.id === id);
  if (!target) return data;

  const neighbourPosition = target.position + (direction === 'up' ? -1 : 1);
  const neighbour = data.faqs.find(
    (f) => f.groupId === target.groupId && f.position === neighbourPosition,
  );
  if (!neighbour) return data;

  return write({
    ...data,
    faqs: data.faqs.map((f) => {
      if (f.id === target.id) return { ...f, position: neighbourPosition };
      if (f.id === neighbour.id) return { ...f, position: target.position };
      return f;
    }),
  });
}

/**
 * Move an answer to another group.
 *
 * It lands at the end of the target and the gap it left behind closes, so both
 * groups keep contiguous positions. Without the renumbering the source group
 * would carry a hole, and every later reorder would skip a slot.
 */
export async function moveFaqToGroup(id: string, groupId: string): Promise<DashboardData> {
  const data = requireData('moveFaqToGroup');
  const target = data.faqs.find((f) => f.id === id);
  if (!target || target.groupId === groupId) return data;

  const nextPosition = data.faqs.filter((f) => f.groupId === groupId).length;

  return write({
    ...data,
    faqs: data.faqs.map((f) => {
      if (f.id === id) return { ...f, groupId, position: nextPosition, updatedAt: now() };
      if (f.groupId === target.groupId && f.position > target.position) {
        return { ...f, position: f.position - 1 };
      }
      return f;
    }),
  });
}

/* -------------------------------------------------------- audit history --- */

/**
 * Is this id one Postgres could match?
 *
 * `site_id` is a uuid column, so a site id that isn't a uuid doesn't return
 * zero rows — the query fails on the cast, and the reads below log the failure
 * and carry on. That is a real path, not a hypothetical: the dev /shots route
 * seeds a fixture site under a readable id ('shots-site') so the screenshots
 * have something to show, and the overview screen asks for its history like
 * any other site's. Skipping the round trip keeps a fixture from filling the
 * terminal with cast errors that describe nothing wrong.
 *
 * Both readers below use it. Neither can distinguish "no rows" from "the id
 * could never have had rows", and neither needs to — both already treat a
 * failed read as no data.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Past runs for a site, newest first.
 *
 * Read straight from Postgres rather than from the local snapshot, because this
 * is the one part of a customer's audit data that is NOT in localStorage — and
 * that is the point of it. A trend that lived in the browser would restart every
 * time they cleared their cache or opened the dashboard on a different device,
 * which is exactly the failure that made the old single stored report useless
 * for showing progress.
 *
 * ⚠️ Quick and full runs are returned together and MUST be filtered by depth
 * before being compared. A quick run scores 3 findings across 2 pillars; a full
 * run scores ~40 across 6. Charting both on one line shows a cliff that never
 * happened to the customer's site.
 */
export async function auditHistory(siteId: string, limit = 12): Promise<AuditRunRow[]> {
  assertClient('auditHistory');

  if (!UUID.test(siteId)) return [];

  const { data, error } = await supabaseBrowser()
    .from('audit_runs')
    .select('id, site_id, user_id, score, scored_count, depth, pillar_scores, checked_at')
    .eq('site_id', siteId)
    .order('checked_at', { ascending: false })
    .limit(limit);

  /*
    Swallowed rather than thrown. History is a nice-to-have on a screen whose
    real job is the worklist — if the table is missing because the migration
    hasn't been applied yet, or the read fails, the dashboard should render
    without a trend rather than not render.
  */
  if (error) {
    console.error('Could not read audit history:', error.message);
    return [];
  }

  return (data ?? []) as AuditRunRow[];
}

/* ----------------------------------------------------- citation tracking --- */

/**
 * Real tracking for a site, assembled from Postgres.
 *
 * Read straight from the database rather than the local snapshot, for the same
 * reason as auditHistory() and one more: these rows are EVIDENCE. They are
 * written by the service role after a server-side run, and `citation_checks`
 * grants the browser SELECT and nothing else — a client that could write its
 * own citation history could report that ChatGPT cites it daily, into a number
 * we then put our name to.
 *
 * ⚠️ Everything the UI needs is shaped here, because the components do none of
 * it themselves: `daily` must be ascending, unique and zero-padded YYYY-MM-DD
 * (the chart splits the string), every row must carry all three engine keys,
 * and `competitors` must arrive sorted — the meter takes the first row as its
 * maximum. Getting any of that wrong renders silently wrong rather than
 * failing.
 *
 * Returns null when nothing has ever been checked, so the provider can fall
 * back to the local snapshot for the dev seed. Either way the tracking page
 * sees `daily: []` and shows "we have not looked" rather than zeros, which
 * would read as "nobody is citing you" — a measurement we never took.
 */
export async function trackingFromDb(
  siteId: string,
  siteDomain: string,
  /*
    The budget window the tracking route enforces, or null when the site has no
    tracking access.

    ⚠️ PASSED IN, NOT COMPUTED HERE. The meter and the enforcement have to be
    the same arithmetic on the same anchor — two independent counts is how a
    customer gets refused at "310 of 420". The provider holds the site and the
    user, so it derives the period once and hands it down.
  */
  period: TrackingPeriod | null,
  /** Which plan's caps to report. Derived by the caller, beside the period. */
  plan: TrackingPlan,
  /**
   * The earliest check to read, for the chart.
   *
   * ⚠️ A DATE, NOT A NUMBER OF DAYS, AND THE DIFFERENCE IS A BUG THAT WAS HERE.
   * This used to be `days = 30`, i.e. a window rolling backwards from today —
   * which quietly deletes history. A free account's one reading would drop off
   * its own chart a month later, leaving a page that says "we have not looked"
   * about a check we definitely ran. Free passes the account's creation date;
   * Pro passes 30 days back, because theirs never stops being added to.
   */
  since: Date,
  /** When the next automatic check is due, straight off the site row. */
  nextCheckAt: string | null,
): Promise<SiteTracking | null> {
  assertClient('trackingFromDb');

  if (!UUID.test(siteId)) return null;

  const [checks, prompts] = await Promise.all([
    supabaseBrowser()
      .from('citation_checks')
      // ⚠️ `sources` is the expensive column and it is here on purpose: it is
      // the only record of WHO ELSE the engine cited, and share of voice is
      // built from it. Without it the ranking falls back to one domain per
      // check — 45 data points where 296 were collected.
      .select(
        'id, site_id, question, engine, outcome, cited_instead, sources, answer_excerpt, checked_at',
      )
      .eq('site_id', siteId)
      .gte('checked_at', since.toISOString())
      .order('checked_at', { ascending: false }),
    supabaseBrowser().from('tracked_prompts').select('id').eq('site_id', siteId),
    /*
      No third query for a schedule any more.

      Get Cited promised four checks on four named days, so the Results page had
      a timeline to draw and tracking_milestones existed to hold it — including
      the statuses ('skipped', 'failed') that only make sense for a check that was
      owed on a specific date. Pro promises a cadence instead: what ran is
      citation_checks.checked_at, and what is coming is one date on the site row.
    */
  ]);

  // Swallowed, like the audit history: a missing migration should mean "no
  // tracking yet", not a dashboard that refuses to render.
  if (checks.error) {
    console.error('Could not read citation checks:', checks.error.message);
    return null;
  }

  const rows = (checks.data ?? []) as Pick<
    CitationCheckRow,
    | 'id'
    | 'site_id'
    | 'question'
    | 'engine'
    | 'outcome'
    | 'cited_instead'
    | 'sources'
    | 'answer_excerpt'
    | 'checked_at'
  >[];

  if (rows.length === 0) return null;

  // sourceHost, not normalizeDomain: `www.` has to go here so one publisher is
  // one row. See the note on each of them — they differ deliberately.
  const ours = sourceHost(siteDomain);

  /*
    Every check in the window. NOT what `latest` becomes — see below.

    This is the raw log: one row per question per engine per run, so a question
    asked weekly for a month appears four times per engine.
  */
  const all: CitationCheck[] = rows.map((r) => ({
    id: r.id,
    siteId: r.site_id,
    question: r.question,
    engine: r.engine as Engine,
    outcome: r.outcome,
    citedInstead: r.cited_instead,
    excerpt: r.answer_excerpt,
    // jsonb, so the shape is not guaranteed by the type — filter rather than cast.
    sources: Array.isArray(r.sources) ? (r.sources as unknown[]).filter((s) => typeof s === 'string') : [],
    checkedAt: r.checked_at,
  }));

  /*
    ⚠️ `latest` MEANS THE CURRENT STATE, ONE ROW PER QUESTION PER ENGINE.

    Everything downstream reads it that way: the metric tiles count outcomes off
    it, `citationRate` divides by its length, and the "Not cited for" worklist
    renders its rows directly. Handing them the raw log instead would inflate
    every tile and print the same question once per run — and it would look
    perfectly correct until a site had run checks on a second day, because the
    demo fixture is exactly one row per pair.

    `rows` arrives `checked_at desc`, so the first sighting of a pair is its
    most recent result and later ones are history.

    ⚠️ THE DELIMITER IN THE KEY BELOW MUST STAY AN ESCAPE, NOT A LITERAL BYTE.
    A NUL is the right separator — questions carry spaces and punctuation, so a
    printable one could in principle collide — but writing it as a raw byte
    makes this file non-text: `file` reports the module as `data` and plain
    `grep` then skips all 1131 lines SILENTLY, reporting no matches rather than
    an error. That is how it was, and it is a genuinely misleading way to lose
    an afternoon. The escape compiles to the identical string.
  */
  const seen = new Set<string>();
  const latest: CitationCheck[] = [];
  for (const check of all) {
    const key = `${check.question}\u0000${check.engine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(check);
  }

  /*
    Daily rollup: one row per day that actually has checks.

    ⚠️ BUILT FROM `all`, NOT `latest`, AND THAT IS NOT INTERCHANGEABLE. The
    chart is a history — what each day's run found. Deduping first keeps only
    each pair's most recent result, so a question checked on the 1st and again
    on the 8th would contribute to the 8th only, and the 1st would silently
    lose its point. The trend would then always slope up towards today
    regardless of what actually happened.

    Days with no run are omitted rather than zero-filled. The chart is
    index-based, so a gap compresses the axis rather than showing a drop to
    zero — and a zero would claim we asked and found nothing, which is not what
    happened on a day nobody ran anything.
  */
  const byDate = new Map<string, CitationDay>();
  for (const check of all) {
    const date = check.checkedAt.slice(0, 10); // ISO is already YYYY-MM-DD
    let day = byDate.get(date);
    if (!day) {
      day = { date, byEngine: blankEngines(), checked: 0, cited: 0, mentioned: 0 };
      byDate.set(date, day);
    }
    day.checked += 1;
    if (check.outcome === 'cited') {
      day.byEngine[check.engine] += 1;
      day.cited += 1;
    }
    if (check.outcome === 'mentioned') day.mentioned += 1;
  }

  const daily = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  /*
    Share of voice, from EVERY source in every answer.

    ⚠️ THIS USED TO READ ONE DOMAIN PER CHECK — `cited_instead`, the single
    rival that took the click — and threw the rest of each answer's source list
    away. On a real site that was 45 data points out of 296 collected. An engine
    citing six publishers is six facts about who is winning, and the customer
    had already paid to learn all six.

    From `all` rather than `latest`, for the same reason the daily rollup is: a
    rival cited on every run outranks one cited once, and the deduped view
    cannot say that.

    Sorted descending because the meter divides by the first row — the component
    does not sort, and an unsorted array draws bars longer than their track.
  */
  const tally = new Map<string, number>();
  const citedUrls = new Map<string, number>();
  let sourceTotal = 0;
  let sourceOurs = 0;

  /*
    ⚠️ FOUR MORE FACTS OUT OF THE SAME PASS, NOT A SECOND ONE.

    Which engines cited a domain, what questions it was cited on, and how it
    moved between the last two runs are all already sitting on these rows —
    `engine`, `question` and `checked_at` — and none of them needed a new
    column, a new request or a model. A second loop would be a second definition
    of what counts as a citation, which is how two screens end up disagreeing.

    Per-date tallies are keyed the way the daily rollup above keys its days, so
    "a run" means the same thing in both places.
  */
  const enginesBy = new Map<string, Set<Engine>>();
  const questionsBy = new Map<string, Map<string, number>>();
  const byDateHost = new Map<string, Map<string, number>>();
  const countedRows = new Set<string>();

  for (const row of rows) {
    // Defensive: `sources` is jsonb, so a malformed row is a possibility the
    // type system cannot rule out.
    const sources = Array.isArray(row.sources) ? (row.sources as unknown[]) : [];
    const date = row.checked_at.slice(0, 10); // ISO is already YYYY-MM-DD

    /* One date bucket per row, whether or not its sources parse — a run that
       cited nothing is still a run that happened. */
    let dayHosts = byDateHost.get(date);
    if (!dayHosts) {
      dayHosts = new Map<string, number>();
      byDateHost.set(date, dayHosts);
    }

    for (const value of sources) {
      if (typeof value !== 'string') continue;
      const host = sourceHost(value);
      if (!host) continue;

      sourceTotal += 1;
      tally.set(host, (tally.get(host) ?? 0) + 1);
      dayHosts.set(host, (dayHosts.get(host) ?? 0) + 1);

      if (ENGINES.includes(row.engine as Engine)) {
        const set = enginesBy.get(host) ?? new Set<Engine>();
        set.add(row.engine as Engine);
        enginesBy.set(host, set);
      }

      /* ⚠️ COUNTED ONCE PER ROW, NOT ONCE PER SOURCE. An answer citing a domain
         three times is still one answer to that question, and counting URLs
         would rank a page that links itself a lot above a domain cited across
         ten different questions. The seen-set is keyed on host and row rather
         than stashing a sentinel in the question map, so no real question can
         ever collide with the bookkeeping. */
      const pair = `${host}\u0000${row.id}`;
      if (!countedRows.has(pair)) {
        countedRows.add(pair);
        const qs = questionsBy.get(host) ?? new Map<string, number>();
        qs.set(row.question, (qs.get(row.question) ?? 0) + 1);
        questionsBy.set(host, qs);
      }

      // Ours, and which page of ours — the actionable half of a citation.
      // Subdomains count as ours, matching isOurs() in lib/tracking/classify.ts.
      if (ours && (host === ours || host.endsWith(`.${ours}`))) {
        sourceOurs += 1;
        citedUrls.set(value, (citedUrls.get(value) ?? 0) + 1);
      }
    }
  }

  /*
    Movement between the two most recent dates that ran.

    ⚠️ NULL WHEN THERE IS ONLY ONE RUN, AND NULL IS NOT 'steady'. A single-run
    account has nothing to compare, and a flat arrow there would report the
    absence of a measurement as a measurement of no change — the rule
    PillarResult.score already follows for a pillar nobody could score.
  */
  const dates = [...byDateHost.keys()].sort();
  const newest = dates.length >= 2 ? byDateHost.get(dates[dates.length - 1]) : undefined;
  const prior = dates.length >= 2 ? byDateHost.get(dates[dates.length - 2]) : undefined;

  const trendFor = (host: string): CompetitorShare['trend'] => {
    if (!newest || !prior) return null;
    const now = newest.get(host) ?? 0;
    const was = prior.get(host) ?? 0;
    if (was === 0 && now > 0) return 'new';
    if (now > was) return 'up';
    if (now < was) return 'down';
    return 'steady';
  };

  const competitors: CompetitorShare[] = [...tally.entries()]
    .map(([domain, citations]) => ({
      domain,
      citations,
      isYou: domain === ours,
      /* ⚠️ THE CUSTOMER IS NEVER A PLATFORM, whatever the list says. A site
         hosted on a domain that happens to be listed is still theirs. */
      kind: domain === ours ? ('business' as const) : sourceKind(domain),
      share: sourceTotal > 0 ? (citations / sourceTotal) * 100 : 0,
      engines: ENGINES.filter((e) => enginesBy.get(domain)?.has(e)),
      topQuestions: [...(questionsBy.get(domain) ?? new Map<string, number>())]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([q]) => q),
      trend: trendFor(domain),
    }))
    .sort((a, b) => b.citations - a.citations || a.domain.localeCompare(b.domain));

  const citedPages: CitedPage[] = [...citedUrls.entries()]
    .map(([url, citations]) => ({ url, citations }))
    .sort((a, b) => b.citations - a.citations || a.url.localeCompare(b.url));

  /*
    Per engine, over the whole window.

    Built from `latest` rather than `all`: this answers "where do I stand on
    each engine now", and the raw log would count a question asked four times
    as four standings. ENGINES order, not discovery order, so the rows do not
    reshuffle between loads.
  */
  const byEngine: EngineBreakdown[] = ENGINES.map((engine) => {
    const mine = latest.filter((c) => c.engine === engine);
    return {
      engine,
      cited: mine.filter((c) => c.outcome === 'cited').length,
      mentioned: mine.filter((c) => c.outcome === 'mentioned').length,
      absent: mine.filter((c) => c.outcome === 'absent').length,
      checked: mine.length,
    };
  });

  return {
    siteId,
    daily,
    latest,
    competitors,
    citedPages,
    byEngine,
    sourceAppearances: { ours: sourceOurs, total: sourceTotal },
    // What is being watched, not what has been asked — the prompt is the unit
    // the customer buys. See the note on SiteTracking.
    promptsTracked: prompts.data?.length ?? new Set(latest.map((c) => c.question)).size,
    /*
      From the plan, passed in beside the period and for the same reason its own
      note gives: the caller is the only place holding both the site and the
      user, and two independent derivations is how a customer gets refused at a
      number the screen never showed them.
    */
    planId: plan.id,
    schedule: plan.schedule,
    promptCap: plan.promptCap,
    manualCap: plan.manualCap,
    checksCap: plan.checksPerPeriod,
    runsPerPeriod: plan.runsPerPeriod,
    nextCheckAt,
    // The cost side, so it counts every call actually spent — the raw log, not
    // the deduped current state. Charging for one check when four ran would
    // make the quota bar a fiction.
    /*
      Spent in THIS PERIOD, not in the charted window.

      `all` covers the last 30 days for the chart, which is a different span
      from a billing period — counting it here would show a number the route
      does not enforce.
    */
    checksUsed: period ? all.filter((c) => c.checkedAt >= period.start.toISOString()).length : 0,
    /*
      ⚠️ NULL WHEN THE ALLOWANCE NEVER REFILLS, which is the free tier.

      This used to fall back to `new Date()` — "resets now" — for a plan that had
      no period at all. That was survivable while every plan reset eventually.
      Free's window has no end by design, so a date here would promise a refill
      that never arrives, and the customer would keep coming back to a meter
      that never moved. The UI says "one check" instead.
    */
    periodResetsAt: period?.end ? period.end.toISOString() : null,
  };
}

function blankEngines(): Record<Engine, number> {
  return Object.fromEntries(ENGINES.map((e) => [e, 0])) as Record<Engine, number>;
}

/* ------------------------------------------------------------ questions --- */

export async function markQuestionCovered(id: string): Promise<DashboardData> {
  const data = requireData('markQuestionCovered');
  return write({
    ...data,
    questions: data.questions.map((q) => (q.id === id ? { ...q, covered: true } : q)),
  });
}

/**
 * Store a freshly discovered set.
 *
 * TWO MODES, AND THEY ANSWER DIFFERENT QUESTIONS.
 *
 * `replace` (the default, and what the Opportunities button does) is "find me a
 * better list". A re-run produces a differently-worded version of the same
 * questions, and appending those would leave the customer scrolling through
 * near-duplicates deciding which one to trust.
 *
 * TWO KINDS OF QUESTION SURVIVE A REPLACE, for two different reasons:
 *   covered  — work already done. Discarding it would ask them to do it again.
 *   manual   — a person typed it. A re-run is an offer of better SUGGESTIONS;
 *              it was never an offer to throw away the customer's own input,
 *              and deleting typed text because a button elsewhere was pressed
 *              is the kind of loss nobody forgives.
 *
 * `append` is "find me MORE" — the Results page topping the watch list up
 * toward the plan's prompt cap. It keeps everything already there, covered or
 * not, and is only sensible because the caller passes the existing questions to
 * the model as exclusions; without that the model returns the same list back
 * and every one of them is dropped as a duplicate.
 *
 * ⚠️ APPEND STOPS AT DISCOVERED_PROMPT_CAP, NOT THE PLAN TOTAL. It used to fill
 * to STAY_CITED_PROMPT_CAP, which meant one press of "Find more questions" took
 * every remaining slot and the customer could never type one of their own again
 * — the manual field rendered as "your watch list is full" and stayed that way.
 * The reserved manual slots are held back whether or not they have been used.
 *
 * The plan total is still enforced server-side by the tracking route, so a
 * longer local list would be truncated there and the questions past it would
 * sit in the UI looking watched while nothing ever asked them.
 *
 * ⚠️ No volume. Nothing measures it. See the note on DiscoveredQuestion.
 */
export type NewQuestion = { question: string; why?: string; intent?: string };

/**
 * The caps that apply to one site's question list.
 *
 * No fallback any more, and no `siteId` either: free is a plan rather than the
 * absence of one, so trackingPlanFor() always has an answer. The parameter is
 * kept off the signature rather than ignored, so nothing reads as if the site
 * still influences a cap that is now purely account-level.
 */
function planCapsFor(data: DashboardData): TrackingPlan {
  return trackingPlanFor(data.user);
}

export async function addQuestions(
  siteId: string,
  questions: NewQuestion[],
  mode: 'replace' | 'append' = 'replace',
): Promise<DashboardData> {
  const data = requireData('addQuestions');

  const mine = data.questions.filter((q) => q.siteId === siteId);
  // Append keeps the whole list; replace keeps the work already done and
  // anything the customer wrote themselves. See the note above.
  const kept =
    mode === 'append' ? mine : mine.filter((q) => q.covered || q.source === 'manual');

  // Normalised, not raw: the model rarely returns a question in exactly the
  // words it used last time, and two spellings of one question would be two
  // prompts against the allowance.
  const keptKeys = new Set(kept.map((q) => questionKey(q.question)));

  // Counted against the DISCOVERED questions only: manual ones hold their own
  // reserve, and letting them shrink discovery's ceiling would punish a customer
  // for having typed a question.
  const discovered = kept.filter((q) => q.source !== 'manual').length;
  const room =
    mode === 'append' ? Math.max(0, planCapsFor(data).discoveredCap - discovered) : Infinity;

  const created: DiscoveredQuestion[] = [];
  for (const q of questions) {
    if (created.length >= room) break;

    const text = q.question.trim();
    const key = questionKey(text);
    if (!text || keptKeys.has(key)) continue;
    keptKeys.add(key); // also guards duplicates within one response

    created.push({
      id: newId('q'),
      siteId,
      question: text,
      why: q.why?.trim() || undefined,
      intent: q.intent,
      covered: false,
      source: 'discovered',
      // Appended after everything already on the list, so a re-run adds to the
      // bottom rather than shuffling what the owner has already ordered.
      position: kept.length + created.length,
      addedAt: now(),
    });
  }

  const others = data.questions.filter((q) => q.siteId !== siteId);
  return write({ ...data, questions: [...others, ...kept, ...created] });
}

/** Long enough for a real question, short enough that a pasted page is refused. */
const MANUAL_QUESTION_MAX_CHARS = 200;

/**
 * Why a typed question was refused, or that it wasn't.
 *
 * ⚠️ A DISCRIMINATED RESULT RATHER THAN A THROW OR A BARE `false`. Four rules
 * can stop an add, and "couldn't add that" for all four is what makes someone
 * press the button again with the same input. The caller needs to know which.
 */
export type ManualQuestionResult =
  | { ok: true; data: DashboardData }
  | { ok: false; reason: 'empty' | 'too-long' | 'duplicate' | 'manual-cap' | 'prompt-cap' };

/**
 * A question the customer wrote, rather than one a model proposed.
 *
 * Its own function rather than a flag on addQuestions() because the rules are
 * not the same: a model's list is bounded by what we asked for, while typed
 * input can be empty, pasted, repeated, or endless, and each of those wants a
 * different sentence back.
 *
 * ⚠️ TWO CAPS, AND THEY MEASURE DIFFERENT THINGS. MANUAL_QUESTION_CAP bounds how
 * much of the watch list is hand-written. STAY_CITED_PROMPT_CAP bounds what the
 * customer is paying for — the tracking route enforces that one server-side, so
 * a longer local list would simply be truncated there and the questions past it
 * would sit on screen looking watched while nothing ever asked them.
 */
/**
 * Has this question ever been asked?
 *
 * ⚠️ THE GATE ON EDITING, AND IT BELONGS HERE RATHER THAN IN THE BUTTON.
 * questions.question is byte-identical to tracked_prompts.question and the two
 * are joined by plain string equality — 0009 says so and forbids even trimming
 * on the way in. So changing the text does not rename a question; it orphans
 * every result collected under the old wording and leaves the new one looking
 * as though it was never asked. A hidden pencil is a suggestion. This is the
 * rule.
 */
export function questionHasResults(data: DashboardData, question: DiscoveredQuestion): boolean {
  const tracking = data.tracking.find((t) => t.siteId === question.siteId);
  return (tracking?.latest ?? []).some((c) => c.question === question.question);
}

export type EditQuestionResult =
  | { ok: true; data: DashboardData }
  | { ok: false; reason: 'empty' | 'too-long' | 'duplicate' | 'has-results' };

/** Reword a question that has not been asked yet. */
export async function updateQuestion(id: string, text: string): Promise<EditQuestionResult> {
  const data = requireData('updateQuestion');
  const target = data.questions.find((q) => q.id === id);
  if (!target) return { ok: false, reason: 'empty' };

  if (questionHasResults(data, target)) return { ok: false, reason: 'has-results' };

  // Same normalisation addManualQuestion applies, so an edit and an add cannot
  // disagree about what counts as the same question.
  const next = text.trim().replace(/\s+/g, ' ');
  if (!next) return { ok: false, reason: 'empty' };
  if (next.length > MANUAL_QUESTION_MAX_CHARS) return { ok: false, reason: 'too-long' };

  const key = questionKey(next);
  if (
    data.questions.some((q) => q.siteId === target.siteId && q.id !== id && questionKey(q.question) === key)
  ) {
    return { ok: false, reason: 'duplicate' };
  }

  return {
    ok: true,
    data: await write({
      ...data,
      questions: data.questions.map((q) => (q.id === id ? { ...q, question: next } : q)),
    }),
  };
}

/**
 * Stop watching a question.
 *
 * ⚠️ THE RESULTS ALREADY COLLECTED ARE NOT DELETED WITH IT. citation_checks is
 * evidence and the browser holds SELECT on it and nothing else — see 0009. The
 * rows simply stop being joined to anything on screen. That is the honest
 * outcome: we did ask, and we did see what we saw.
 */
export async function deleteQuestion(id: string): Promise<DashboardData> {
  const data = requireData('deleteQuestion');
  const target = data.questions.find((q) => q.id === id);
  if (!target) return data;

  /* Close the gap, for the reason deleteCompetitor gives: positions are matched
     by value when a row moves, so a hole makes the row past it undraggable. */
  const remaining = data.questions
    .filter((q) => q.id !== id)
    .sort((a, b) => a.position - b.position);

  let rank = 0;
  const renumbered = remaining.map((q) =>
    q.siteId === target.siteId ? { ...q, position: rank++ } : q,
  );

  return write({ ...data, questions: renumbered });
}

export async function moveQuestion(id: string, direction: 'up' | 'down'): Promise<DashboardData> {
  const data = requireData('moveQuestion');
  const target = data.questions.find((q) => q.id === id);
  if (!target) return data;

  const neighbourPosition = target.position + (direction === 'up' ? -1 : 1);
  const neighbour = data.questions.find(
    (q) => q.siteId === target.siteId && q.position === neighbourPosition,
  );
  if (!neighbour) return data;

  return write({
    ...data,
    questions: data.questions.map((q) => {
      if (q.id === target.id) return { ...q, position: neighbourPosition };
      if (q.id === neighbour.id) return { ...q, position: target.position };
      return q;
    }),
  });
}

export async function addManualQuestion(
  siteId: string,
  question: string,
): Promise<ManualQuestionResult> {
  const data = requireData('addManualQuestion');

  const text = question.trim().replace(/\s+/g, ' ');
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > MANUAL_QUESTION_MAX_CHARS) return { ok: false, reason: 'too-long' };

  const mine = data.questions.filter((q) => q.siteId === siteId);

  // Normalised: nobody retypes a question in the model's exact punctuation, and
  // two spellings of one question would spend the allowance twice for one answer.
  const key = questionKey(text);
  if (mine.some((q) => questionKey(q.question) === key)) {
    return { ok: false, reason: 'duplicate' };
  }

  const caps = planCapsFor(data);

  if (mine.filter((q) => q.source === 'manual').length >= caps.manualCap) {
    return { ok: false, reason: 'manual-cap' };
  }

  if (mine.length >= caps.promptCap) {
    return { ok: false, reason: 'prompt-cap' };
  }

  const created: DiscoveredQuestion = {
    id: newId('q'),
    siteId,
    question: text,
    // No `why` and no `intent`: those are the model explaining its own
    // suggestion. Inventing them for a question the customer wrote would be
    // putting words in their mouth.
    covered: false,
    source: 'manual',
    // Appended, like a discovered one. The owner can drag it wherever after.
    position: mine.length,
    addedAt: now(),
  };

  return { ok: true, data: await write({ ...data, questions: [...data.questions, created] }) };
}

/**
 * Re-check which discovered questions the site now answers.
 *
 * Called after a discovery run and whenever answers change. Matching is on the
 * normalised question text — the customer rarely publishes the question in
 * exactly the words the model proposed.
 */
export async function recheckCoverage(siteId: string): Promise<DashboardData> {
  const data = requireData('recheckCoverage');
  const published = new Set(
    faqsForSite(data, siteId)
      .filter((f) => f.status === 'published' && f.answer.trim())
      .map((f) => questionKey(f.question)),
  );

  return write({
    ...data,
    questions: data.questions.map((q) =>
      q.siteId === siteId && !q.covered && published.has(questionKey(q.question))
        ? { ...q, covered: true }
        : q,
    ),
  });
}

/* ------------------------------------------------------------- selectors --- */

export function groupsForSite(data: DashboardData, siteId: string): FaqGroup[] {
  return data.groups.filter((g) => g.siteId === siteId).sort((a, b) => a.position - b.position);
}

export function faqsForGroup(data: DashboardData, groupId: string): FaqEntry[] {
  return data.faqs.filter((f) => f.groupId === groupId).sort((a, b) => a.position - b.position);
}

/** Every answer on a site, across its groups — for counts and llms.txt. */
export function faqsForSite(data: DashboardData, siteId: string): FaqEntry[] {
  const groupIds = new Set(groupsForSite(data, siteId).map((g) => g.id));
  return data.faqs.filter((f) => groupIds.has(f.groupId));
}

/**
 * Unanswered first, then newest.
 *
 * This used to sort by `volume` descending, which ordered the list by a number
 * nobody measured. Unanswered-first is the order that matches what the screen
 * is for: the questions with no answer are the whole point, and a customer
 * scrolling past twenty answered ones to reach them is a customer who stops
 * scrolling.
 */
export function questionsForSite(data: DashboardData, siteId: string): DiscoveredQuestion[] {
  return data.questions
    .filter((q) => q.siteId === siteId)
    .sort((a, b) => {
      if (a.covered !== b.covered) return a.covered ? 1 : -1;
      return b.addedAt.localeCompare(a.addedAt);
    });
}

export function trackingForSite(data: DashboardData, siteId: string) {
  return data.tracking.find((t) => t.siteId === siteId) ?? emptyTracking(siteId);
}

/** Null rather than an empty plan — "not generated yet" is a state the UI shows. */
export function contentPlanForSite(data: DashboardData, siteId: string): ContentPlan | null {
  return data.contentPlans.find((c) => c.siteId === siteId) ?? null;
}

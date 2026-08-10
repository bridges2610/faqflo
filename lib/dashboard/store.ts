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
import { createClient as supabaseBrowser } from '@/lib/supabase/client';
import type { SiteRow } from '@/lib/supabase/types';
import { normalizeDomain } from './domain';
import { contentHash, normalizePath } from './export';
import { STAY_CITED_PROMPT_CAP, TRACKING_RUNS_PER_PERIOD } from './plans';
import { buildSeed, emptyTracking, newId } from './seed';
import type {
  ContentPlan,
  DashboardData,
  DiscoveredQuestion,
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
  audits: {},
};

function readLocal(userId: string): LocalData {
  const raw = window.localStorage.getItem(storageKey(userId));
  if (!raw) return EMPTY_LOCAL;
  try {
    return normaliseLocal(JSON.parse(raw) as LocalData);
  } catch {
    window.localStorage.removeItem(storageKey(userId));
    return EMPTY_LOCAL;
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
    questions: data.questions ?? [],
    tracking: (data.tracking ?? []).map(normaliseTracking),
    contentPlans: data.contentPlans ?? [],
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
 * cap. They are different units — 300 engine checks is 25 prompts across three
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
    promptCap: typeof legacy.promptCap === 'number' ? legacy.promptCap : STAY_CITED_PROMPT_CAP,
    runsPerPeriod:
      typeof legacy.runsPerPeriod === 'number' ? legacy.runsPerPeriod : TRACKING_RUNS_PER_PERIOD,
    checksUsed:
      typeof legacy.checksUsed === 'number'
        ? legacy.checksUsed
        : typeof legacy.queriesUsed === 'number'
          ? legacy.queriesUsed
          : latest.length,
    periodResetsAt: raw.periodResetsAt ?? new Date(Date.now() + 30 * 86_400_000).toISOString(),
  };
}

/**
 * Persist the local half and hand back the whole snapshot.
 *
 * `user` and the site rows are deliberately NOT written: they came from
 * Postgres, and a browser that can write its own copy of them is a browser
 * deciding its own entitlements again. Each site's `lastAudit` IS local, so it
 * is lifted out into the audits map on the way past.
 */
function write(data: DashboardData): DashboardData {
  const audits: Record<string, SiteAudit> = {};
  for (const site of data.sites) {
    if (site.lastAudit) audits[site.id] = site.lastAudit;
  }

  const local: LocalData = {
    groups: data.groups,
    faqs: data.faqs,
    questions: data.questions,
    tracking: data.tracking,
    contentPlans: data.contentPlans,
    audits,
  };

  window.localStorage.setItem(storageKey(requireUserId('write')), JSON.stringify(local));
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
    tracking: local.tracking,
    contentPlans: local.contentPlans,
  };
}

/** The snapshot as it stands right now. */
function requireData(fn: string): DashboardData {
  const userId = requireUserId(fn);
  if (!serverHalf) throw new Error(`${fn} called before the dashboard was loaded.`);

  return assemble(serverHalf.user, serverHalf.sites, readLocal(userId));
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

  return assemble(user, sites, readLocal(user.id));
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
 * Forget this account's local data.
 *
 * Not called on sign-out: the data is the customer's work, and silently
 * deleting it because they signed out on a shared laptop would be worse than
 * leaving it. Exposed so a "clear my local data" control can exist.
 */
export async function clearLocalData(): Promise<void> {
  const userId = requireUserId('clearLocalData');
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
    getCitedAt: row.get_cited_at,
    lastAudit: null,
    industry: row.industry,
    location: row.location,
    profileSource: row.profile_source,
  };
}

/** Re-read every site and rebuild the snapshot around it. */
async function refreshSites(fn: string): Promise<DashboardData> {
  const userId = requireUserId(fn);
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

  // assemble() rejoins each audit from local storage, so a rename doesn't lose
  // the report attached to the site being renamed.
  return assemble(serverHalf.user, sites, readLocal(userId));
}

export async function createSite(input: NewSite): Promise<DashboardData> {
  const data = requireData('createSite');
  const supabase = supabaseBrowser();

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
 * Keep the latest audit so the page shows its findings when you come back.
 *
 * Still local. An audit report is a large JSON blob that only its own account
 * ever reads, and moving it to Postgres buys nothing until it is shared or
 * queried across devices — which is the next migration, not this one.
 */
export async function saveAudit(siteId: string, report: SiteAudit): Promise<DashboardData> {
  const data = requireData('saveAudit');
  const sites = data.sites.map((s) => (s.id === siteId ? { ...s, lastAudit: report } : s));

  // Held on the server half too, so the next mutation's snapshot keeps it.
  if (serverHalf) serverHalf = { ...serverHalf, sites };

  return write({ ...data, sites });
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

export async function createGroup(siteId: string, input: NewGroup): Promise<DashboardData> {
  const data = requireData('createGroup');
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
  return write({
    ...data,
    groups: data.groups.map((g) =>
      g.id === id
        ? {
            ...g,
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
            ...(patch.path !== undefined ? { path: normalizePath(patch.path) } : {}),
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

export async function createFaqs(groupId: string, entries: NewFaq[]): Promise<DashboardData> {
  const data = requireData('createFaqs');
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

/* ------------------------------------------------------------ questions --- */

export async function markQuestionCovered(id: string): Promise<DashboardData> {
  const data = requireData('markQuestionCovered');
  return write({
    ...data,
    questions: data.questions.map((q) => (q.id === id ? { ...q, covered: true } : q)),
  });
}

export async function addQuestions(
  siteId: string,
  questions: { question: string; volume: number }[],
): Promise<DashboardData> {
  const data = requireData('addQuestions');
  const created: DiscoveredQuestion[] = questions.map((q) => ({
    id: newId('q'),
    siteId,
    question: q.question,
    volume: q.volume,
    covered: false,
    addedAt: now(),
  }));
  return write({ ...data, questions: [...data.questions, ...created] });
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

export function questionsForSite(data: DashboardData, siteId: string): DiscoveredQuestion[] {
  return data.questions.filter((q) => q.siteId === siteId).sort((a, b) => b.volume - a.volume);
}

export function trackingForSite(data: DashboardData, siteId: string) {
  return data.tracking.find((t) => t.siteId === siteId) ?? emptyTracking(siteId);
}

/** Null rather than an empty plan — "not generated yet" is a state the UI shows. */
export function contentPlanForSite(data: DashboardData, siteId: string): ContentPlan | null {
  return data.contentPlans.find((c) => c.siteId === siteId) ?? null;
}

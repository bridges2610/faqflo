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
import type { AuditRunRow, CitationCheckRow, SiteRow } from '@/lib/supabase/types';
import { normalizeDomain, sourceHost } from './domain';
import { contentHash, normalizePath } from './export';
import { faqCapFor, STAY_CITED_PROMPT_CAP, TRACKING_RUNS_PER_PERIOD } from './plans';
import { buildSeed, emptyTracking, newId } from './seed';
import { ENGINES } from './types';
import type {
  CitationCheck,
  CitationDay,
  CitedPage,
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

  It is keyed to hasGetCited rather than the 30-day window on purpose: this
  limits what may be KEPT, and shrinking it on day 31 would mean refusing to
  store answers somebody already paid to have written. What stops at day 31 is
  writing new ones, which is canRegenerate's job, on the server.

  Counted per SITE, not per group, because that is the unit Get Cited is sold in.
*/
export async function createFaqs(groupId: string, entries: NewFaq[]): Promise<DashboardData> {
  const data = requireData('createFaqs');

  const group = data.groups.find((g) => g.id === groupId);
  if (group) {
    const site = data.sites.find((s) => s.id === group.siteId) ?? null;
    const cap = faqCapFor(site);
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
  days = 30,
): Promise<SiteTracking | null> {
  assertClient('trackingFromDb');

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);

  const [checks, prompts] = await Promise.all([
    supabaseBrowser()
      .from('citation_checks')
      // ⚠️ `sources` is the expensive column and it is here on purpose: it is
      // the only record of WHO ELSE the engine cited, and share of voice is
      // built from it. Without it the ranking falls back to one domain per
      // check — 45 data points where 296 were collected.
      .select('id, site_id, question, engine, outcome, cited_instead, sources, checked_at')
      .eq('site_id', siteId)
      .gte('checked_at', since.toISOString())
      .order('checked_at', { ascending: false }),
    supabaseBrowser().from('tracked_prompts').select('id').eq('site_id', siteId),
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
      day = { date, byEngine: blankEngines(), checked: 0 };
      byDate.set(date, day);
    }
    day.checked += 1;
    if (check.outcome === 'cited') day.byEngine[check.engine] += 1;
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

  for (const row of rows) {
    // Defensive: `sources` is jsonb, so a malformed row is a possibility the
    // type system cannot rule out.
    const sources = Array.isArray(row.sources) ? (row.sources as unknown[]) : [];

    for (const value of sources) {
      if (typeof value !== 'string') continue;
      const host = sourceHost(value);
      if (!host) continue;

      sourceTotal += 1;
      tally.set(host, (tally.get(host) ?? 0) + 1);

      // Ours, and which page of ours — the actionable half of a citation.
      // Subdomains count as ours, matching isOurs() in lib/tracking/classify.ts.
      if (ours && (host === ours || host.endsWith(`.${ours}`))) {
        sourceOurs += 1;
        citedUrls.set(value, (citedUrls.get(value) ?? 0) + 1);
      }
    }
  }

  const competitors: CompetitorShare[] = [...tally.entries()]
    .map(([domain, citations]) => ({ domain, citations, isYou: domain === ours }))
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
    promptCap: STAY_CITED_PROMPT_CAP,
    runsPerPeriod: TRACKING_RUNS_PER_PERIOD,
    // The cost side, so it counts every call actually spent — the raw log, not
    // the deduped current state. Charging for one check when four ran would
    // make the quota bar a fiction.
    checksUsed: all.length,
    periodResetsAt: periodEnd(),
  };
}

function blankEngines(): Record<Engine, number> {
  return Object.fromEntries(ENGINES.map((e) => [e, 0])) as Record<Engine, number>;
}

/**
 * When the current tracking period rolls over.
 *
 * Thirty days from now, computed rather than stored — there is no billing
 * anniversary in the database to key it to yet. ⚠️ It therefore moves every time
 * the page loads, which is honest enough for a countdown but must NOT become
 * the thing a quota is enforced against. When enforcement arrives it wants a
 * real period row, not this.
 */
function periodEnd(): string {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + 30);
  return end.toISOString();
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
 * Store a freshly discovered set, replacing whatever was there for this site.
 *
 * Replace rather than append, for the same reason the content plan is one per
 * site: a second run produces a differently-worded version of the same list,
 * and appending would leave the customer scrolling through near-duplicates
 * deciding which one to trust.
 *
 * Questions the customer has already dealt with survive it. A question marked
 * covered represents work done, and discarding that on a re-run would ask them
 * to do it again — so covered rows are carried over and matched by key so the
 * new list doesn't re-propose them.
 *
 * ⚠️ No volume. Nothing measures it. See the note on DiscoveredQuestion.
 */
export type NewQuestion = { question: string; why?: string; intent?: string };

export async function addQuestions(
  siteId: string,
  questions: NewQuestion[],
): Promise<DashboardData> {
  const data = requireData('addQuestions');

  const kept = data.questions.filter((q) => q.siteId === siteId && q.covered);
  const keptKeys = new Set(kept.map((q) => questionKey(q.question)));

  const created: DiscoveredQuestion[] = questions
    .filter((q) => q.question.trim() && !keptKeys.has(questionKey(q.question)))
    .map((q) => ({
      id: newId('q'),
      siteId,
      question: q.question.trim(),
      why: q.why?.trim() || undefined,
      intent: q.intent,
      covered: false,
      addedAt: now(),
    }));

  const others = data.questions.filter((q) => q.siteId !== siteId);
  return write({ ...data, questions: [...others, ...kept, ...created] });
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

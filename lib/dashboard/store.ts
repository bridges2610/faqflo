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
import { contentHash, normalizePath } from './export';
import { buildSeed, emptyTracking, newId } from './seed';
import type {
  DashboardData,
  DiscoveredQuestion,
  FaqEntry,
  FaqGroup,
  Site,
  SiteAudit,
  User,
} from './types';

// v4: site.lastAudit went from a three-check summary to the full audit report.
// (v3 moved answers from site-scoped to group-scoped.) An older payload can't
// be read into these types, so the key moves rather than the data migrating.
const STORAGE_KEY = 'faqflo.dashboard.v4';

function assertClient(fn: string): void {
  if (typeof window === 'undefined') {
    throw new Error(`${fn} is client-only — call it from an effect or an event handler.`);
  }
}

function read(): DashboardData | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return normalise(JSON.parse(raw) as DashboardData);
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
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
function normalise(data: DashboardData): DashboardData {
  return {
    ...data,
    sites: (data.sites ?? []).map((site) => ({
      ...site,
      lastAudit: isAuditReport(site.lastAudit) ? site.lastAudit : null,
    })),
    groups: data.groups ?? [],
    faqs: data.faqs ?? [],
    questions: data.questions ?? [],
    tracking: data.tracking ?? [],
  };
}

function write(data: DashboardData): DashboardData {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
}

function requireData(fn: string): DashboardData {
  assertClient(fn);
  const data = read();
  if (!data) throw new Error(`${fn} called before the dashboard was loaded.`);
  return data;
}

function now(): string {
  return new Date().toISOString();
}

export async function loadDashboard(): Promise<DashboardData> {
  assertClient('loadDashboard');
  return read() ?? write(buildSeed());
}

export async function resetDashboard(): Promise<DashboardData> {
  assertClient('resetDashboard');
  return write(buildSeed());
}

export async function updateUser(patch: Partial<User>): Promise<DashboardData> {
  const data = requireData('updateUser');
  return write({ ...data, user: { ...data.user, ...patch } });
}

/* ---------------------------------------------------------------- sites --- */

export type NewSite = { name: string; domain: string };

export async function createSite(input: NewSite): Promise<DashboardData> {
  const data = requireData('createSite');
  const site: Site = {
    id: newId('site'),
    name: input.name.trim(),
    domain: normalizeDomain(input.domain),
    createdAt: now(),
    getCitedAt: null,
    lastAudit: null,
  };

  // A site with no group has nowhere to put an answer, so it gets one for its
  // home page immediately. The customer renames it or adds more.
  const group: FaqGroup = {
    id: newId('grp'),
    siteId: site.id,
    name: 'Home page',
    path: '/',
    position: 0,
    createdAt: now(),
    publishedAt: null,
    publishedHash: null,
  };

  return write({
    ...data,
    sites: [...data.sites, site],
    groups: [...data.groups, group],
    tracking: [...data.tracking, emptyTracking(site.id)],
  });
}

export async function updateSite(id: string, patch: Partial<NewSite>): Promise<DashboardData> {
  const data = requireData('updateSite');
  return write({
    ...data,
    sites: data.sites.map((s) =>
      s.id === id
        ? {
            ...s,
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
            ...(patch.domain !== undefined ? { domain: normalizeDomain(patch.domain) } : {}),
          }
        : s,
    ),
  });
}

export async function deleteSite(id: string): Promise<DashboardData> {
  const data = requireData('deleteSite');
  const groupIds = new Set(data.groups.filter((g) => g.siteId === id).map((g) => g.id));

  return write({
    ...data,
    sites: data.sites.filter((s) => s.id !== id),
    groups: data.groups.filter((g) => g.siteId !== id),
    faqs: data.faqs.filter((f) => !groupIds.has(f.groupId)),
    questions: data.questions.filter((q) => q.siteId !== id),
    tracking: data.tracking.filter((t) => t.siteId !== id),
  });
}

/**
 * Grant or revoke Get Cited for one site.
 *
 * In production this is written by the payment webhook, never by the client —
 * a browser that can grant its own entitlements has no entitlements. It exists
 * here because the entitlement currently lives in localStorage anyway, and the
 * UI labels the control as a demo action.
 */
export async function setGetCited(id: string, granted: boolean): Promise<DashboardData> {
  const data = requireData('setGetCited');
  return write({
    ...data,
    sites: data.sites.map((s) =>
      s.id === id ? { ...s, getCitedAt: granted ? (s.getCitedAt ?? now()) : null } : s,
    ),
  });
}

/** Keep the latest audit so the page shows its findings when you come back. */
export async function saveAudit(siteId: string, report: SiteAudit): Promise<DashboardData> {
  const data = requireData('saveAudit');
  return write({
    ...data,
    sites: data.sites.map((s) => (s.id === siteId ? { ...s, lastAudit: report } : s)),
  });
}

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

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

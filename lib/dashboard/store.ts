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
 * SSR: every entry point throws if called on the server. That's deliberate —
 * silently returning empty data would hide a real bug (a Server Component
 * trying to read user state) behind an empty dashboard.
 */

import { contentHash } from './export';
import { buildSeed, emptyTracking, newId } from './seed';
import type { DashboardData, DiscoveredQuestion, FaqEntry, Site, User } from './types';

// Bumped from v1: the model changed shape with the AEO pivot (widget traffic
// out, citations in), and rehydrating a v1 payload into these types would fail
// in a hundred small ways rather than one obvious one.
const STORAGE_KEY = 'faqflo.dashboard.v2';

function assertClient(fn: string): void {
  if (typeof window === 'undefined') {
    throw new Error(`${fn} is client-only — call it from an effect or an event handler.`);
  }
}

function read(): DashboardData | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DashboardData;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
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
    publishedAt: null,
    publishedHash: null,
    lastAudit: null,
  };
  return write({
    ...data,
    sites: [...data.sites, site],
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
  return write({
    ...data,
    sites: data.sites.filter((s) => s.id !== id),
    faqs: data.faqs.filter((f) => f.siteId !== id),
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

/**
 * Record that the customer has pasted the current export onto their live site.
 *
 * Storing the hash at this moment is what makes the staleness nudge work later:
 * the content is re-pasted by hand, so the only way to know the live copy has
 * drifted is to remember what it looked like when they said they pasted it.
 */
export async function markPublished(id: string): Promise<DashboardData> {
  const data = requireData('markPublished');
  const site = data.sites.find((s) => s.id === id);
  if (!site) return data;

  const hash = contentHash(
    site,
    data.faqs.filter((f) => f.siteId === id),
  );

  return write({
    ...data,
    sites: data.sites.map((s) =>
      s.id === id ? { ...s, publishedAt: now(), publishedHash: hash } : s,
    ),
  });
}

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
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

export async function createFaqs(siteId: string, entries: NewFaq[]): Promise<DashboardData> {
  const data = requireData('createFaqs');
  const start = data.faqs.filter((f) => f.siteId === siteId).length;
  const stamp = now();

  const created: FaqEntry[] = entries.map((e, i) => ({
    id: newId('faq'),
    siteId,
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
      f.siteId === target.siteId && f.position > target.position
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
    (f) => f.siteId === target.siteId && f.position === neighbourPosition,
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

/* ------------------------------------------------------------ questions --- */

/** Mark a discovered question as covered once an answer has been drafted. */
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

export function faqsForSite(data: DashboardData, siteId: string): FaqEntry[] {
  return data.faqs.filter((f) => f.siteId === siteId).sort((a, b) => a.position - b.position);
}

export function publishedFaqs(data: DashboardData, siteId: string): FaqEntry[] {
  return faqsForSite(data, siteId).filter((f) => f.status === 'published');
}

export function questionsForSite(data: DashboardData, siteId: string): DiscoveredQuestion[] {
  return data.questions
    .filter((q) => q.siteId === siteId)
    .sort((a, b) => b.volume - a.volume);
}

export function trackingForSite(data: DashboardData, siteId: string) {
  return data.tracking.find((t) => t.siteId === siteId) ?? emptyTracking(siteId);
}

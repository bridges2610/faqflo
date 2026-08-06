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

import { buildSeed, emptyAnalytics, newId } from './seed';
import type { DashboardData, FaqEntry, Site, User } from './types';

const STORAGE_KEY = 'faqflo.dashboard.v1';

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
    // Corrupt or half-written payload: drop it and reseed rather than leaving
    // the dashboard permanently broken for that browser.
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

/** Load, seeding on first visit. The only function that may run with no data. */
export async function loadDashboard(): Promise<DashboardData> {
  assertClient('loadDashboard');
  return read() ?? write(buildSeed());
}

/** Wipe and reseed — the dev "reset demo data" action. */
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
    installedAt: null,
    lastSeenAt: null,
  };
  return write({
    ...data,
    sites: [...data.sites, site],
    analytics: [...data.analytics, emptyAnalytics(site.id)],
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

/**
 * Record that the widget has been seen on a site.
 *
 * In production this is written by the embed's first request, never by the
 * dashboard — installation is something we observe, not something the customer
 * asserts. It's exposed here so the demo has a way to reach the installed
 * state, and the Setup page labels that control as a demo action.
 */
export async function markSiteInstalled(id: string): Promise<DashboardData> {
  const data = requireData('markSiteInstalled');
  const stamp = now();
  return write({
    ...data,
    sites: data.sites.map((s) =>
      s.id === id ? { ...s, installedAt: s.installedAt ?? stamp, lastSeenAt: stamp } : s,
    ),
  });
}

/** Deleting a site takes its FAQs and analytics with it — the cascade a
    foreign key would do for us later. */
export async function deleteSite(id: string): Promise<DashboardData> {
  const data = requireData('deleteSite');
  return write({
    ...data,
    sites: data.sites.filter((s) => s.id !== id),
    faqs: data.faqs.filter((f) => f.siteId !== id),
    analytics: data.analytics.filter((a) => a.siteId !== id),
  });
}

/** Strip scheme, path and any trailing slash so the stored value is a bare host. */
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

/** Append entries to a site, keeping `position` contiguous. */
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

  // Close the gap left behind so positions stay contiguous within the site.
  const faqs = data.faqs
    .filter((f) => f.id !== id)
    .map((f) =>
      f.siteId === target.siteId && f.position > target.position
        ? { ...f, position: f.position - 1 }
        : f,
    );

  return write({ ...data, faqs });
}

/** Swap an entry with its neighbour. No-op at either end of the list. */
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

/* ------------------------------------------------------------- selectors --- */
/* Pure reads over a snapshot. They live here so the same "query" is used by
   every page, rather than each one filtering the array its own way. */

export function faqsForSite(data: DashboardData, siteId: string): FaqEntry[] {
  return data.faqs.filter((f) => f.siteId === siteId).sort((a, b) => a.position - b.position);
}

export function publishedFaqs(data: DashboardData, siteId: string): FaqEntry[] {
  return faqsForSite(data, siteId).filter((f) => f.status === 'published');
}

export function analyticsForSite(data: DashboardData, siteId: string) {
  return data.analytics.find((a) => a.siteId === siteId) ?? emptyAnalytics(siteId);
}

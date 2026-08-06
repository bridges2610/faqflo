/**
 * Demo data for a fresh dashboard.
 *
 * Runs on the client only, after mount — every value here depends on Date.now()
 * or Math.random(), so generating it during SSR would produce different markup
 * on the server than on the client and hydration would tear. lib/dashboard/
 * store.ts is what enforces that; this file just builds the objects.
 *
 * The site is the same roofing business the homepage hero uses, so a first look
 * at the dashboard matches the story the marketing page just told.
 */

import type {
  DayPoint,
  FaqEntry,
  QuestionStat,
  Site,
  SiteAnalytics,
  UnansweredQuery,
  User,
  DashboardData,
} from './types';

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

/** ISO string for N days before now. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/** YYYY-MM-DD for N days before today, in local time. */
function dateKey(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

const SEED_FAQS: { q: string; a: string; status: 'published' | 'draft' }[] = [
  {
    q: 'Do you handle emergency roof repairs?',
    a: 'Yes — we keep two crews on call for emergency work and usually reach you within 24 hours. Call the office line and describe the leak; we will tell you what to do to limit damage while we are on the way.',
    status: 'published',
  },
  {
    q: 'Which areas do you cover?',
    a: 'We work across Franklin and the surrounding towns within about a 30-mile radius. If you are just outside that, call anyway — we will tell you honestly whether the trip makes sense.',
    status: 'published',
  },
  {
    q: 'How much does a roof inspection cost?',
    a: 'Inspections are free for homeowners in our service area, and you get a written report with photographs. There is no obligation to book the repair with us afterwards.',
    status: 'published',
  },
  {
    q: 'How long does a full roof replacement take?',
    a: 'A typical single-family home takes two to three days once materials are on site. Weather is the main variable, and we will give you a firm window before we start.',
    status: 'published',
  },
  {
    q: 'Do you work with insurance claims?',
    a: 'We do. We document the damage in the format adjusters expect and can speak to your insurer directly if you would rather not manage it yourself.',
    status: 'published',
  },
  {
    q: 'What warranty comes with the work?',
    a: 'Workmanship is covered for ten years and materials carry the manufacturer warranty, usually 25 to 30 years. Both are written into the contract before any work begins.',
    status: 'draft',
  },
];

/** Plausible daily traffic: a weekly rhythm with a slow upward drift. */
function seedDaily(days: number): DayPoint[] {
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dow = new Date(Date.now() - i * 86_400_000).getDay();
    const weekend = dow === 0 || dow === 6;
    const drift = (days - i) / days; // 0 → 1 across the window
    const base = (weekend ? 14 : 32) * (0.75 + drift * 0.5);
    const views = Math.round(base + Math.random() * 10);
    // Expand rate sits around a third of views — the number that matters, since
    // an expand is someone actually reading an answer.
    const expands = Math.round(views * (0.28 + Math.random() * 0.12));
    out.push({ date: dateKey(i), views, expands });
  }
  return out;
}

const SEED_UNANSWERED: { query: string; count: number; days: number }[] = [
  { query: 'do you do gutter cleaning', count: 34, days: 1 },
  { query: 'financing options for a new roof', count: 27, days: 2 },
  { query: 'metal roof vs shingles cost', count: 19, days: 1 },
  { query: 'do you offer commercial roofing', count: 15, days: 4 },
  { query: 'solar panel removal and refit', count: 11, days: 6 },
  { query: 'how soon can you start', count: 8, days: 3 },
];

export function buildSeed(): DashboardData {
  const site: Site = {
    id: newId('site'),
    name: 'Summit Roofing',
    domain: 'summitroofing.com',
    createdAt: daysAgo(38),
    installedAt: daysAgo(31),
    lastSeenAt: daysAgo(0),
  };

  const faqs: FaqEntry[] = SEED_FAQS.map((f, i) => ({
    id: newId('faq'),
    siteId: site.id,
    question: f.q,
    answer: f.a,
    status: f.status,
    position: i,
    source: 'generated',
    tone: 'Professional',
    language: 'English',
    createdAt: daysAgo(30 - i),
    updatedAt: daysAgo(Math.max(0, 12 - i * 2)),
  }));

  const daily = seedDaily(30);

  // Question stats are anchored to the published FAQs so the analytics page and
  // the FAQ list can never disagree about what exists.
  const published = faqs.filter((f) => f.status === 'published');
  const totalExpands = daily.reduce((sum, d) => sum + d.expands, 0);
  const weights = published.map((_, i) => published.length - i + Math.random());
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const questions: QuestionStat[] = published.map((faq, i) => {
    const share = weights[i] / weightSum;
    const expands = Math.round(totalExpands * share);
    return {
      faqId: faq.id,
      question: faq.question,
      // Every expand implies a view, plus the people who read the question and
      // moved on — so views are always the larger number.
      views: Math.round(expands * (2.2 + Math.random() * 0.8)),
      expands,
    };
  });

  const unanswered: UnansweredQuery[] = SEED_UNANSWERED.map((u) => ({
    query: u.query,
    count: u.count,
    lastAskedAt: daysAgo(u.days),
  }));

  const analytics: SiteAnalytics[] = [{ siteId: site.id, daily, questions, unanswered }];

  const user: User = {
    id: newId('user'),
    name: 'Beau Bridges',
    email: 'beau@coastalpanda.com',
    plan: 'business',
    planSince: daysAgo(38),
  };

  return { user, sites: [site], faqs, analytics };
}

/** A blank analytics bundle for a site that has no traffic yet. */
export function emptyAnalytics(siteId: string): SiteAnalytics {
  return { siteId, daily: [], questions: [], unanswered: [] };
}

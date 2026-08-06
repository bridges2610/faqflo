/**
 * Demo data for a fresh dashboard.
 *
 * Runs on the client only, after mount — every value here depends on Date.now()
 * or Math.random(), so generating it during SSR would produce different markup
 * on the server than on the client and hydration would tear. lib/dashboard/
 * store.ts is what enforces that; this file just builds the objects.
 *
 * The demo account has Get Cited on its one site and an active Stay Cited
 * subscription, so every surface has something in it. The entitlement switcher
 * in the header is how you see the locked states.
 */

import { ENGINES, type CitationCheck, type CitationDay, type CompetitorShare, type DashboardData, type DiscoveredQuestion, type Engine, type FaqEntry, type Site, type SiteTracking, type User } from './types';
import { STAY_CITED_QUERY_CAP } from './plans';

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function daysAhead(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

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
    a: 'Yes. Summit Roofing keeps two crews on call for emergency work across Franklin and is usually on site within 24 hours. Call the office line and describe the leak, and we will tell you how to limit the damage while we are on the way.',
    status: 'published',
  },
  {
    q: 'Which areas does Summit Roofing cover?',
    a: 'We work across Franklin and the surrounding towns within roughly a 30-mile radius, including Brentwood, Spring Hill and Nolensville. If you are just outside that, call anyway and we will tell you honestly whether the trip makes sense.',
    status: 'published',
  },
  {
    q: 'How much does a roof inspection cost in Franklin?',
    a: 'Roof inspections are free for homeowners in our service area, and you receive a written report with photographs. There is no obligation to book the repair with us afterwards.',
    status: 'published',
  },
  {
    q: 'How long does a full roof replacement take?',
    a: 'A typical single-family home takes two to three days once materials are on site. Weather is the main variable, and we give you a firm window before work begins.',
    status: 'published',
  },
  {
    q: 'Does Summit Roofing work with insurance claims?',
    a: 'Yes. We document storm and hail damage in the format adjusters expect, and we can speak to your insurer directly if you would rather not manage the claim yourself.',
    status: 'published',
  },
  {
    q: 'What warranty comes with the work?',
    a: 'Workmanship is covered for ten years and materials carry the manufacturer warranty, usually 25 to 30 years. Both are written into the contract before any work begins.',
    status: 'draft',
  },
];

const SEED_QUESTIONS: { q: string; volume: number; covered: boolean }[] = [
  { q: 'who repairs roofs in Franklin TN', volume: 480, covered: true },
  { q: 'emergency roof repair near me', volume: 390, covered: true },
  { q: 'how much does a new roof cost in Tennessee', volume: 320, covered: false },
  { q: 'does insurance cover hail damage to a roof', volume: 260, covered: true },
  { q: 'metal roof vs shingles which is better', volume: 210, covered: false },
  { q: 'roof financing options for homeowners', volume: 170, covered: false },
  { q: 'how long does a roof last', volume: 140, covered: false },
  { q: 'do roofers clean gutters too', volume: 90, covered: false },
];

/* Other people's domains only. The customer's own domain must never appear
   here: "we weren't in the answer, and the site that was is you" is a
   contradiction, and it silently inflates their own share of voice. */
const COMPETITORS = ['franklinroofpros.com', 'tnroofmasters.com', 'angi.com', 'thumbtack.com'];

/** Citation counts per engine per day, drifting upward as answers land. */
function seedDaily(days: number): CitationDay[] {
  const out: CitationDay[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const progress = (days - i) / days;
    const byEngine = {} as Record<Engine, number>;

    for (const engine of ENGINES) {
      // Perplexity cites sources most readily, so it moves first — that's the
      // engine a customer will see results on soonest.
      const bias = engine === 'Perplexity' ? 1.6 : engine === 'ChatGPT' ? 1.1 : 0.7;
      byEngine[engine] = Math.max(0, Math.round(progress * 6 * bias + Math.random() * 2 - 0.5));
    }

    out.push({ date: dateKey(i), byEngine, checked: 8 });
  }

  return out;
}

function seedChecks(siteId: string): CitationCheck[] {
  const questions = SEED_QUESTIONS.slice(0, 5);
  const checks: CitationCheck[] = [];

  questions.forEach((q, qi) => {
    ENGINES.forEach((engine, ei) => {
      // Covered questions get cited more often than uncovered ones — the whole
      // point of the loop is that publishing an answer changes this.
      const roll = (qi + ei) % 3;
      const outcome =
        q.covered && roll === 0 ? 'cited' : q.covered && roll === 1 ? 'mentioned' : 'absent';

      checks.push({
        id: newId('chk'),
        siteId,
        question: q.q,
        engine,
        outcome,
        citedInstead: outcome === 'absent' ? COMPETITORS[(qi + ei) % COMPETITORS.length] : null,
        checkedAt: daysAgo(qi % 4),
      });
    });
  });

  return checks;
}

export function buildSeed(): DashboardData {
  const site: Site = {
    id: newId('site'),
    name: 'Summit Roofing',
    domain: 'summitroofing.com',
    createdAt: daysAgo(38),
    getCitedAt: daysAgo(31),
    publishedAt: daysAgo(24),
    // Left deliberately mismatched with the current answer set, so the "your
    // live copy is out of date" nudge is visible on a fresh install rather than
    // being something you have to go and provoke.
    publishedHash: 'stale00',
    lastAudit: {
      score: 72,
      checkedAt: daysAgo(6),
      checks: [
        {
          id: 'raw-html',
          label: 'Content readable without JavaScript',
          status: 'pass',
          detail: 'About 1,240 words are in the HTML itself.',
        },
        {
          id: 'crawlers',
          label: 'AI crawlers allowed',
          status: 'pass',
          detail: 'GPTBot, ClaudeBot, Google-Extended and PerplexityBot are all permitted.',
        },
        {
          id: 'schema',
          label: 'Questions marked up for machines',
          status: 'warn',
          detail: 'Organization markup is present, but the published answers are not marked up yet.',
        },
        {
          id: 'cited',
          label: 'Cited in AI answers today',
          status: 'warn',
          detail: 'Cited for 2 of the 8 questions we checked.',
        },
      ],
    },
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

  const questions: DiscoveredQuestion[] = SEED_QUESTIONS.map((q, i) => ({
    id: newId('q'),
    siteId: site.id,
    question: q.q,
    volume: q.volume,
    covered: q.covered,
    addedAt: daysAgo(10 - i),
  }));

  const latest = seedChecks(site.id);
  const citedCounts = new Map<string, number>();
  for (const check of latest) {
    if (check.outcome === 'cited') {
      citedCounts.set(site.domain, (citedCounts.get(site.domain) ?? 0) + 1);
    } else if (check.citedInstead) {
      citedCounts.set(check.citedInstead, (citedCounts.get(check.citedInstead) ?? 0) + 1);
    }
  }

  const competitors: CompetitorShare[] = [...citedCounts.entries()]
    .map(([domain, citations]) => ({ domain, citations, isYou: domain === site.domain }))
    .sort((a, b) => b.citations - a.citations);

  const tracking: SiteTracking[] = [
    {
      siteId: site.id,
      daily: seedDaily(30),
      latest,
      competitors,
      queriesUsed: 186,
      queryCap: STAY_CITED_QUERY_CAP,
      periodResetsAt: daysAhead(11),
    },
  ];

  const user: User = {
    id: newId('user'),
    name: 'Beau Bridges',
    email: 'beau@coastalpanda.com',
    subscription: 'stay_cited',
    subscriptionSince: daysAgo(31),
  };

  return { user, sites: [site], faqs, questions, tracking };
}

export function emptyTracking(siteId: string): SiteTracking {
  return {
    siteId,
    daily: [],
    latest: [],
    competitors: [],
    queriesUsed: 0,
    queryCap: STAY_CITED_QUERY_CAP,
    periodResetsAt: daysAhead(30),
  };
}

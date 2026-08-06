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

import {
  ENGINES,
  type CitationCheck,
  type CitationDay,
  type CompetitorShare,
  type DashboardData,
  type DiscoveredQuestion,
  type Engine,
  type FaqEntry,
  type FaqGroup,
  type Site,
  type SiteTracking,
  type User,
} from './types';
import { buildActionPlan } from '@/lib/audit/actions';
import { buildPillars, overallScore } from '@/lib/audit/score';
import type { AuditReport, Finding } from '@/lib/audit/types';
import { contentHash } from './export';
import { STAY_CITED_PROMPT_CAP, TRACKING_RUNS_PER_PERIOD } from './plans';

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

/*
  Two groups, because one group wouldn't show why groups exist.

  The service page is left deliberately stale (its stored hash won't match its
  answers) and the pricing page is current, so both states of the publish nudge
  are visible side by side the first time the dashboard is opened.
*/
type SeedGroup = {
  name: string;
  path: string;
  /** 'stale' stores a hash that can't match; 'current' stores the real one. */
  state: 'stale' | 'current';
  faqs: { q: string; a: string; status: 'published' | 'draft' }[];
};

const SEED_GROUPS: SeedGroup[] = [
  {
    name: 'Service page',
    path: '/services',
    state: 'stale',
    faqs: [
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
        q: 'How long does a full roof replacement take?',
        a: 'A typical single-family home takes two to three days once materials are on site. Weather is the main variable, and we give you a firm window before work begins.',
        status: 'published',
      },
      {
        q: 'Does Summit Roofing work with insurance claims?',
        a: 'Yes. We document storm and hail damage in the format adjusters expect, and we can speak to your insurer directly if you would rather not manage the claim yourself.',
        status: 'published',
      },
    ],
  },
  {
    name: 'Pricing page',
    path: '/pricing',
    state: 'current',
    faqs: [
      {
        q: 'How much does a roof inspection cost in Franklin?',
        a: 'Roof inspections are free for homeowners in our service area, and you receive a written report with photographs. There is no obligation to book the repair with us afterwards.',
        status: 'published',
      },
      {
        q: 'What warranty comes with the work?',
        a: 'Workmanship is covered for ten years and materials carry the manufacturer warranty, usually 25 to 30 years. Both are written into the contract before any work begins.',
        status: 'draft',
      },
    ],
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

/**
 * A stored audit for the demo site.
 *
 * The findings are written out; the score is NOT. It's computed by the same
 * scorer the live audit uses, so the demo can't quietly assert a number its own
 * arithmetic wouldn't produce — and it stays right if the weights ever change.
 */
function seedAudit(): AuditReport {
  const findings: Finding[] = [
    {
      id: 'raw-html',
      pillar: 'technical',
      label: 'Content readable without JavaScript',
      status: 'pass',
      detail: 'About 1,240 words are in the HTML itself, so a crawler sees them on the very first request.',
      weight: 3,
    },
    {
      id: 'crawlers',
      pillar: 'technical',
      label: 'AI crawlers allowed',
      status: 'pass',
      detail: 'GPTBot, ClaudeBot, Google-Extended and PerplexityBot are all permitted by robots.txt.',
      weight: 3,
    },
    {
      id: 'sitemap',
      pillar: 'technical',
      label: 'Sitemap available',
      status: 'warn',
      detail: 'A sitemap.xml exists, but robots.txt does not mention it.',
      weight: 2,
    },
    {
      id: 'qa-markup',
      pillar: 'structure',
      label: 'Questions marked up for machines',
      status: 'warn',
      detail: 'Two pages carry question markup; the rest do not.',
      weight: 3,
    },
    {
      id: 'answer-first',
      pillar: 'structure',
      label: 'Answers come first',
      status: 'pass',
      detail: '5 of 6 questions are answered in a short paragraph directly underneath.',
      weight: 3,
    },
    {
      id: 'specificity',
      pillar: 'structure',
      label: 'Answers are specific',
      status: 'pass',
      detail: 'The copy carries concrete detail — timeframes, coverage areas, warranty lengths.',
      weight: 2,
    },
    {
      id: 'title',
      pillar: 'seo',
      label: 'Every page has a title',
      status: 'pass',
      detail: 'All 4 crawled pages have a title tag.',
      weight: 3,
    },
    {
      id: 'meta-description',
      pillar: 'seo',
      label: 'Pages have meta descriptions',
      status: 'fail',
      detail: '3 of 4 pages have no meta description.',
      weight: 2,
    },
    {
      id: 'org-schema',
      pillar: 'citation',
      label: 'Business identified in structured data',
      status: 'warn',
      detail: 'There is business markup, but it is missing a url.',
      weight: 3,
    },
    {
      id: 'llms-txt',
      pillar: 'citation',
      label: 'llms.txt published',
      status: 'fail',
      detail: 'No llms.txt at the site root.',
      weight: 1,
    },
    {
      id: 'identity-pages',
      pillar: 'authority',
      label: 'About and contact pages exist',
      status: 'pass',
      detail: 'Both an about page and a contact page were found.',
      weight: 3,
    },
    {
      id: 'social-proof',
      pillar: 'authority',
      label: 'Reviews or testimonials',
      status: 'warn',
      detail: 'Testimonials appear in the copy but carry no markup.',
      weight: 2,
    },
  ];

  const pillars = buildPillars(findings);

  return {
    depth: 'full',
    url: 'https://summitroofing.com/',
    domain: 'summitroofing.com',
    score: overallScore(pillars),
    scoredCount: pillars.reduce((n, p) => n + p.scoredCount, 0),
    pillars,
    // Built by the real planner from the findings above, not written out — so
    // the demo's plan is ranked and costed by the same code a live audit uses,
    // and its "+N points" are as derived as anyone else's.
    actions: buildActionPlan(findings, {
      domain: 'summitroofing.com',
      faqsHref: '/dashboard/faqs',
      publishHref: '/dashboard/publish',
      questionsHref: '/dashboard/questions',
    }),
    // Opportunities come from live account state, so the workspace recomputes
    // them on render rather than trusting a stored snapshot.
    opportunities: [],
    discovered: 4,
    skipped: [],
    stoppedBecause: 'exhausted',
    crawled: [
      { url: 'https://summitroofing.com/', status: 200, finalUrl: 'https://summitroofing.com/', bytes: 41_200, ms: 420 },
      { url: 'https://summitroofing.com/services', status: 200, finalUrl: 'https://summitroofing.com/services', bytes: 33_100, ms: 380 },
      { url: 'https://summitroofing.com/pricing', status: 200, finalUrl: 'https://summitroofing.com/pricing', bytes: 21_800, ms: 350 },
      { url: 'https://summitroofing.com/about', status: 200, finalUrl: 'https://summitroofing.com/about', bytes: 18_400, ms: 330 },
    ],
    checkedAt: daysAgo(6),
  };
}

export function buildSeed(): DashboardData {
  const site: Site = {
    id: newId('site'),
    name: 'Summit Roofing',
    domain: 'summitroofing.com',
    createdAt: daysAgo(38),
    getCitedAt: daysAgo(31),
    lastAudit: seedAudit(),
  };

  const groups: FaqGroup[] = [];
  const faqs: FaqEntry[] = [];

  SEED_GROUPS.forEach((seed, gi) => {
    const group: FaqGroup = {
      id: newId('grp'),
      siteId: site.id,
      name: seed.name,
      path: seed.path,
      position: gi,
      createdAt: daysAgo(30 - gi),
      publishedAt: daysAgo(24 - gi * 6),
      publishedHash: null, // set below, once its answers exist
    };

    const entries: FaqEntry[] = seed.faqs.map((f, i) => ({
      id: newId('faq'),
      groupId: group.id,
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

    // 'stale' stores a hash that cannot match anything, so the group opens in
    // the out-of-date state; 'current' stores the real hash of what it holds.
    group.publishedHash = seed.state === 'stale' ? 'staleseed' : contentHash(entries);

    groups.push(group);
    faqs.push(...entries);
  });

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
      promptsTracked: 12,
      promptCap: STAY_CITED_PROMPT_CAP,
      runsPerPeriod: TRACKING_RUNS_PER_PERIOD,
      checksUsed: 186,
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

  return { user, sites: [site], groups, faqs, questions, tracking };
}

export function emptyTracking(siteId: string): SiteTracking {
  return {
    siteId,
    daily: [],
    latest: [],
    competitors: [],
    promptsTracked: 0,
    promptCap: STAY_CITED_PROMPT_CAP,
    runsPerPeriod: TRACKING_RUNS_PER_PERIOD,
    checksUsed: 0,
    periodResetsAt: daysAhead(30),
  };
}

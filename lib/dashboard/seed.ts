/**
 * Demo data for a fresh dashboard.
 *
 * Runs on the client only, after mount — every value here depends on Date.now()
 * or Math.random(), so generating it during SSR would produce different markup
 * on the server than on the client and hydration would tear. lib/dashboard/
 * store.ts is what enforces that; this file just builds the objects.
 *
 * The demo account is on Pro, so every surface has something in it rather than
 * an upgrade card. To see the locked states, flip SHOT_USER.plan to 'free' in
 * app/(dev)/shots/page.tsx — the switcher that used to do it from the header is
 * gone, because the plan is a column the browser cannot write.
 */

import { countWords } from '@/lib/article';
import {
  ENGINES,
  type Article,
  type CitationCheck,
  type ActionTick,
  type Competitor,
  type CitationDay,
  type CitedPage,
  type CompetitorShare,
  type EngineBreakdown,
  type ContentPlan,
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
import { sourceKind } from './platforms';
import { contentHash } from './export';
import { TRACKING_PLANS } from './plans';

/**
 * A unique id for a row the browser is about to create.
 *
 * ⚠️ THIS BECAME LOAD-BEARING IN 0009. It used to be six base-36 characters
 * from Math.random() — about 2.2 billion values, which is fine for a demo
 * fixture and not fine for a primary key. Groups, answers and questions are
 * database rows now, so a collision is no longer a confusing UI glitch: it is
 * an insert that violates a primary key and a mutation that throws in the
 * customer's face.
 *
 * The prefix is kept because it makes an id readable in a query result, and
 * because the ids already in customers' browsers carry it — those import
 * unchanged, so the two formats coexist by design.
 */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
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
  Three sets, because one wouldn't show why sets exist.

  The service page is left deliberately stale (its stored hash won't match its
  answers) and the pricing page is current, so both states of the publish nudge
  are visible side by side the first time the dashboard is opened.

  ⚠️ THE THIRD HAS NO PATH ON PURPOSE. That is what a freshly generated set
  looks like before anybody has said where it goes, and it is the state the
  export has to handle without inventing a URL — see FaqGroup.path.
*/
type SeedGroup = {
  name: string;
  path: string | null;
  /** 'stale' stores a hash that can't match; 'current' stores the real one. */
  state: 'stale' | 'current';
  faqs: { q: string; a: string; status: 'published' | 'draft' }[];
};

const SEED_GROUPS: SeedGroup[] = [
  {
    // Freshly generated and not yet placed: no path, nothing pasted.
    name: 'Warranty and guarantees',
    path: null,
    state: 'current',
    faqs: [
      {
        q: 'What does the workmanship warranty cover?',
        a: 'It covers the work itself — flashing, fixings and the way the materials were fitted. If something we installed lets water in, we come back and put it right at no charge.',
        status: 'draft',
      },
      {
        q: 'Is the warranty transferable if I sell the house?',
        a: 'Yes. Tell us who the new owner is and we move it across, which is worth doing before the sale rather than after.',
        status: 'draft',
      },
    ],
  },
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

/*
  Shaped like what the discovery route actually returns, so the demo shows the
  real screen rather than a version of it.

  The old fixture carried a `volume` per question — 480, 390, 320 — which the UI
  rendered as "About 480 asks a month". Nothing measures that, so the field is
  gone from the model and from here. Questions are also phrased as a person
  talks to an assistant now, in full sentences, because that is what the prompt
  asks for and a demo that disagrees with the product is a misleading demo.
*/
const SEED_QUESTIONS: { q: string; why: string; intent: string; covered: boolean }[] = [
  {
    q: 'Who repairs roofs in Franklin, TN?',
    why: 'The plainest version of the question a customer with a leak asks first, and the one where being named decides who gets called.',
    intent: 'service',
    covered: true,
  },
  {
    q: 'Can someone come out today for an emergency roof repair?',
    why: 'Urgency questions convert immediately — whoever the assistant names is usually the only one contacted.',
    intent: 'logistics',
    covered: true,
  },
  {
    q: 'How much does a new roof cost in Tennessee?',
    why: 'You publish real ranges and most competitors publish none, so a specific answer here is easy to quote.',
    intent: 'pricing',
    covered: false,
  },
  {
    q: 'Does home insurance cover hail damage to a roof?',
    why: 'Answering the insurance question builds trust before the sales conversation, and you handle these claims already.',
    intent: 'problem',
    covered: true,
  },
  {
    q: 'Is a metal roof better than shingles?',
    why: 'A comparison you can answer from real jobs in this climate rather than in general terms.',
    intent: 'service',
    covered: false,
  },
  {
    q: 'Are there financing options for a roof replacement?',
    why: 'Cost is the usual reason a job stalls, and you offer terms your site does not currently mention.',
    intent: 'pricing',
    covered: false,
  },
  {
    q: 'How long should a roof last before it needs replacing?',
    why: 'The question people ask before they are ready to buy — answering it is how you are the name they remember later.',
    intent: 'problem',
    covered: false,
  },
  {
    q: 'Do roofers clean gutters as part of the job?',
    why: 'A small scope question that decides between two quotes, and yours includes it.',
    intent: 'service',
    covered: false,
  },
];

/* Other people's domains only. The customer's own domain must never appear
   here: "we weren't in the answer, and the site that was is you" is a
   contradiction, and it silently inflates their own share of voice. */
const COMPETITORS = ['franklinroofpros.com', 'tnroofmasters.com', 'angi.com', 'thumbtack.com'];

/**
 * Day-to-day jitter, in place of Math.random().
 *
 * ⚠️ IT HAS TO BE DETERMINISTIC, AND THAT IS NOT ABOUT HYDRATION. This whole
 * file already runs client-only for that reason. It is about the marketing
 * screenshots: app/(dev)/shots renders this fixture and scripts/shots.mjs
 * captures it, so a random call here means every regeneration produces four
 * subtly different PNGs and no reviewable diff — the chart would reshuffle on
 * a run that changed nothing.
 *
 * A hash of the day index and the engine name, folded into 0–1. Not good
 * randomness and does not need to be: the only job is a line that looks
 * measured rather than drawn with a ruler, identically every time.
 */
function wobble(day: number, engine: string): number {
  let h = day * 2654435761;
  for (let i = 0; i < engine.length; i++) h = (h ^ engine.charCodeAt(i)) * 16777619;
  // >>> 0 first: the multiplications above overflow into negatives, and a
  // negative modulo would hand back a negative "random".
  return ((h >>> 0) % 1000) / 1000;
}

/** Citation counts per engine per day, drifting upward as answers land. */
/**
 * The chart's points.
 *
 * ⚠️ TAKES DAYS-AGO PER POINT, NOT A COUNT OF CONSECUTIVE DAYS. It used to take
 * a number and walk backwards one day at a time, which was right when a
 * subscriber's chart was a daily line. A scheduled plan's points are weeks
 * apart, and consecutive dates under them would show five checks in one week —
 * the fixture claiming a cadence the product does not have, on the screenshots
 * that sell it.
 */
function seedDaily(offsets: number[]): CitationDay[] {
  const out: CitationDay[] = [];
  const days = offsets.length;

  /* ⚠️ OLDEST FIRST, TO MATCH REAL DATA. buildTracking sorts its days
     ascending by date, and CitationChart plots array order — so a fixture in
     the other order draws time running backwards. `.reverse()` did exactly
     that for [32, 25, 2]: it produced 30/8, 7/8, 31/7 along the x-axis, and
     because `progress` ramps with the index, the newest day also got the
     LOWEST value. The demo chart therefore showed citations falling when it
     was written to show them rising, in the marketing screenshots as well as
     the dashboard. Sorting by offset descending puts the oldest day first. */
  for (const [index, offset] of [...offsets].sort((a, b) => b - a).entries()) {
    const i = offset;
    const progress = (days - (days - 1 - index)) / days;
    const byEngine = {} as Record<Engine, number>;

    for (const engine of ENGINES) {
      // Perplexity cites sources most readily, so it moves first — that's the
      // engine a customer will see results on soonest.
      const bias = engine === 'Perplexity' ? 1.6 : engine === 'ChatGPT' ? 1.1 : 0.7;
      byEngine[engine] = Math.max(0, Math.round(progress * 6 * bias + wobble(i, engine) * 2 - 0.5));
    }

    const cited = ENGINES.reduce((n, e) => n + byEngine[e], 0);
    out.push({
      date: dateKey(i),
      byEngine,
      checked: 8,
      cited,
      // A couple named-but-unlinked on the days with any traction, so the
      // fixture exercises the mentions delta rather than a flat zero.
      mentioned: cited > 0 ? Math.min(2, Math.round(progress * 2)) : 0,
    });
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
        /*
          Enough of an answer to exercise the disclosure in the evidence table.
          Deliberately reads as a fixture rather than as a real model response —
          a plausible-looking fake answer in a development seed is the kind of
          thing that ends up quoted in a screenshot as if it were measured.
        */
        excerpt: `[seeded fixture, not a real answer] ${engine} response about “${q.q}”.`,
        sources:
          outcome === 'cited'
            ? ['https://example.com/', 'https://competitor.example/guide']
            : ['https://competitor.example/guide'],
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
    /*
      What the Content page reads.

      Deliberately uneven: the services page carries FAQ markup and the pricing
      page doesn't, because "you have this page but it answers nothing" is the
      state the Content page exists to surface, and a demo where everything
      passes shows none of its own value. There is no testimonials or service
      area page at all, so the missing rows have something to say too.
    */
    pages: [
      {
        url: 'https://summitroofing.com/',
        title: 'Summit Roofing — Roof Repair & Replacement in Franklin, TN',
        headings: ['Roofing you can rely on', 'What we do', 'Why Franklin homeowners choose us'],
        questionHeadings: 0,
        hasFaqSchema: false,
        faqQuestions: [],
        wordCount: 1240,
      },
      {
        url: 'https://summitroofing.com/services',
        title: 'Our Roofing Services | Summit Roofing',
        headings: ['Roof repair', 'Full replacement', 'Storm & hail damage', 'Gutters'],
        questionHeadings: 3,
        hasFaqSchema: true,
        faqQuestions: [
          'How long does a roof replacement take?',
          'Do you handle insurance claims?',
          'What areas do you serve?',
        ],
        wordCount: 980,
      },
      {
        url: 'https://summitroofing.com/pricing',
        title: 'Roofing Prices | Summit Roofing',
        headings: ['What a roof costs in Franklin', 'Financing'],
        questionHeadings: 1,
        hasFaqSchema: false,
        faqQuestions: [],
        wordCount: 620,
      },
      {
        url: 'https://summitroofing.com/about',
        title: 'About Summit Roofing',
        headings: ['Family owned since 2004', 'Our crew'],
        questionHeadings: 0,
        hasFaqSchema: false,
        faqQuestions: [],
        wordCount: 540,
      },
    ],
    profile: {
      name: 'Summit Roofing',
      industry: 'Roofing contractor',
      location: 'Franklin, TN',
      source: 'schema',
    },
    profileHint:
      'Title: Summit Roofing — Roof Repair & Replacement in Franklin, TN\nDescription: Family-owned roofing contractor serving Franklin and greater Nashville since 2004.',
    checkedAt: daysAgo(6),
  };
}

/**
 * A plan for the demo site, so Content isn't an empty page on first look.
 *
 * Written to match the seeded audit above: `slugs` here resolve against those
 * four page URLs, so the table shows two pages present, one present without
 * answers, and the rest missing — the same mix a real site produces.
 */
function seedContentPlan(siteId: string): ContentPlan {
  return {
    siteId,
    industry: 'Roofing contractor',
    location: 'Franklin, TN',
    mustHave: [
      {
        role: 'services',
        label: 'Services',
        why: 'The page that says what you do. Assistants quote it.',
        slugs: ['services', 'what-we-do'],
      },
      {
        role: 'pricing',
        label: 'Pricing',
        why: 'Cost is the first thing customers ask. Assistants answer with someone else.',
        slugs: ['pricing', 'cost', 'price'],
      },
      {
        role: 'about',
        label: 'About',
        why: 'Says who the business is. An engine needs that to name you.',
        slugs: ['about', 'our-story', 'who-we-are'],
      },
      {
        role: 'service-area',
        label: 'Service area',
        why: 'Roofing is bought locally. Name the towns you cover.',
        slugs: ['service-area', 'areas-we-serve', 'locations'],
      },
      {
        role: 'storm-damage',
        label: 'Storm & hail damage',
        why: 'Storm work is urgent, and people search for it on its own.',
        slugs: ['storm', 'hail', 'emergency'],
      },
      {
        role: 'financing',
        label: 'Financing',
        why: 'A roof costs five figures. People search how to pay first.',
        slugs: ['financing', 'finance', 'payment-plans'],
      },
      {
        role: 'testimonials',
        label: 'Reviews',
        why: 'Third-party proof is what turns a mention into a recommendation.',
        slugs: ['reviews', 'testimonials'],
      },
    ],
    topics: [
      {
        title: 'What a new roof actually costs in Franklin, TN (2026 prices)',
        angle: 'Real local ranges by roof size and material, not a national average.',
        primaryKeyword: 'new roof cost franklin tn',
        aeoQuestion: 'How much does a new roof cost in Franklin, Tennessee?',
        why: 'A question you don’t answer. Assistants use someone else’s page.',
      },
      {
        title: 'Does Tennessee homeowners insurance cover hail damage to a roof?',
        angle: 'What is and is not covered, and what to photograph before you call.',
        primaryKeyword: 'insurance hail damage roof tennessee',
        aeoQuestion: 'Will my insurance pay for a hail-damaged roof in Tennessee?',
        why: 'High intent and specific to your storm season — a direct answer wins the citation.',
      },
      {
        title: 'Metal roof vs shingles in the Tennessee climate',
        angle: 'Compare on humidity, summer heat and hail, not on price alone.',
        primaryKeyword: 'metal roof vs shingles tennessee',
        aeoQuestion: 'Is a metal roof better than shingles in Tennessee?',
        why: 'A comparison question assistants like to answer, and one you can answer locally.',
      },
      {
        title: 'How to pay for a roof: financing options for Franklin homeowners',
        angle: 'Walk through each route honestly, including the ones you do not offer.',
        primaryKeyword: 'roof financing options',
        aeoQuestion: 'How can I finance a new roof?',
        why: 'You have no financing page; this covers the gap and the search at once.',
      },
      {
        title: 'How long does a roof last in Middle Tennessee?',
        angle: 'Lifespan by material, adjusted for local sun and storm exposure.',
        primaryKeyword: 'how long does a roof last',
        aeoQuestion: 'How long should a roof last in Tennessee?',
        why: 'Broad question, and a locally-qualified answer beats a generic one.',
      },
      {
        title: 'Seven signs your roof needs repair before winter',
        angle: 'What a homeowner can see from the ground, with photographs.',
        primaryKeyword: 'signs roof needs repair',
        aeoQuestion: 'How do I know if my roof needs repairing?',
        why: 'Seasonal, shareable, and it brings people in before the emergency.',
      },
      {
        title: 'What to do in the first 24 hours after storm damage',
        angle: 'An ordered checklist — safety, documentation, then the call.',
        primaryKeyword: 'emergency roof repair after storm',
        aeoQuestion: 'What should I do if a storm damages my roof?',
        why: 'Urgent queries convert best, and a step-by-step answer is what assistants quote.',
      },
      {
        title: 'Do roofers clean gutters too? What is and is not included',
        angle: 'Set the boundary plainly and say what you do bundle.',
        primaryKeyword: 'do roofers clean gutters',
        aeoQuestion: 'Do roofing companies also clean gutters?',
        why: 'A discovered question nothing on your site currently answers.',
      },
      {
        title: 'How to choose a roofing contractor in Franklin: eight questions to ask',
        angle: 'Give the questions that expose a bad contractor, including ones about you.',
        primaryKeyword: 'how to choose a roofing contractor',
        aeoQuestion: 'How do I find a good roofer near me?',
        why: 'Targets the “who repairs roofs in Franklin TN” question you already rank for.',
      },
      {
        title: 'Roof replacement, start to finish: what the week actually looks like',
        angle: 'Day by day, including noise, driveway access and cleanup.',
        primaryKeyword: 'roof replacement process',
        aeoQuestion: 'What happens during a roof replacement?',
        why: 'Removes the main hesitation before booking, and nothing on the site covers it.',
      },
    ],
    generatedAt: daysAgo(5),
  };
}

/**
 * The demo data, for a site that already exists.
 *
 * ⚠️ DEVELOPMENT ONLY. It used to run automatically for any browser with no
 * stored data, which — once accounts existed — would have meant every new
 * customer's first sight of the product was somebody else's roofing company,
 * with a paid subscription they had not bought. Now it is a button, and it
 * fills in around a real site rather than inventing one.
 *
 * It no longer returns a `user` or a `sites` array, because it cannot: those
 * are Postgres rows. It seeds only what still lives in the browser, hung off
 * whichever site id it is given.
 */
export type SeedLocalData = {
  groups: FaqGroup[];
  faqs: FaqEntry[];
  questions: DiscoveredQuestion[];
  tracking: SiteTracking[];
  contentPlans: ContentPlan[];
  /* Empty on purpose. The seed's `tracking[].competitors` is the MEASURED
     list — who the engines cited — and this is the watch list, which nobody
     has named yet on a fresh fixture. Seeding it would blur exactly the
     distinction the Competitors page exists to draw. */
  competitors: Competitor[];
  /** Empty on a fixture: nobody has ticked anything off a seeded audit. */
  actionTicks: ActionTick[];
  articles: Article[];
  audits: Record<string, AuditReport>;
};

/*
  One finished article, so the Articles tab has something in it.

  ⚠️ WRITTEN TO THE SAME RULES THE REAL PROMPT ENFORCES, because this fixture is
  what the marketing screenshots photograph. No invented prices, no statistics,
  no awards — the constraint lib/article.ts puts on the model applies just as
  hard to a hand-written stand-in that ends up on the home page.

  One, not three. A seeded list long enough to scroll would push the rest of the
  tab out of a 1200x860 capture, and the point of the fixture is to show what
  the screen looks like with work in it, not to fill it.
*/
function seedArticle(siteId: string): Article {
  const sections = [
    {
      heading: 'What actually drives the price',
      body: 'Size is the obvious one, but it is rarely the thing that moves a quote the most. The pitch of the roof, how many layers have to come off, and whether the deck underneath has softened all change the labour before a single shingle is bought.\n\nMaterial is the other half. Asphalt is the common choice and the cheapest to install. Metal and slate cost more up front and last longer, which only pays off if you plan to stay.',
    },
    {
      heading: 'Why two quotes can differ so much',
      body: 'A low quote is not always a better deal. It usually means fewer layers stripped, thinner underlayment, or a warranty that covers the materials but not the work.\n\nAsk each contractor to write down what they are removing, what they are putting back, and who covers what if something leaks in year three. Once those are on paper the quotes are comparable.',
    },
    {
      heading: 'When you can wait and when you cannot',
      body: 'Curling edges and a few missing shingles after a storm can usually wait for a dry week. A stain spreading across a ceiling cannot — water has already found a path and it will keep taking it.\n\nIf you can see daylight from inside the attic, that is the same answer. Get it looked at now and cover it in the meantime.',
    },
    {
      heading: 'What to have ready before you call',
      body: 'The age of the roof, if you know it. Photographs of anything you can see from the ground. Whether you have had work done before, and by whom.\n\nNone of it is required, but it turns a vague site visit into a real quote, and it means fewer trips before anyone can give you a number.',
    },
  ];

  return {
    id: 'art_seed_roof_cost',
    siteId,
    title: 'What Changes the Cost of a New Roof',
    intro:
      'Most people asking what a roof costs are really asking why the quotes they were given are so far apart. The honest answer is that a roof is priced on what has to be done to it, not on its size alone.\n\nHere is what moves the number, and what to have ready before you ask anyone for a quote.',
    sections,
    /* One Q&A on the fixture so the article page's FAQ block and the schema it
       emits are visible in a screenshot without pressing anything. Written to
       the same no-invented-facts rule as the article above it. */
    faqs: [
      {
        q: 'Do you give a written quote before any work starts?',
        a: 'Yes. We put the scope, the materials and the warranty in writing before anything is booked, so you can compare it against anyone else you have asked.',
      },
    ],
    brief: null,
    // ⚠️ Measured, not typed. Same rule the route follows — see Article.wordCount.
    wordCount: countWords({
      title: 'What Changes the Cost of a New Roof',
      intro:
        'Most people asking what a roof costs are really asking why the quotes they were given are so far apart. The honest answer is that a roof is priced on what has to be done to it, not on its size alone.\n\nHere is what moves the number, and what to have ready before you ask anyone for a quote.',
      sections,
    }),
    createdAt: daysAgo(6),
    updatedAt: daysAgo(6),
  };
}

export function buildSeed(siteId: string): SeedLocalData {
  // Stands in for the real row's domain in the seeded competitor table. The
  // actual site may be called anything; this only has to be consistent.
  const site = { id: siteId, domain: 'summitroofing.com' };

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
      /* ⚠️ A SET WITH NO PAGE HAS NEVER BEEN PASTED. Claiming otherwise would
         put the fixture in a state the product cannot reach: publishState()
         would report 'current' for answers that are nowhere. */
      publishedAt: seed.path ? daysAgo(24 - gi * 6) : null,
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
      /* The set's name, on every answer in it — which is what the generator
         does. The list groups by the set itself; this is the record of which
         batch the answer came from. */
      topic: seed.name,
      tone: 'Professional',
      language: 'English',
      createdAt: daysAgo(30 - i),
      updatedAt: daysAgo(Math.max(0, 12 - i * 2)),
    }));

    // 'stale' stores a hash that cannot match anything, so the group opens in
    // the out-of-date state; 'current' stores the real hash of what it holds.
    group.publishedHash = !seed.path
      ? null
      : seed.state === 'stale'
        ? 'staleseed'
        : contentHash(entries);

    groups.push(group);
    faqs.push(...entries);
  });

  const questions: DiscoveredQuestion[] = SEED_QUESTIONS.map((q, i) => ({
    id: newId('q'),
    siteId: site.id,
    question: q.q,
    why: q.why,
    intent: q.intent,
    covered: q.covered,
    // The array order is the list order, so index is the position. daysAgo
    // below runs the same way round, which is what the 0015 backfill assumed.
    position: i,
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

  const citedTotal = [...citedCounts.values()].reduce((n, c) => n + c, 0);

  /*
    ⚠️ THE NEW FIELDS ARE DERIVED OR EMPTY, NEVER INVENTED. `kind` and `share`
    are real functions of what the fixture holds, so they are computed. The
    other three are not knowable here and are left at their honest empty value:
    seedChecks() invents outcomes, not answers, so there are no `sources` to say
    which engine cited whom or which questions they turned up on, and there is
    one run so there is nothing to trend against.

    `trend: null` is the important one. It is exactly the state a real
    single-run account is in, which makes the fixture the thing that exercises
    the "no trend yet" wording rather than a case nobody sees until production.
  */
  const competitors: CompetitorShare[] = [...citedCounts.entries()]
    .map(([domain, citations]) => ({
      domain,
      citations,
      isYou: domain === site.domain,
      kind: domain === site.domain ? ('business' as const) : sourceKind(domain),
      share: citedTotal > 0 ? (citations / citedTotal) * 100 : 0,
      engines: [],
      topQuestions: [],
      trend: null,
    }))
    .sort((a, b) => b.citations - a.citations);

  /*
    The fixture has no `sources` to aggregate — seedChecks() invents outcomes,
    not answers — so these are derived from what it does have rather than
    invented separately. `byEngine` is real arithmetic over `latest`;
    `sourceAppearances` reuses the competitor tally, which is the same shape a
    real site's would take, just built from one source per check instead of all
    of them. Enough to render the new sections in development; not a claim about
    anything.
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

  const oursCited = citedCounts.get(site.domain) ?? 0;
  const citedPages: CitedPage[] = oursCited
    ? [
        { url: `https://${site.domain}/faq`, citations: Math.ceil(oursCited / 2) },
        { url: `https://${site.domain}/`, citations: Math.floor(oursCited / 2) },
      ].filter((p) => p.citations > 0)
    : [];

  const sourceAppearances = {
    ours: oursCited,
    total: [...citedCounts.values()].reduce((a, b) => a + b, 0),
  };

  const tracking: SiteTracking[] = [
    {
      siteId: site.id,
      /* Three weeks of a Pro account's checks: a month in, then three weeks ago
         and two days ago. Not three consecutive days — see the note on seedDaily. */
      daily: seedDaily([32, 25, 2]),
      latest,
      competitors,
      citedPages,
      byEngine,
      sourceAppearances,
      promptsTracked: 12,
      planId: 'pro',
      schedule: 'weekly',
      promptCap: TRACKING_PLANS.pro.promptCap,
      manualCap: TRACKING_PLANS.pro.manualCap,
      checksCap: TRACKING_PLANS.pro.checksPerPeriod,
      runsPerPeriod: TRACKING_PLANS.pro.runsPerPeriod,
      checksUsed: 135,
      periodResetsAt: daysAhead(12),
      /* Partway through the week, so a screenshot catches the "next check" line
         rather than the edge case where one is due today. */
      nextCheckAt: daysAhead(5),
    },
  ];

  return {
    groups,
    faqs,
    questions,
    tracking,
    contentPlans: [seedContentPlan(site.id)],
    competitors: [],
    actionTicks: [],
    articles: [seedArticle(site.id)],
    // The seeded audit, hung off the real site id — audits are keyed by site
    // in local storage now rather than living on the site object.
    audits: { [site.id]: seedAudit() },
  };
}

export function emptyTracking(siteId: string): SiteTracking {
  return {
    siteId,
    daily: [],
    latest: [],
    competitors: [],
    citedPages: [],
    byEngine: [],
    sourceAppearances: { ours: 0, total: 0 },
    promptsTracked: 0,
    /*
      ⚠️ FREE, NOT NULL. planId and schedule used to be nullable, meaning "no
      tracking access at all" — a state that existed because Get Cited's window
      could close. Free is a plan with real numbers now, so the blank state is a
      free account that has not been checked yet rather than an account with no
      answer.
    */
    planId: 'free',
    schedule: 'once',
    promptCap: TRACKING_PLANS.free.promptCap,
    manualCap: TRACKING_PLANS.free.manualCap,
    checksCap: TRACKING_PLANS.free.checksPerPeriod,
    runsPerPeriod: TRACKING_PLANS.free.runsPerPeriod,
    checksUsed: 0,
    // Free's allowance never refills, so there is no date to print.
    periodResetsAt: null,
    nextCheckAt: null,
  };
}

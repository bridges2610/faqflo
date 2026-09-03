/**
 * The half of the audit that comes from FaqFlo's own data rather than a crawl.
 *
 * Two things live here:
 *
 *  - **AI visibility** — whether engines are actually citing this site. It
 *    cannot be crawled; it comes from tracking, which is what Stay Cited pays
 *    for. Without the subscription it stays locked and scores nothing, because
 *    an unmeasured pillar counted as zero would be a sales tactic dressed as a
 *    diagnosis.
 *  - **Opportunities** — the gap analysis. This is where the audit hands back
 *    to the loop: questions with no answer, answers never published, pages
 *    whose live copy has drifted.
 *
 * Both are composed on the client, where this data already lives, and merged
 * into the crawl report. The audit endpoint never sees them — it is
 * unauthenticated, and a body-supplied "citation" is exactly the fabrication
 * this product cannot afford.
 */

import type { Finding, Opportunity } from '@/lib/audit/types';
import { publishState } from './export';
import { isOpenQuestion } from './questions';

import type { DashboardData, FaqGroup, Site, SiteTracking, User } from './types';

const LOCKED: Finding = {
  id: 'cited',
  pillar: 'visibility',
  label: 'AI linking to your site',
  status: 'locked',
  detail:
    'Asking ChatGPT, Perplexity and Gemini what they say about you costs money per question, so it runs from the Results page rather than on every audit.',
  weight: 0,
};

/**
 * Turn tracking into findings.
 *
 * Every number here is a count of checks that actually ran. Nothing is
 * modelled, smoothed or extrapolated — "cited 4 times" means four answers we
 * saw with our own eyes.
 */
export function visibilityFindings(
  site: Site | null,
  user: User | null,
  tracking: SiteTracking | null,
): Finding[] {
  /*
    ⚠️ EMPTY TRACKING IS LOCKED, NOT ZERO, AND THAT IS THE WHOLE RULE HERE.

    This used to gate on canTrack() as well, to keep a lapsed Get Cited window
    from scoring an audit run with stale readings. canTrack() is true for
    everyone now — free included, since free gets one real check — so the only
    thing left to ask is whether there are results at all.

    Falling through to a score of zero would be worse than locking: it reads as
    "no engine cites you", which is a measurement, rather than "we have not
    looked", which is the truth for a site whose scan has not reached the
    tracking stage yet.
  */
  if (!tracking || tracking.latest.length === 0) return [LOCKED];

  const checks = tracking.latest;
  const cited = checks.filter((c) => c.outcome === 'cited').length;
  const mentioned = checks.filter((c) => c.outcome === 'mentioned').length;
  const rate = cited / checks.length;

  const engines = [...new Set(checks.filter((c) => c.outcome === 'cited').map((c) => c.engine))];
  const you = tracking.competitors.find((c) => c.isYou);
  const total = tracking.competitors.reduce((n, c) => n + c.citations, 0);
  const share = you && total > 0 ? you.citations / total : 0;

  return [
    {
      id: 'cited',
      pillar: 'visibility',
      label: 'AI linking to your site',
      status: rate >= 0.4 ? 'pass' : rate > 0 ? 'warn' : 'fail',
      detail:
        cited > 0
          ? `AI pointed people at your website in ${cited} of the ${checks.length} answers we checked.`
          : `In all ${checks.length} answers we checked, AI sent people to somebody else's website instead of yours.`,
      weight: 3,
      evidence: [
        `${cited} linked to you · ${mentioned} named you without a link · ${checks.length} answers checked`,
      ],
    },
    {
      id: 'engine-spread',
      pillar: 'visibility',
      label: 'More than one AI naming you',
      status: engines.length >= 2 ? 'pass' : engines.length === 1 ? 'warn' : 'fail',
      detail:
        engines.length >= 2
          ? `${engines.join(' and ')} both link to you. That matters — each one reads the web differently, so customers on one are not the customers on the other.`
          : engines.length === 1
            ? `Only ${engines[0]} links to you so far. That is a start, not a spread.`
            : 'No AI is linking to you yet.',
      weight: 2,
    },
    {
      id: 'share-of-voice',
      pillar: 'visibility',
      label: 'Your share of the answers',
      status: share >= 0.4 ? 'pass' : share > 0 ? 'warn' : 'fail',
      detail:
        total === 0
          ? 'AI has not linked to anyone yet on your questions.'
          : `${Math.round(share * 100)}% of the websites AI used to answer your questions were yours. The rest went to ${
              tracking.competitors.filter((c) => !c.isYou).length
            } other sites.`,
      weight: 2,
      evidence: tracking.competitors
        .slice(0, 4)
        .map((c) => `${c.domain}${c.isYou ? ' (you)' : ''} — ${c.citations}`),
    },
  ];
}

/** The gap analysis — what to do next, drawn from the loop's own state. */
export function opportunities(data: DashboardData, site: Site): Opportunity[] {
  const out: Opportunity[] = [];

  const groups = data.groups.filter((g) => g.siteId === site.id);
  const faqsIn = (g: FaqGroup) => data.faqs.filter((f) => f.groupId === g.id);
  const questions = data.questions.filter((q) => q.siteId === site.id);
  const tracking = data.tracking.find((t) => t.siteId === site.id);

  const uncovered = questions.filter(isOpenQuestion);
  if (uncovered.length) {
    out.push({
      id: 'uncovered-questions',
      title: `${uncovered.length} questions people ask that you don't answer`,
      /* The "asks a month" figure that used to close this sentence was fixture
         data — nothing measures ask volume. The question itself is the useful
         part, and it is real. */
      detail: `Top of the list: "${uncovered[0].question}"`,
      href: '/dashboard/questions',
    });
  }

  const emptyDrafts = groups.flatMap((g) => faqsIn(g).filter((f) => !f.answer.trim()));
  if (emptyDrafts.length) {
    out.push({
      id: 'empty-drafts',
      title: `${emptyDrafts.length} drafted ${emptyDrafts.length === 1 ? 'question has' : 'questions have'} no answer written`,
      detail: 'These came from real questions and are waiting on you for the answer.',
      href: '/dashboard/faqs?tab=answers',
    });
  }

  const unpublished = groups.flatMap((g) =>
    faqsIn(g).filter((f) => f.status === 'draft' && f.answer.trim()),
  );
  if (unpublished.length) {
    out.push({
      id: 'unpublished',
      title: `${unpublished.length} finished ${unpublished.length === 1 ? 'answer is' : 'answers are'} still in drafts`,
      detail: 'Drafts are invisible to both visitors and engines until they are published.',
      href: '/dashboard/faqs?tab=answers',
    });
  }

  const stale = groups.filter((g) => publishState(g, faqsIn(g)) === 'stale');
  if (stale.length) {
    out.push({
      id: 'stale-pages',
      title: `${stale.length} ${stale.length === 1 ? 'page is' : 'pages are'} running an out-of-date copy`,
      detail: `${stale.map((g) => g.name).join(', ')} — the engines are still reading the old version.`,
      href: '/dashboard/publish',
    });
  }

  const never = groups.filter((g) => publishState(g, faqsIn(g)) === 'never');
  if (never.length) {
    out.push({
      id: 'never-published',
      title: `${never.length} ${never.length === 1 ? 'group has' : 'groups have'} never been pasted onto the site`,
      detail: 'Nothing counts until the HTML is on your own domain.',
      href: '/dashboard/publish',
    });
  }

  if (tracking) {
    const losing = tracking.latest.filter((c) => c.outcome === 'absent' && c.citedInstead);
    if (losing.length) {
      const domains = [...new Set(losing.map((c) => c.citedInstead as string))];
      out.push({
        id: 'competitors-cited',
        title: `Someone else is cited on ${losing.length} of your questions`,
        detail: `Most often ${domains[0]}. Each of those is a question worth answering better than they do.`,
        href: '/dashboard/tracking',
      });
    }
  }

  return out;
}

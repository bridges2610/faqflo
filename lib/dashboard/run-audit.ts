import { buildActionPlan } from '@/lib/audit/actions';
import { buildPillars, overallScore } from '@/lib/audit/score';
import type { AuditReport } from '@/lib/audit/types';
import { opportunities, visibilityFindings } from './audit-context';
import type { DashboardData, FaqGroup, Site, SiteTracking, User } from './types';

/*
  Folding a crawl together with everything the crawl could not know.

  ⚠️ ITS OWN MODULE BECAUSE TWO SCREENS START A CHECK NOW. This lived inside
  audit-workspace.tsx as a closure, which was right while the Audit page was the
  only place you could press the button. Home starts one too, and the state that
  tracks it moved to the provider — so this had to live somewhere both could
  reach without the provider growing a second copy of the scoring rules.

  ⚠️ PURE, AND THAT IS WHAT MAKES IT CHECKABLE. Everything it needs is an
  argument. No hooks, no fetch, no store: hand it a crawl and a snapshot and it
  returns the merged report, so the arithmetic can be compared against a fixture
  rather than inferred from a rendered page.
*/

export type MergeContext = {
  site: Site;
  data: DashboardData;
  user: User | null;
  tracking: SiteTracking | null;
  groups: FaqGroup[];
};

/**
 * Fold in the half of the audit that isn't a crawl.
 *
 * Visibility and opportunities come from this account's own data and are merged
 * here rather than sent to the endpoint — it's unauthenticated, and a
 * body-supplied citation is exactly the number this product can't fake. The
 * score is recomputed locally with the same pure functions the server used.
 */
export function mergeAudit(crawl: AuditReport, ctx: MergeContext): AuditReport {
  const { site, data, user, tracking, groups } = ctx;

  const crawlFindings = crawl.pillars
    .flatMap((p) => p.findings)
    .filter((f) => f.pillar !== 'visibility');
  const findings = [...crawlFindings, ...visibilityFindings(site, user, tracking)];
  const pillars = buildPillars(findings);

  const firstGroup = groups[0];
  return {
    ...crawl,
    pillars,
    score: overallScore(pillars),
    scoredCount: pillars.reduce((n, p) => n + p.scoredCount, 0),
    actions: buildActionPlan(findings, {
      domain: crawl.domain,
      // A real route. This was `#${id}`, and nothing on the Answers screen ever
      // rendered that anchor — the link landed at the top of a list and left
      // the customer to find the page themselves.
      faqsHref: firstGroup ? `/dashboard/faqs/${firstGroup.id}` : '/dashboard/faqs',
      publishHref: '/dashboard/publish',
      questionsHref: '/dashboard/questions',
    }),
    opportunities: opportunities(data, site),
  };
}

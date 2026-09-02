'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScoreDial } from '@/components/ui/score-dial';
import { useDashboard } from '@/lib/dashboard/provider';
// pageBudgetFor is no longer imported here: the budget is the server's
// decision now, and a client-side copy of it would only ever be a guess about
// what the server was going to do.
import { PAGE_BUDGET, canRunFullAudit } from '@/lib/dashboard/plans';
import { opportunities } from '@/lib/dashboard/audit-context';
import { timeAgo } from '@/lib/dashboard/format';
import { taskFromAction } from '@/lib/dashboard/worklist';
import { scoreBand } from '@/lib/audit/score';
import {
  PILLARS,
  type Finding,
  type PillarResult,
} from '@/lib/audit/types';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { AuditSummary } from './audit-summary';
import { AreaScores, CheckGroup, ChecksHeading, StatusTally } from './audit-checks';
import { TaskRow } from './task-row';
import { AUDIT_TABS, WorkspaceTabs } from './workspace-tabs';
import { UpgradeCard } from './upgrade-card';
import { MicroLabel } from './micro-label';
import { SectionTitle } from './section-title';

/*
  The audit.

  Order on the page is deliberate: score, then the five things to do, then the
  evidence. You asked for the audit to END with a ranked list; it also has to be
  the first thing seen, because its whole value is removing decisions. So the
  plan sits directly under the number, and the pillars below it are the working
  that justifies it — there to be checked, not to be waded through.
*/

/* The chip, the word and the glyph moved to components/ui/status-icon.tsx when
   the free report needed a third copy. The `warn` chip changed colour in the
   move — amber rather than the brand cyan it shared with the Pro lock. */

/*
  PillarCard and FindingRow used to live here. They were the technical view:
  six collapsed cards of `label` + `detail`, in the order the checks ran. Both
  are gone — see the header of audit-checks.tsx for what replaced them and why.
  The pillar scores they carried survive as AreaScores.
*/

export type AuditView = 'plain' | 'technical';

/**
 * Every finding, most urgent first, then by area.
 *
 * ⚠️ THIS PARTITIONS — IT DOES NOT FILTER. Every finding lands in exactly one
 * of the four groups, and the four together are the whole report. That is the
 * page's contract: it is the complete checklist somebody forwards to an
 * agency, so a check quietly missing from it is worse than one that reads
 * awkwardly.
 *
 * ⚠️ isHiddenInSummary() MUST NOT BE APPLIED HERE. It exists so the PLAIN
 * summary can leave out checks not worth a business owner's attention. Using it
 * on this page would drop checks from the document being handed over.
 */
function groupFindings(pillars: PillarResult[]) {
  const all = pillars.flatMap((p) => p.findings);
  /* Stable inside a group, so related work travels together once the reader
     has stopped caring about severity. PILLARS is in weight order. */
  const areaRank = new Map(PILLARS.map((p, i) => [p.id, i]));
  const byArea = (a: Finding, b: Finding) =>
    (areaRank.get(a.pillar) ?? 99) - (areaRank.get(b.pillar) ?? 99);
  const of = (...statuses: Finding['status'][]) =>
    all.filter((f) => statuses.includes(f.status)).sort(byArea);

  return {
    all,
    fail: of('fail'),
    warn: of('warn'),
    pass: of('pass'),
    // Locked and n/a together: both mean "no reading", and the group's own
    // words say which is which rather than leaving a bare mark to imply it.
    unchecked: of('locked', 'na'),
  };
}

export function AuditWorkspace({
  justUpgraded = false,
  view = 'plain',
}: {
  justUpgraded?: boolean;
  /**
   * Which reading of the report to show.
   *
   * Defaults to plain, and that is the decision: this page's own note says most
   * people opening an audit want the answer rather than the evidence, and the
   * person paying for it runs a roofing company, not an SEO agency. The
   * technical view is one click away and keeps everything it always had.
   */
  view?: AuditView;
}) {
  /* ⚠️ `fresh` IS GONE TOO. It held the just-run report for display, but
     runAudit() saves through the store — so site.lastAudit already carries it,
     and a local copy was a second source for one thing. */
  const { site, user, data, runAudit, auditBusy, auditError } = useDashboard();

  /*
    Landing here straight from Stripe.

    Somebody who has just paid $129 for an audit should not have to ask for it.
    The banner survives in state rather than reading the prop, because the URL
    is cleaned a moment later and a banner that vanished on its own would look
    like a glitch.
  */
  const [showUpgraded] = useState(justUpgraded);

  /*
    ⚠️ THE AUTO-RUN THAT USED TO LIVE HERE IS GONE, AND MUST NOT COME BACK.

    A `useEffect` here fired a full audit whenever the URL carried
    `?purchased=get_cited`, guarded three ways against firing twice. It was
    defensible when it was the only automatic work in the product — somebody
    who has just paid should not have to ask for their audit.

    It is now wrong for two reasons. The audit is the first stage of the
    server-side scan queued during Stripe fulfilment (lib/stripe/fulfil.ts), so
    running it here as well means two crawls of the customer's site for one
    payment, and burns one of only four daily full audits
    (AUDIT_FULL_RATE_LIMIT) on a duplicate. And the customer no longer arrives
    on this page at all: /dashboard/checkout/return sends them to
    /dashboard/start to watch all three stages.

    The banner below reads `?upgraded=pro` and does nothing but congratulate.
    ⚠️ It must stay that way: a new subscriber DOES land here now (see the
    redirect in /dashboard/checkout/return), so anything automatic added to this
    effect would fire on every upgrade.
  */

  if (!site || !data) {
    return (
      <>
        <PageHeader title="Audit" description="What AI can and can't see on your site." />
        <EmptyState
          title="Add a site first"
          body="The audit runs against a site's live pages, so there needs to be one."
          action={<ButtonLink href="/dashboard/sites">Go to sites</ButtonLink>}
        />
      </>
    );
  }

  const full = canRunFullAudit(user);

  /*
    run() and merge() used to live here.

    ⚠️ THEY MOVED UP, NOT AWAY. The check can be started from Home now, and two
    local `busy` flags would let a customer start one here and a second one
    there — two of only four full audits a day. The flag lives on the provider
    so both buttons see the same run; the merge is a pure function in
    lib/dashboard/run-audit.ts so the provider did not have to grow a second
    copy of the scoring rules.
  */

  /*
    Opportunities are recomputed from the current state rather than read back
    from the stored report: answers get written and pages get pasted between
    audits, and a stale "3 pages need re-pasting" would send someone to fix
    something they already fixed.
  */
  const stored = site.lastAudit;
  const shown = stored ? { ...stored, opportunities: opportunities(data, site) } : null;
  const band = shown ? scoreBand(shown.score) : null;
  /* Computed once for both the tally in the header and the four groups below,
     so the number beside the score and the number in a heading cannot drift. */
  const checks = groupFindings(shown?.pillars ?? []);

  return (
    <>
      {/* Wrapped rather than passed a className, because PageHeader takes none.
          Hidden in print: it sits outside .print-report, so it would otherwise
          come out as unstyled furniture above the report — and the plain view
          carries its own print masthead. */}
      <div className="print:hidden">
        <PageHeader
          title="Audit"
          description={`What AI sees when it reads ${site.domain}, and what to do about it.`}
          action={
            <Button size="sm" onClick={runAudit} disabled={auditBusy}>
              {auditBusy ? 'Scanning…' : shown ? 'Run it again' : 'Run the audit'}
            </Button>
          }
        />

        {/* No toggle until there is something to read two ways. */}
        {shown && (
          <WorkspaceTabs
            tabs={AUDIT_TABS}
            label="How to read this audit"
            activeHref={view === 'technical' ? AUDIT_TABS[1].href : AUDIT_TABS[0].href}
          />
        )}
      </div>

      <div className="space-y-5">
        {/* The receipt, where the thing they bought actually is. Kept after the
            URL is cleaned so it does not blink out — see showUpgraded above. */}
        {showUpgraded && (
          <div className="border-accent bg-accent-soft rounded-xl border p-4">
            <p className="text-navy text-sm font-semibold">You&rsquo;re on Pro</p>
            <p className="text-slate mt-1 text-sm leading-relaxed">
              {/* ⚠️ "Your upgrade is going through" rather than a flat claim.
                  The webhook writes profiles.plan, not the return page, and it
                  may land a second or two after this renders. Telling somebody
                  who has just paid that a feature is locked is worse than asking
                  them to refresh. */}
              {auditBusy
                ? `Running your first full audit now. It reads up to ${PAGE_BUDGET.pro} pages, so give it a moment.`
                : `Run the full check below and it will read every page on ${site.name}, not just the home page. If anything still looks locked, give it a moment and refresh — your payment is still going through.`}
            </p>
          </div>
        )}

        {auditError && (
          <p role="alert" className="text-error-ink text-sm">
            {auditError}
          </p>
        )}

        {!shown ? (
          <EmptyState
            title="No audit yet"
            body={
              full
                ? 'Scans your pages, robots.txt, sitemap and structured data, then hands you a ranked list of what to fix first.'
                : 'The free checks look at whether your content is readable and whether the AI crawlers are allowed in.'
            }
            action={
              <Button onClick={runAudit} disabled={auditBusy}>
                {auditBusy ? 'Scanning…' : 'Run the audit'}
              </Button>
            }
          />
        ) : view === 'plain' ? (
          <>
            {/* Same report object the technical view renders — passed down
                rather than read from the store, so the toggle cannot change
                the score. See the note on AuditSummary. */}
            <AuditSummary report={shown} site={site} />

            {!full && (
              <UpgradeCard
                title="Check your whole site, not just the home page"
                body="Your free check reads one page and scores three things. Pro reads every page — titles, structure, who you are, whether you look trustworthy — and turns what it finds into a list in order of what to fix first."
              />
            )}
          </>
        ) : (
          <>
            <Card className="p-5 sm:p-7">
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                <ScoreDial score={shown.score} />
                <div className="min-w-0 text-center sm:text-left">
                  <MicroLabel>
                    {shown.domain}
                  </MicroLabel>
                  <SectionTitle className="mt-2">{band?.label}</SectionTitle>
                  <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">{band?.summary}</p>
                  <p className="text-slate mt-3 text-xs leading-relaxed">
                    Based on {shown.scoredCount} checks across {shown.crawled.length}{' '}
                    {shown.crawled.length === 1 ? 'page' : 'pages'} · {timeAgo(shown.checkedAt)}.
                    Anything we couldn&rsquo;t measure is marked and left out of the score.
                  </p>
                  {/* The tally sits with the score because it is the same
                      reading twice: one number, then what it is made of. It
                      also keys the marks used all the way down the page. */}
                  <div className="flex justify-center sm:justify-start">
                    <StatusTally findings={checks.all} />
                  </div>
                </div>
              </div>

              <AreaScores pillars={shown.pillars} />
            </Card>

            {shown.actions.length > 0 && (
              <Card className="border-primary p-5 sm:p-7">
                <MicroLabel tone="primary">
                  Do these {shown.actions.length} things this week
                </MicroLabel>
                <SectionTitle className="mt-3">Your plan, in order</SectionTitle>
                <p className="text-slate mt-1 text-sm">
                  Ranked by what each one is worth against how long it takes. The points are what
                  the score above would gain.
                </p>
                <ul className="divide-line mt-3 divide-y">
                  {shown.actions.map((item, i) => (
                    <TaskRow key={item.id} task={taskFromAction(item)} index={i} />
                  ))}
                </ul>
              </Card>
            )}

            {!full && (
              <UpgradeCard
                title="Check your whole site, not just the home page"
                body="Your free check reads one page and scores three things. Pro reads every page — titles, structure, who you are, whether you look trustworthy — and turns what it finds into a list in order of what to fix first."
              />
            )}

            {shown.opportunities.length > 0 && (
              <Card className="p-5 sm:p-7">
                <SectionTitle>Opportunities</SectionTitle>
                <p className="text-slate mt-1 text-sm">
                  From your own answers and tracking, not the crawl.
                </p>
                <ul className="divide-line mt-3 divide-y">
                  {shown.opportunities.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-navy text-sm font-semibold">{o.title}</p>
                        <p className="text-slate mt-0.5 text-sm leading-relaxed">{o.detail}</p>
                      </div>
                      {o.href && (
                        <Link
                          href={o.href}
                          className="text-primary hover:text-primary-hover shrink-0 text-sm font-semibold"
                        >
                          Open →
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <ChecksHeading total={checks.all.length} />

            <CheckGroup
              title="Needs fixing"
              blurb="These are costing you now. Each one stops an AI assistant doing something it would otherwise do."
              findings={checks.fail}
              defaultOpen
            />
            <CheckGroup
              title="Worth a look"
              blurb="Not broken, but not doing you any favours either. Worth handing over once the list above is clear."
              findings={checks.warn}
              defaultOpen
            />
            <CheckGroup
              title="Working fine"
              blurb="Nothing to do here. Listed so you can see what was checked, and so nobody pays to fix something that already works."
              findings={checks.pass}
              defaultOpen={false}
            />
            {/* ⚠️ LOCKED IS NOT DISABLED, AND n/a IS NOT A FAILURE. The blurb
                says which is which: one needs something we don't have, the
                other doesn't apply to this site. A check listed with a blank
                mark and no reason reads as a broken feature. */}
            <CheckGroup
              title="Not checked"
              blurb="Either they don’t apply to your site, or they need something we don’t have yet. None of them count for or against your score."
              findings={checks.unchecked}
              defaultOpen={false}
            />

            {/* The scan's own working. A budget spent on 100 of 340 pages is
                only trustworthy if the report says which 100 and why it
                stopped — otherwise every count above reads as site-wide. */}
            <Card tone="cloud" className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <MicroLabel>Pages read</MicroLabel>
                <p className="text-slate text-xs">
                  {shown.crawled.length} of {Math.max(shown.discovered, shown.crawled.length)} found
                  {shown.stoppedBecause === 'budget' && ' · stopped at the page budget'}
                  {shown.stoppedBecause === 'time' && ' · stopped on time, the site was slow'}
                  {shown.stoppedBecause === 'exhausted' && ' · that is the whole site'}
                </p>
              </div>

              {shown.stoppedBecause !== 'exhausted' && (
                <p className="text-slate mt-2 text-xs leading-relaxed">
                  Pages were chosen by how close they sit to the homepage, whether the sitemap
                  lists them, and what kind of page they look like — not the order they were found
                  in.
                </p>
              )}

              <ul className="mt-3 max-h-64 space-y-1 overflow-auto">
                {shown.crawled.map((p) => (
                  <li key={p.url} className="text-slate font-mono text-xs break-all">
                    {p.status} · {p.finalUrl}
                  </li>
                ))}
              </ul>

              {shown.skipped.length > 0 && (
                <>
                  <MicroLabel className="mt-4">
                    Not scanned, best first
                  </MicroLabel>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                    {shown.skipped.slice(0, 10).map((u) => (
                      <li key={u} className="text-slate font-mono text-xs break-all opacity-70">
                        {u}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}

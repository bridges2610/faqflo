'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScoreDial } from '@/components/ui/score-dial';
import { useDashboard } from '@/lib/dashboard/provider';
// pageBudgetFor is no longer imported here: the budget is the server's
// decision now, and a client-side copy of it would only ever be a guess about
// what the server was going to do.
import { PAGE_BUDGET, canRunFullAudit } from '@/lib/dashboard/plans';
import { opportunities, visibilityFindings } from '@/lib/dashboard/audit-context';
import { timeAgo } from '@/lib/dashboard/format';
import { taskFromAction } from '@/lib/dashboard/worklist';
import { buildActionPlan } from '@/lib/audit/actions';
import { buildPillars, overallScore, pillarBand, scoreBand } from '@/lib/audit/score';
import { PILLARS, type AuditReport, type CheckStatus, type Finding } from '@/lib/audit/types';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { ChevronIcon } from './nav-icons';
import { AuditSummary } from './audit-summary';
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

const STATUS_CHIP: Record<CheckStatus, string> = {
  pass: 'bg-success/12 text-success-ink',
  warn: 'bg-accent-soft text-teal-ink',
  fail: 'bg-error/12 text-error-ink',
  locked: 'bg-cloud text-slate border border-line',
  na: 'bg-cloud text-slate border border-line',
};

const STATUS_WORD: Record<CheckStatus, string> = {
  pass: 'Pass',
  warn: 'Worth a look',
  fail: 'Problem',
  locked: 'Not checked',
  na: 'Not applicable',
};

function StatusIcon({ status }: { status: CheckStatus }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      {status === 'pass' && <polyline points="3 8.5 6.5 12 13 4.5" />}
      {status === 'warn' && <path d="M8 4v5M8 11.5h.01" />}
      {status === 'fail' && <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />}
      {status === 'locked' && (
        <>
          <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
          <path d="M5.8 7V5.6a2.2 2.2 0 0 1 4.4 0V7" />
        </>
      )}
      {status === 'na' && <path d="M4 8h8" />}
    </svg>
  );
}

function PillarCard({ pillar }: { pillar: ReturnType<typeof buildPillars>[number] }) {
  const [open, setOpen] = useState(false);
  const band = pillarBand(pillar.score);
  const bodyId = `pillar-${pillar.id}`;
  const blurb = PILLARS.find((p) => p.id === pillar.id)?.blurb ?? '';

  const barColour =
    band === 'good' ? 'bg-success' : band === 'mixed' ? 'bg-accent' : band === 'poor' ? 'bg-error' : 'bg-line';

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="group/toggle -m-1 flex min-w-0 flex-1 items-start gap-2.5 rounded-lg p-1 text-left"
        >
          <ChevronIcon
            className={`text-slate group-hover/toggle:text-navy mt-1 h-4 w-4 shrink-0 transition-transform duration-200 ${
              open ? 'rotate-90' : ''
            }`}
          />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-navy text-[0.9375rem] font-semibold">{pillar.label}</span>
              <span className="text-slate text-xs">
                {pillar.score === null
                  ? 'not measured'
                  : `${pillar.score}/100 · ${pillar.scoredCount} checks`}
              </span>
            </span>
            <span className="text-slate mt-0.5 block text-xs">{blurb}</span>
            {/* Not <Meter> — this sits inside the disclosure <button>, and a
                div is not valid phrasing content there. Same height, same
                track colour, same aria-hidden as Meter; see meter.tsx. */}
            <span
              className="bg-cloud mt-2 block h-1.5 w-full overflow-hidden rounded-full"
              aria-hidden="true"
            >
              <span
                className={`block h-full rounded-full ${barColour}`}
                style={{ width: `${pillar.score ?? 0}%` }}
              />
            </span>
          </span>
        </button>
      </div>

      {open && (
        <ul id={bodyId} className="divide-line mt-4 divide-y border-t border-line pt-1">
          {pillar.findings.map((f) => (
            <FindingRow key={f.id} finding={f} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <li className="flex gap-3 py-3">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          STATUS_CHIP[finding.status]
        }`}
      >
        <StatusIcon status={finding.status} />
      </span>
      <div className="min-w-0">
        <p className="text-navy text-sm font-semibold">
          {finding.label}
          <span className="sr-only"> — {STATUS_WORD[finding.status]}</span>
        </p>
        <p className="text-slate mt-0.5 text-sm leading-relaxed">{finding.detail}</p>
        {finding.evidence && finding.evidence.length > 0 && (
          <ul className="text-slate mt-1.5 space-y-0.5">
            {/* Index keys: this is a static display list with no reordering and
                no identity of its own, and evidence lines are not guaranteed
                unique — the same heading really can appear on several pages. */}
            {finding.evidence.map((e, i) => (
              <li key={`${i}-${e}`} className="font-mono text-[0.6875rem] break-all">
                {e}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export type AuditView = 'plain' | 'technical';

export function AuditWorkspace({
  justPurchased = false,
  view = 'plain',
}: {
  justPurchased?: boolean;
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
  const { site, user, data, tracking, groups, saveAudit, renameSite } = useDashboard();
  /** null means "nothing run this session" — the stored report is the fallback. */
  const [fresh, setFresh] = useState<AuditReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  /*
    Landing here straight from Stripe.

    Somebody who has just paid $129 for an audit should not have to ask for it.
    The banner survives in state rather than reading the prop, because the URL
    is cleaned a moment later and a banner that vanished on its own would look
    like a glitch.
  */
  const [showPurchased] = useState(justPurchased);

  /*
    ⚠️ THIS SPENDS MONEY, SO IT IS GUARDED THREE TIMES.

    A full audit is up to a hundred requests to somebody else's server plus an
    LLM pass. Firing it from a page load is only defensible because they just
    bought exactly this, and only if it can happen precisely once:

      1. `autoRan` — a ref, not state, so React's double-invoked effects in
         development cannot start two crawls.
      2. the site check — the provider hydrates client-side, so `site` is null
         on first paint and running then would audit nothing.
      3. router.replace BEFORE run() — strips ?purchased= immediately, so a
         refresh mid-crawl cannot start a second one. The server's
         AUDIT_FULL_RATE_LIMIT is a backstop, not the plan.
  */
  const autoRan = useRef(false);

  useEffect(() => {
    if (!justPurchased || autoRan.current) return;
    if (!site || !data) return;

    autoRan.current = true;
    router.replace('/dashboard/audit');
    void run();
    // `run` is a hoisted declaration recreated each render; the ref above is
    // the real guard, so listing it here would only re-arm what it prevents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justPurchased, site, data, router]);

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

  const full = canRunFullAudit(site, user);

  async function run() {
    if (!site) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        /*
          `maxPages` is gone. The server derives the page budget from the site
          row, because a client that states its own allowance isn't stating
          anything the server should believe — and a hundred pages is a hundred
          requests to somebody else's host.
        */
        body: JSON.stringify({
          url: site.domain,
          depth: full ? 'full' : 'quick',
          siteId: site.id,
        }),
      });
      const crawl = (await res.json()) as AuditReport | { error: string };
      if (!res.ok || 'error' in crawl) {
        setError('error' in crawl ? crawl.error : 'That audit failed.');
        return;
      }
      const merged = merge(crawl);
      setFresh(merged);
      await saveAudit(site.id, merged);

      /*
        Keep what the crawl learned about the business.

        businessProfile() reads industry and service area off the site's own
        LocalBusiness markup on every full crawl, and until now the result was
        thrown away unless the customer went to Content and generated a plan —
        so a site that plainly declares `RoofingContractor` still read
        "Industry: unknown" on the dashboard. Both the content plan and question
        discovery send these fields to the model, so an empty pair costs
        specificity in two places.

        `schema` flat, not Content's conditional: this came from markup by
        definition. A site whose markup names a trade but no `areaServed`
        leaves location null for the customer to fill in, which is honest —
        Content's `inferred` is for the different case where a model completed
        a partial profile.

        ⚠️ Never over a manual one. A customer correcting us is the strongest
        signal we have, and a re-run quietly reverting it would be the feature
        arguing with its user. Same guard as content-workspace.tsx.
      */
      const profile = crawl.profile;
      if (site.profileSource !== 'manual' && profile?.industry) {
        await renameSite(site.id, {
          industry: profile.industry,
          location: profile.location,
          profileSource: 'schema',
        });
      }
    } catch {
      setError('Could not run the audit. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Fold in the half of the audit that isn't a crawl.
   *
   * Visibility and opportunities come from this account's own data and are
   * merged here rather than sent to the endpoint — it's unauthenticated, and a
   * body-supplied citation is exactly the number this product can't fake. The
   * score is recomputed locally with the same pure functions the server used.
   */
  function merge(crawl: AuditReport): AuditReport {
    if (!site || !data) return crawl;

    const crawlFindings = crawl.pillars.flatMap((p) => p.findings).filter((f) => f.pillar !== 'visibility');
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
        // A real route now. This was `#${id}`, and nothing on the Answers
        // screen ever rendered that anchor — the link landed at the top of a
        // list and left the customer to find the page themselves.
        faqsHref: firstGroup ? `/dashboard/faqs/${firstGroup.id}` : '/dashboard/faqs',
        publishHref: '/dashboard/publish',
        questionsHref: '/dashboard/questions',
      }),
      opportunities: opportunities(data, site),
    };
  }

  /*
    Opportunities are recomputed from the current state rather than read back
    from the stored report: answers get written and pages get pasted between
    audits, and a stale "3 pages need re-pasting" would send someone to fix
    something they already fixed.
  */
  const stored = site.lastAudit;
  const shown = fresh ?? (stored ? { ...stored, opportunities: opportunities(data, site) } : null);
  const band = shown ? scoreBand(shown.score) : null;

  return (
    <>
      {/* Wrapped rather than passed a className, because PageHeader takes none.
          Hidden in print: it sits outside .print-report, so it would otherwise
          come out as unstyled furniture above the report — and the plain view
          carries its own print masthead. */}
      <div className="print:hidden">
        <PageHeader
          title="Your site"
          description={`What an AI crawler sees when it reads ${site.domain} — and what to do about it.`}
          action={
            <Button size="sm" onClick={run} disabled={busy}>
              {busy ? 'Scanning…' : shown ? 'Run it again' : 'Run the audit'}
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
            URL is cleaned so it does not blink out — see showPurchased above. */}
        {showPurchased && (
          <div className="border-accent bg-accent-soft rounded-xl border p-4">
            <p className="text-navy text-sm font-semibold">
              You&rsquo;re set up — {site.name} is unlocked
            </p>
            <p className="text-slate mt-1 text-sm leading-relaxed">
              {busy
                ? `Running your first full audit now. It reads up to ${PAGE_BUDGET.paid} pages, so give it a moment.`
                : 'The full audit, the questions people ask AI, the content plan and the publish-ready export are all yours for the next 30 days. Everything you make stays yours for good.'}
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-error-ink text-sm">
            {error}
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
              <Button onClick={run} disabled={busy}>
                {busy ? 'Scanning…' : 'Run the audit'}
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
                entitlement="get_cited"
                siteName={site.name}
                title="The full audit"
                body="The free checks are the first three. The full audit reads your other pages too — titles, structure, identity, trust — and turns everything it finds into a ranked plan."
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
                </div>
              </div>
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
                entitlement="get_cited"
                siteName={site.name}
                title="The full audit"
                body="The free checks are the first three. The full audit reads your other pages too — titles, structure, identity, trust — and turns everything it finds into a ranked plan."
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

            <div className="grid gap-4 sm:grid-cols-2">
              {shown.pillars.map((p) => (
                <PillarCard key={p.id} pillar={p} />
              ))}
            </div>

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

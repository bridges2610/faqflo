'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check } from '@/components/ui/check';
import { ScoreDial } from '@/components/ui/score-dial';
import { useDashboard } from '@/lib/dashboard/provider';
import { useCopy } from '@/lib/dashboard/use-copy';
import { isHiddenInSummary, plainAction, plainFor, verdict } from '@/lib/audit/plain';
import { scoreBand } from '@/lib/audit/score';
import type { ActionItem, Finding } from '@/lib/audit/types';
import { EmptyState } from './empty-state';
import { CopyIcon, TickIcon } from './nav-icons';

/*
  The audit for someone who doesn't want an audit.

  The full report is written for a person who already knows what a canonical
  tag is. This one is written for the owner of the business: what was found,
  what it costs them, what to do next — in that order, in ordinary words.

  Everything here comes from the stored report. No re-crawl, no second opinion,
  no model call: the same findings, said differently. If the two pages ever
  disagreed, the plain one would be the one people believed.
*/

/** One thing that's wrong, and what it costs. Worst first. */
function ProblemRow({ finding }: { finding: Finding }) {
  return (
    <li className="flex gap-3 py-3.5">
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
          finding.status === 'fail' ? 'bg-error' : 'bg-accent'
        }`}
        aria-hidden="true"
      />
      <p className="text-slate text-[0.9375rem] leading-relaxed">
        <span className="sr-only print:not-sr-only print:mr-1 print:font-semibold">
          {finding.status === 'fail' ? 'Fix:' : 'Check:'}
        </span>
        {plainFor(finding)}
      </p>
    </li>
  );
}

/** One job from the plan, without the scoring language. */
function ActionRow({ item, index }: { item: ActionItem; index: number }) {
  const { copied, copy } = useCopy();
  // The recipe's own wording is written for the technical report; this page
  // needs the same job described without the vocabulary.
  const { what, why, label } = plainAction(item);

  return (
    <li className="break-inside-avoid py-4">
      <div className="flex gap-4">
        <span className="bg-primary-soft text-primary font-display print-step mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-navy text-[1.0625rem] leading-snug font-semibold">{what}</h3>
            <span className="text-slate text-xs">about {item.effort}</span>
          </div>
          <p className="text-slate mt-1.5 text-[0.9375rem] leading-relaxed">{why}</p>

          {item.action.kind === 'link' && (
            <ButtonLink href={item.action.href} size="sm" variant="ghost" className="mt-3 print:hidden">
              {label}
            </ButtonLink>
          )}

          {item.action.kind === 'copy' && (
            <div className="mt-3">
              <p className="text-slate text-sm">{item.action.where}</p>
              {/* The one place jargon is allowed to survive: text the customer
                  has to paste somewhere, which has to be exact. */}
              <pre className="border-line bg-cloud mt-2 overflow-auto rounded-lg border p-3 print:bg-white">
                <code className="text-navy font-mono text-[0.6875rem] leading-relaxed whitespace-pre">
                  {item.action.snippet}
                </code>
              </pre>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 print:hidden"
                onClick={() => copy(item.action.kind === 'copy' ? item.action.snippet : '')}
              >
                {copied ? <TickIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy this'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export function AuditSummary() {
  const { site, data } = useDashboard();

  if (!site || !data) {
    return (
      <EmptyState
        title="Add a site first"
        body="The summary explains an audit, and an audit needs a site to run against."
        action={<ButtonLink href="/dashboard/sites">Go to sites</ButtonLink>}
      />
    );
  }

  const report = site.lastAudit;

  if (!report) {
    return (
      <EmptyState
        title="No audit to explain yet"
        body="Run the audit first and this page will tell you what it found, in plain English."
        action={<ButtonLink href="/dashboard/audit">Run the audit</ButtonLink>}
      />
    );
  }

  const findings = report.pillars.flatMap((p) => p.findings).filter((f) => !isHiddenInSummary(f));
  const working = findings.filter((f) => f.status === 'pass');
  // Fails before warnings: the order people should read them in.
  const problems = findings
    .filter((f) => f.status === 'fail' || f.status === 'warn')
    .sort((a, b) => (a.status === b.status ? b.weight - a.weight : a.status === 'fail' ? -1 : 1));

  const band = scoreBand(report.score);
  const checkedOn = new Date(report.checkedAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="print-report space-y-5">
      {/* Header ------------------------------------------------------------ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] sm:text-[2rem]">What this means for {site.name}</h1>
          <p className="text-slate mt-2 text-[0.9375rem]">
            {site.domain} · checked {checkedOn}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 print:hidden">
          <Button size="sm" variant="ghost" onClick={() => window.print()}>
            Print or save as PDF
          </Button>
          <Link
            href="/dashboard/audit"
            className="text-primary hover:text-primary-hover text-sm font-semibold"
          >
            Full detail →
          </Link>
        </div>
      </div>

      {/* The verdict — the one thing to read ------------------------------- */}
      <Card className="p-5 sm:p-7">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <ScoreDial score={report.score} />
          <div className="min-w-0">
            <Badge tone={report.score >= 85 ? 'success' : report.score >= 60 ? 'cyan' : 'neutral'}>
              {band.label}
            </Badge>
            <p className="text-navy mt-3 text-[1.0625rem] leading-relaxed">{verdict(report)}</p>
          </div>
        </div>
      </Card>

      {/* What's working ---------------------------------------------------- */}
      {/* Deliberately first. A report that only lists faults reads as an
          attack, and it hides that most of the score was already earned. */}
      {working.length > 0 && (
        <Card className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg">What&rsquo;s already working</h2>
            <Badge tone="success">{working.length}</Badge>
          </div>
          <ul className="print-columns mt-4 space-y-2.5">
            {working.map((f) => (
              <li key={f.id} className="flex gap-2.5">
                <Check className="text-success-ink mt-[0.4rem] shrink-0" />
                <p className="text-slate text-[0.9375rem] leading-relaxed">{plainFor(f)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* What's holding you back ------------------------------------------- */}
      {problems.length > 0 && (
        <Card className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg">What&rsquo;s holding you back</h2>
            <Badge tone="neutral">{problems.length}</Badge>
          </div>
          <p className="text-slate mt-1 text-sm">Worst first. You don&rsquo;t have to fix them all.</p>
          <ul className="divide-line mt-3 divide-y">
            {problems.map((f) => (
              <ProblemRow key={f.id} finding={f} />
            ))}
          </ul>
        </Card>
      )}

      {/* Do these next ------------------------------------------------------ */}
      {report.actions.length > 0 && (
        <Card className="border-primary p-5 sm:p-7">
          <p className="text-primary font-mono text-xs tracking-wide uppercase">
            Do these {report.actions.length} things
          </p>
          <h2 className="mt-3 text-lg">Where to start</h2>
          <p className="text-slate mt-1 text-sm">
            In order. The first one is worth more than the rest put together.
          </p>
          <ul className="divide-line mt-3 divide-y">
            {report.actions.map((item, i) => (
              <ActionRow key={item.id} item={item} index={i} />
            ))}
          </ul>
        </Card>
      )}

      <p className="text-slate text-center text-xs print:mt-8">
        Prepared by FaqFlo from a scan of {report.crawled.length}{' '}
        {report.crawled.length === 1 ? 'page' : 'pages'} on {checkedOn}.{' '}
        <Link href="/dashboard/audit" className="text-primary print:hidden">
          See the technical detail
        </Link>
      </p>
    </div>
  );
}

'use client';

import { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check } from '@/components/ui/check';
import { ScoreDial } from '@/components/ui/score-dial';
import { useCopy } from '@/lib/dashboard/use-copy';
import {
  holdingBack,
  isHiddenInSummary,
  plainAction,
  plainFor,
  strengths,
  verdict,
} from '@/lib/audit/plain';
import { scoreBand } from '@/lib/audit/score';
import type { ActionItem, AuditReport, Finding } from '@/lib/audit/types';
import type { Site } from '@/lib/dashboard/types';
import { ChevronIcon, CopyIcon, TickIcon } from './nav-icons';

/*
  The audit for someone who doesn't want an audit.

  The full report is written for a person who already knows what a canonical
  tag is. This one is written for the owner of the business: what was found,
  what it costs them, what to do next — in that order, in ordinary words.

  Everything here comes from the stored report. No re-crawl, no second opinion,
  no model call: the same findings, said differently. If the two pages ever
  disagreed, the plain one would be the one people believed.
*/

/**
 * A list the reader opens if they want it.
 *
 * The paragraph above each of these is the summary; this is the evidence. Both
 * lists used to be open on arrival, which meant the page led with thirty items
 * and the two paragraphs explaining them scrolled away.
 *
 * ⚠️ THE CONTENT STAYS IN THE DOM WHEN CLOSED. PillarCard and GroupCard both
 * unmount their bodies; this one must not. This page is a printable deliverable
 * and window.print() cannot reveal something React never rendered — a customer
 * printing a collapsed report would get two empty sections. `hidden print:block`
 * hides it on screen and brings it back for print, which is the masthead's trick
 * above in reverse.
 */
function Collapsible({
  label,
  children,
}: {
  /** Says what opening it gets you — "Show all 14" beats a bare chevron. */
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="text-primary hover:text-primary-hover mt-4 inline-flex items-center gap-1.5 text-sm font-semibold transition-colors duration-150 print:hidden"
      >
        <ChevronIcon
          className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        />
        {open ? 'Hide the list' : label}
      </button>

      <div id={id} className={open ? 'mt-4' : 'hidden print:mt-4 print:block'}>
        {children}
      </div>
    </>
  );
}

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

/**
 * One job from the plan, without the scoring language.
 *
 * ⚠️ NOT the shared TaskRow, and it must not become it. TaskRow shows
 * "+N points" and an effort band — the vocabulary of the technical report. This
 * view exists precisely to say the same job without any of that, via
 * plainAction(). The two look similar enough that merging them will look like a
 * tidy-up; it would put the jargon straight back into the plain view.
 */
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

/**
 * The plain reading of one audit.
 *
 * ⚠️ Takes the report as a PROP rather than reading site.lastAudit from
 * context, and that is not a style preference. AuditWorkspace renders
 * `fresh ?? stored` — the report it just received from the crawl, which for a
 * moment after a run is newer than what saveAudit() has written back. When the
 * two views were separate pages nobody could see the difference; as a toggle it
 * would be a switch that changes the score. One object, passed down, cannot
 * disagree with itself.
 */
export function AuditSummary({ report, site }: { report: AuditReport; site: Site }) {
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
      {/*
        Masthead, print only.

        On screen the page's own PageHeader is the heading, and a second h1 here
        would be two top-level headings on one page. In print that header is
        hidden — see the print:hidden wrapper in audit-workspace — so this takes
        over, and it has to be the FIRST CHILD of .print-report because that is
        the position globals.css styles as the masthead (2px navy rule under a
        20pt title). Only ever one of the two is in the accessibility tree,
        since display:none removes the other.
      */}
      <div className="hidden print:block">
        <h1>What this means for {site.name}</h1>
        <p>
          {site.domain} · checked {checkedOn}
        </p>
      </div>

      <div className="flex justify-end print:hidden">
        <Button size="sm" variant="ghost" onClick={() => window.print()}>
          Print or save as PDF
        </Button>
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
          {/* The summary instead of the list, with the list one click away.
              Twenty ticks in a row is something people scroll past. */}
          <p className="text-slate mt-3 text-[0.9375rem] leading-relaxed">{strengths(report)}</p>
          <Collapsible label={`Show all ${working.length}`}>
            <ul className="print-columns space-y-2.5">
              {working.map((f) => (
                <li key={f.id} className="flex gap-2.5">
                  <Check className="text-success-ink mt-[0.4rem] shrink-0" />
                  <p className="text-slate text-[0.9375rem] leading-relaxed">{plainFor(f)}</p>
                </li>
              ))}
            </ul>
          </Collapsible>
        </Card>
      )}

      {/* What's holding you back ------------------------------------------- */}
      {problems.length > 0 && (
        <Card className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg">What&rsquo;s holding you back</h2>
            <Badge tone="neutral">{problems.length}</Badge>
          </div>
          <p className="text-slate mt-3 text-[0.9375rem] leading-relaxed">
            {holdingBack(report)}
          </p>
          <Collapsible label={`Show all ${problems.length}`}>
            <ul className="divide-line divide-y">
              {problems.map((f) => (
                <ProblemRow key={f.id} finding={f} />
              ))}
            </ul>
          </Collapsible>
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

      {/* The "see the technical detail" link that used to close this is gone —
          the toggle above the page is that now, and two controls doing one job
          is one more than anybody needs. */}
      <p className="text-slate text-center text-xs print:mt-8">
        Prepared by FaqFlo from a scan of {report.crawled.length}{' '}
        {report.crawled.length === 1 ? 'page' : 'pages'} on {checkedOn}.
      </p>
    </div>
  );
}

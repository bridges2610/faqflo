'use client';

import Link from 'next/link';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScoreDial } from '@/components/ui/score-dial';
import {
  holdingBack,
  isHiddenInSummary,
  plainAction,
  plainFor,
  plainShort,
  readability,
  strengths,
  verdict,
} from '@/lib/audit/plain';
import { scoreBand } from '@/lib/audit/score';

/* The href AUDIT_TABS uses, not a second copy of the string — workspace-tabs.tsx
   owns what the technical view is called and where it lives. */
const TECHNICAL = '/dashboard/audit?view=technical';
import type { ActionItem, AuditReport, Finding } from '@/lib/audit/types';
import { isNamedAfterDomain } from '@/lib/dashboard/domain';
import { formatPlainDate } from '@/lib/dashboard/format';
import { useDashboard } from '@/lib/dashboard/provider';
import { sameReport, type Site } from '@/lib/dashboard/types';
import { IndustryPlan, IndustryPlanPrompt, VisibilityLine } from './audit-extras';

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
/** The three things worth naming, in a part. Short lines, no jargon. */
function Named({ items, tone }: { items: Finding[]; tone: 'good' | 'bad' }) {
  if (items.length === 0) return null;

  return (
    <ul className="mt-3 space-y-1.5">
      {items.slice(0, 3).map((f) => (
        <li key={f.id} className="flex gap-2.5">
          <span
            aria-hidden="true"
            className={`mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full ${
              tone === 'good' ? 'bg-success' : 'bg-warn'
            }`}
          />
          {/* ⚠️ plainShort, NEVER finding.label — eleven of the forty-four
              labels are written for a developer. See the note on plainShort. */}
          <span className="text-slate text-[0.9375rem] leading-snug">{plainShort(f)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One numbered part of the report.
 *
 * ⚠️ A DIRECT CHILD OF .print-sections, WHICH IS LOAD-BEARING. globals.css
 * gives every direct child a top rule and 6mm of air in print — that is the
 * ruled-section look the printed report has. Wrapping these in anything would
 * collapse all five into one section on paper.
 *
 * ⚠️ THE NUMBER IS DECORATION; THE HEADING IS THE MEANING. It is aria-hidden,
 * because "1" read aloud before every heading is noise, and the headings
 * already read in order.
 */
function Part({
  n,
  title,
  note,
  action,
  children,
}: {
  n: number;
  title: React.ReactNode;
  note?: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="border-line border-b py-7 last:border-b-0">
      <div className="flex gap-5 sm:gap-7">
        <span
          aria-hidden="true"
          className="text-slate/30 font-display w-5 shrink-0 text-xl leading-none font-extrabold tabular-nums sm:w-7 sm:text-2xl"
        >
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-navy text-base font-bold tracking-normal sm:text-[1.0625rem]">
              {title}
            </h2>
            {note ? <p className="text-slate shrink-0 text-sm">{note}</p> : null}
          </div>

          <div className="mt-3">{children}</div>

          {action ? (
            <Link
              href={action.href}
              className="text-primary hover:text-primary-hover mt-4 inline-block text-[0.9375rem] font-semibold print:hidden"
            >
              {action.label} →
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * One fix, with a box the customer can tick.
 *
 * ⚠️ THE TICK IS A CLAIM, NOT A MEASUREMENT. It records that the customer says
 * they have done this. The audit is what knows whether it is true, and the next
 * scan settles it — see the note on report_checked_at in migration 0016. So
 * nothing derived from a tick may ever be presented as a finding.
 */
function ActionStep({
  item,
  checked,
  onToggle,
}: {
  item: ActionItem;
  checked: boolean;
  onToggle: () => void;
}) {
  const plain = plainAction(item);

  return (
    <li className="flex gap-3">
      {/* A real checkbox: it is focusable, it announces its own state, and the
          label is tied to it without any aria of ours. */}
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        id={`act-${item.id}`}
        className="accent-primary mt-1 h-4 w-4 shrink-0 cursor-pointer print:hidden"
      />
      <div className="min-w-0 flex-1">
        <label
          htmlFor={`act-${item.id}`}
          className={`block cursor-pointer text-[0.9375rem] leading-snug font-semibold ${
            checked ? 'text-slate/60 line-through' : 'text-navy'
          }`}
        >
          {plain.what}
        </label>
        <p className="text-slate mt-1 text-[0.9375rem] leading-relaxed">{plain.why}</p>
        {item.action.kind === 'link' ? (
          /* ⚠️ plain.label, NOT item.action.label. plainAction() exists to
             replace button labels that name a file or a format — its own
             comment gives "Get the schema block" as the example — and reading
             the raw label straight off the action walks around it. That is
             exactly how "Get the schema block" reached a page whose whole job
             is to use no jargon. */
          <ButtonLink href={item.action.href} size="sm" variant="ghost" className="mt-2 print:hidden">
            {plain.label}
          </ButtonLink>
        ) : null}
      </div>
    </li>
  );
}

export function AuditSummary({ report, site }: { report: AuditReport; site: Site }) {
  const findings = report.pillars.flatMap((p) => p.findings).filter((f) => !isHiddenInSummary(f));
  const working = findings.filter((f) => f.status === 'pass');
  // Fails before warnings: the order people should read them in.
  const problems = findings
    .filter((f) => f.status === 'fail' || f.status === 'warn')
    .sort((a, b) => (a.status === b.status ? b.weight - a.weight : a.status === 'fail' ? -1 : 1));

  const { actionTicks, toggleAction, tracking } = useDashboard();

  /*
    ⚠️ ONLY TICKS STAMPED WITH THIS REPORT COUNT.

    A tick says "I did this". The audit says whether it landed. If a fix was
    ticked against last week's scan and this week's scan still raises it, the
    honest reading is that it is not done — so the stamp has to match or the
    box comes back empty. Migration 0016 carries the long form.
  */
  const ticked = new Set(
    actionTicks.filter((t) => sameReport(t.reportCheckedAt, report.checkedAt)).map((t) => t.actionId),
  );
  const done = report.actions.filter((a) => ticked.has(a.id)).length;

  /*
    ⚠️ THE TRADE ONLY TRAVELS WHEN WE DIDN'T GUESS IT.

    profileSource 'schema' means we read it off their own markup; 'manual' means
    they typed it. 'inferred' means a model filled the blank in — and content
    -workspace.tsx already treats that as the case that earns a "check this"
    badge. Opening their report with "You run a roofing contractor" over a guess
    would state our inference as their fact, in the first line of the document
    they trust most.
  */
  const trade =
    site.profileSource === 'schema' || site.profileSource === 'manual'
      ? (site.industry ?? undefined)
      : undefined;

  /* Omitted, not zeroed: an account with no checks has no result, and "named
     you in 0" is a measurement nobody took. */
  const checks = tracking?.latest ?? [];
  const namedCount = checks.filter(
    (c) => c.outcome === 'cited' || c.outcome === 'mentioned',
  ).length;

  const band = scoreBand(report.score);

  /*
    Part 1, from the two findings that decide it.

    ⚠️ plainFor() WRITES THIS, NOT THIS FILE. plain.ts already has a
    pass/warn/fail sentence for each of these. Composing a new sentence here
    would be a second voice describing the same measurement, free to drift from
    the one the technical view shows.

    ⚠️ THE SAME FOUR verdict() BRANCHES ON, AND THAT IS NOT A COINCIDENCE.
    This read only `raw-html` and `crawlers`, while the summary directly above
    it cascades over `crawlers`, `googlebot`, `raw-html` and `noindex`. So a
    site failing noindex got a verdict reading "one setting is quietly telling
    search engines to leave your site out altogether" with this part underneath
    replying "AI can read your pages" — the report disagreeing with itself in
    the two places a reader compares first. Same list, same order, one answer.

    ⚠️ SEVERITY ORDER, NOT ALPHABETICAL. Can't get in, then nothing to read,
    then told to ignore it — the order the cascade already uses. Sorting these
    any other way puts the mildest failure first.
  */
  /* ⚠️ COMPOSED IN plain.ts, NOT JOINED HERE. This was
     `blockers.map(plainFor).join(' ')`, which put five standalone sentences end
     to end and said "allowed to read your site" twice. readability() writes it
     as a paragraph, and writing it there rather than here keeps one voice
     describing one measurement — the rule stated above. */
  const readable = readability(report);
  /* ⚠️ formatPlainDate, NOT toLocaleDateString(undefined, …). This is the date
     printed on the sheet of paper a customer keeps, and it used to render in
     whatever locale and zone the browser happened to have. A second formatter
     was written for it and then deleted: in en-US it produced a string
     identical to this one, and two functions with one output is how they drift
     apart later. See the note beside PLAIN_DATE in lib/dashboard/format.ts. */
  const checkedOn = formatPlainDate(report.checkedAt);

  return (
    <div className="print-report print-sections">
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
        {/* The domain only when the name isn't already it — this is the one
            artefact a customer keeps, and "letsroof.com / letsroof.com" on it
            is the stutter people notice. */}
        <p>
          {isNamedAfterDomain(site.name, site.domain)
            ? `Checked ${checkedOn}`
            : `${site.domain} · checked ${checkedOn}`}
        </p>
      </div>

      {/*
        The score, and the one sentence about it.

        ⚠️ THE DOWNLOAD BUTTON LIVES IN HERE NOW, AND THAT FIXES AN OFF-BY-ONE.
        It used to be its own direct child sitting between the masthead and this
        block, which made THIS the third child while globals.css styles
        `.print-sections > div:nth-child(2)` as the leading block. :nth-child
        counts hidden elements, so the rule was landing on a print:hidden button
        row and the verdict never got the treatment written for it.
      */}
      <div className="border-line flex flex-col items-center gap-5 border-b pb-8 text-center sm:flex-row sm:items-center sm:gap-8 sm:text-left">
        <ScoreDial score={report.score} />
        <div className="min-w-0 flex-1">
          <p className="text-navy text-[1.125rem] leading-snug font-bold sm:text-[1.25rem]">
            {band.label}
          </p>
          <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">{verdict(report, {
              siteName: site.name,
              trade,
              named: checks.length > 0 ? namedCount : undefined,
              checked: checks.length > 0 ? checks.length : undefined,
            })}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 print:hidden"
          onClick={() => window.print()}
        >
          Download PDF
        </Button>
      </div>

      <Part n={1} title="Can AI read your site?">
        <p className="text-slate text-[0.9375rem] leading-relaxed">{readable}</p>
        {/* ⚠️ `discovered` IS EVERY IN-SCOPE URL FOUND, READ OR NOT, and it is
            bigger than crawled on a big site — see the note on it in
            lib/audit/types.ts. Saying so is the honest version of a page count;
            printing only "we read 4 pages" hides that there were 40. */}
        {report.discovered > report.crawled.length ? (
          <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">
            We read {report.crawled.length} of the {report.discovered} pages we found.
          </p>
        ) : null}
      </Part>

      <Part
        n={2}
        title="Is AI naming you?"
        action={{ href: '/dashboard/tracking', label: 'See the answers' }}
      >
        <VisibilityLine />
      </Part>

      <Part
        n={3}
        title="What&rsquo;s already good"
        action={working.length > 3 ? { href: TECHNICAL, label: 'See all the details' } : undefined}
      >
        {working.length > 0 ? (
          <p className="text-slate text-[0.9375rem] leading-relaxed">{strengths(report)}</p>
        ) : (
          <p className="text-slate text-[0.9375rem] leading-relaxed">
            Nothing is passing yet. That is what part 5 is for.
          </p>
        )}
        <Named items={working} tone="good" />
      </Part>

      <Part
        n={4}
        title="What&rsquo;s costing you"
        action={problems.length > 0 ? { href: TECHNICAL, label: 'See all the details' } : undefined}
      >
        {problems.length > 0 ? (
          <p className="text-slate text-[0.9375rem] leading-relaxed">{holdingBack(report)}</p>
        ) : (
          <p className="text-slate text-[0.9375rem] leading-relaxed">
            Nothing. Every check passed.
          </p>
        )}
        <Named items={problems} tone="bad" />
        {/* ⚠️ THE FULL LIST IS NOT HERE ANY MORE, AND IT IS NOT GONE. Two
            Collapsibles held every passing and failing finding — up to 56 of
            them on a full run — inside a report meant to be read start to
            finish. The Technical detail view renders all of them, which is
            where somebody who wants a list will look. */}
      </Part>

      {report.actions.length > 0 ? (
        <Part n={5} title="Do this next" note={`${done} of ${report.actions.length} done`}>
          <ul className="space-y-4">
            {report.actions.map((item) => (
              <ActionStep
                key={item.id}
                item={item}
                checked={ticked.has(item.id)}
                onToggle={() => toggleAction(site.id, item.id, report.checkedAt)}
              />
            ))}
          </ul>
        </Part>
      ) : null}

      <IndustryPlan pages={report.pages ?? []} />
      <IndustryPlanPrompt />

      <div>
        <p className="text-slate text-center text-[0.9375rem] leading-relaxed">
          That&rsquo;s everything. Come back after you&rsquo;ve made a change.
        </p>
        <p className="text-slate/70 mt-2 text-center text-xs">
          Checked {report.crawled.length}{' '}
          {report.crawled.length === 1 ? 'page' : 'pages'} on {checkedOn}.
        </p>
      </div>
    </div>
  );
}

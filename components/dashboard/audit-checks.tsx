'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { STATUS_CHIP, STATUS_WORD, StatusIcon } from '@/components/ui/status-icon';
import { PILLAR_PLAIN, plainFor } from '@/lib/audit/plain';
import { pillarBand } from '@/lib/audit/score';
import { PILLARS, type CheckStatus, type Finding, type PillarResult } from '@/lib/audit/types';
import { ChevronIcon } from './nav-icons';
import { Meter } from './meter';
import { MicroLabel } from './micro-label';
import { SectionTitle } from './section-title';

/*
  The technical detail, laid out for somebody who will hand it to somebody else.

  ⚠️ THE OLD LAYOUT WAS THE RAW REPORT, AND THAT WAS THE PROBLEM. Six pillar
  cards, all collapsed, each holding `label` + `detail` in the technical
  register — "Canonical URL declared", "Mobile viewport set" — in the order the
  checks happened to run, so a failure sat below eight passes and nothing was
  legible until you had clicked six times.

  ⚠️ GROUPED BY URGENCY, NOT BY AREA. The question this page gets opened with is
  "what do we actually have to do?", and a business owner forwarding it to an
  agency needs the work at the top, not distributed across six disclosures. The
  area still travels — as a tag on every row, and as the score strip below the
  headline — because which part of the site a problem lives in is how the work
  gets divided once it lands with whoever fixes it.

  ⚠️ THREE REGISTERS PER CHECK, IN THIS ORDER, AND THE ORDER IS THE WHOLE POINT:
  what it is, what we found in ordinary words, and then the technical detail
  underneath a disclosure. The owner reads the first two and stops. The agency
  opens the third. Neither is asked to read the other's half first.
*/

/** The area a check belongs to, named twice: short tag, plain gloss. */
function areaLabel(pillar: Finding['pillar']): string {
  return PILLARS.find((p) => p.id === pillar)?.label ?? pillar;
}

/**
 * One check.
 *
 * ⚠️ `finding.detail` AND EVERY EVIDENCE LINE SURVIVE VERBATIM. They are moved
 * behind a disclosure, never dropped — they are the reason a technical view
 * exists at all, and the half the person actually doing the work needs.
 */
function CheckRow({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  const bodyId = `detail-${finding.id}-${finding.status}`;
  const plain = plainFor(finding);

  /* The plain sentence falls back to the technical detail for the handful of
     checks with a deliberately blank entry (coverage.na and friends). When that
     happens the disclosure would repeat it word for word, so it is suppressed
     rather than shown twice. */
  const detailAddsSomething = finding.detail !== plain;
  const hasMore = detailAddsSomething || (finding.evidence?.length ?? 0) > 0;

  return (
    <li className="py-3.5">
      <div className="flex gap-3">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
            STATUS_CHIP[finding.status]
          }`}
        >
          <StatusIcon status={finding.status} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <p className="text-navy text-sm font-semibold">
              {finding.label}
              {/* The word, appended inside the label — the house pattern. A
                  glyph at 14px is the same smudge to a colourblind reader and
                  identical in print, so the mark never carries the meaning. */}
              <span className="sr-only"> — {STATUS_WORD[finding.status]}</span>
            </p>
            <span className="text-slate bg-cloud shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem]">
              {areaLabel(finding.pillar)}
            </span>
          </div>

          <p className="text-slate mt-1 text-sm leading-relaxed">{plain}</p>

          {hasMore && (
            <>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls={bodyId}
                className="text-slate hover:text-navy mt-1.5 inline-flex items-center gap-1 text-xs font-medium transition-colors duration-150"
              >
                <ChevronIcon
                  className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
                />
                {open ? 'Hide the detail' : 'The detail, for whoever fixes it'}
              </button>

              {open && (
                <div id={bodyId} className="border-line mt-2 border-l-2 pl-3">
                  {detailAddsSomething && (
                    <p className="text-slate text-sm leading-relaxed">{finding.detail}</p>
                  )}
                  {finding.evidence && finding.evidence.length > 0 && (
                    <ul className="text-slate mt-1.5 space-y-0.5">
                      {/* Index keys: a static list with no reordering and no
                          identity of its own — the same heading really can
                          appear on several pages. */}
                      {finding.evidence.map((e, i) => (
                        <li key={`${i}-${e}`} className="font-mono text-[0.6875rem] break-all">
                          {e}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * One urgency group.
 *
 * ⚠️ THE COUNT IS IN THE HEADING, EVEN WHEN THE GROUP IS SHUT. "Working fine
 * (33)" collapsed still tells you thirty-three checks passed; a closed
 * disclosure with no number reads as nothing there.
 */
export function CheckGroup({
  title,
  blurb,
  findings,
  defaultOpen,
}: {
  title: string;
  blurb: string;
  findings: Finding[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = `group-${title.replace(/\s+/g, '-').toLowerCase()}`;

  if (findings.length === 0) return null;

  return (
    <Card className="p-5 sm:p-7">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="group/toggle flex w-full items-start gap-2.5 text-left"
      >
        <ChevronIcon
          className={`text-slate group-hover/toggle:text-navy mt-1 h-4 w-4 shrink-0 transition-transform duration-200 ${
            open ? 'rotate-90' : ''
          }`}
        />
        <span className="min-w-0 flex-1">
          <SectionTitle as="h3">
            {title} ({findings.length})
          </SectionTitle>
          <span className="text-slate mt-1 block text-sm leading-relaxed">{blurb}</span>
        </span>
      </button>

      {open && (
        <ul id={bodyId} className="divide-line border-line mt-3 divide-y border-t pt-1">
          {findings.map((f) => (
            <CheckRow key={`${f.id}-${f.status}`} finding={f} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * The six area scores, kept from the layout this replaced.
 *
 * ⚠️ THE SCORES ARE REAL AND WERE NOT THE PROBLEM — the six collapsed cards
 * around them were. Dropping them with the cards would have thrown away a
 * measurement to fix a layout. Each carries the technical name the rest of the
 * page tags rows with, and the plain gloss underneath it.
 *
 * ⚠️ `null` IS "NOT MEASURED", NEVER ZERO. A pillar whose checks all came back
 * locked or not-applicable has no score, and drawing an empty bar for it would
 * report nothing-measured as a measurement of failure.
 */
export function AreaScores({ pillars }: { pillars: PillarResult[] }) {
  return (
    <div className="mt-5 grid gap-x-6 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {pillars.map((p) => {
        const band = pillarBand(p.score);
        const tone =
          band === 'good'
            ? 'success'
            : band === 'mixed'
              ? 'accent'
              : band === 'poor'
                ? 'error'
                : 'line';

        return (
          <div key={p.id}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-navy truncate text-xs font-semibold">{p.label}</p>
              <p className="text-slate shrink-0 text-xs tabular-nums">
                {p.score === null ? 'not measured' : `${p.score}/100`}
              </p>
            </div>
            <Meter className="mt-1.5" value={p.score ?? 0} tone={tone} />
            <p className="text-slate mt-1 text-[0.6875rem] leading-snug">{PILLAR_PLAIN[p.id]}</p>
          </div>
        );
      })}
    </div>
  );
}

/**
 * How many checks came back each way.
 *
 * Plain words rather than the status codes, and it doubles as the key for the
 * marks used down the page.
 */
export function StatusTally({ findings }: { findings: Finding[] }) {
  const n = (s: CheckStatus[]) => findings.filter((f) => s.includes(f.status)).length;

  const parts = (
    [
      { status: 'fail', count: n(['fail']), word: 'need fixing' },
      { status: 'warn', count: n(['warn']), word: 'worth a look' },
      { status: 'pass', count: n(['pass']), word: 'working fine' },
      { status: 'locked', count: n(['locked', 'na']), word: 'not checked' },
    ] satisfies { status: CheckStatus; count: number; word: string }[]
  ).filter((p) => p.count > 0);

  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      {parts.map((p) => (
        <li key={p.status} className="flex items-center gap-1.5">
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
              STATUS_CHIP[p.status]
            }`}
          >
            <StatusIcon status={p.status} className="h-3 w-3" />
          </span>
          <span className="text-navy text-xs font-medium tabular-nums">
            {p.count} {p.word}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Section heading above the four groups, so they read as one list. */
export function ChecksHeading({ total }: { total: number }) {
  return (
    <div>
      <MicroLabel>Every check we ran</MicroLabel>
      <p className="text-slate mt-2 text-sm leading-relaxed">
        All {total} checks, most urgent first. Each one says what we found in plain words, with the
        technical detail underneath for whoever looks after your website.
      </p>
    </div>
  );
}

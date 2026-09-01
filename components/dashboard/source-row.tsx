'use client';

import { useState } from 'react';
import type { CompetitorShare } from '@/lib/dashboard/types';
import { Meter } from './meter';
import { ChevronIcon, PlusIcon, TrendDownIcon, TrendFlatIcon, TrendUpIcon } from './nav-icons';

/*
  One website the engines cited, and what we know about it.

  ⚠️ THE ROW USED TO BE A DOMAIN AND A NUMBER. Everything added here was already
  on citation_checks — `engine`, `question`, `checked_at` — and was simply never
  read. Nothing here is a new measurement, a new request or a model call; see
  the note above the tally in lib/dashboard/store.ts.

  ⚠️ THE ARROW IS NEVER THE MEANING. Every trend mark carries its word in an
  sr-only span, for the reason components/ui/status-icon.tsx states at length: a
  glyph at this size is the same smudge to a colourblind reader and identical in
  print.
*/

/**
 * Trend as a mark, a word, and a sentence explaining what was compared.
 *
 * ⚠️ `help` IS THE ONLY COPY OF THAT SENTENCE, and it is deliberately explicit
 * about the comparison. "Up" on its own invites the reasonable question "up
 * against what?", and the honest answer — the latest check against the one
 * before it, not a rolling average and not the whole window — is the sort of
 * thing that has to be readable rather than assumed.
 */
const TREND: Record<
  'up' | 'down' | 'steady' | 'new',
  {
    Icon: (props: { className?: string }) => React.ReactElement;
    word: string;
    help: string;
    yourHelp: string;
    chip: string;
    yourChip: string;
  }
> = {
  up: {
    Icon: TrendUpIcon,
    word: 'Up',
    help: 'AI cited them more in the latest check than in the one before it.',
    yourHelp: 'AI cited you more in the latest check than in the one before it.',
    /* ⚠️ THE COLOUR ENCODES DIRECTION, NOT GOOD NEWS, AND THAT IS A CHANGE.
       These were inverted for rivals — red for a rival climbing, because that
       is bad for the reader — which is defensible and read as broken: everyone
       expects up to be green. So green now means "went up" on every row, and
       whether that is good depends on whose row it is. The word beside it is
       neutral and factual for the same reason: "Up", not "Worse". */
    chip: 'bg-success/12 text-success-ink',
    yourChip: 'bg-success/12 text-success-ink',
  },
  down: {
    Icon: TrendDownIcon,
    word: 'Down',
    help: 'AI cited them less in the latest check than in the one before it.',
    yourHelp: 'AI cited you less in the latest check than in the one before it.',
    chip: 'bg-error/12 text-error-ink',
    yourChip: 'bg-error/12 text-error-ink',
  },
  steady: {
    Icon: TrendFlatIcon,
    word: 'Steady',
    help: 'AI cited them the same number of times as the check before.',
    yourHelp: 'AI cited you the same number of times as the check before.',
    chip: 'bg-cloud text-slate',
    yourChip: 'bg-cloud text-slate',
  },
  new: {
    Icon: PlusIcon,
    word: 'New',
    help: 'They didn’t appear at all in the check before this one.',
    yourHelp: 'You didn’t appear at all in the check before this one.',
    chip: 'bg-navy/8 text-navy',
    yourChip: 'bg-navy/8 text-navy',
  },
};

/** Why there is no trend, which is a different fact from "no change". */
const NO_TREND_HELP =
  'We compare the last two checks, and there has only been one so far. Yours run every week.';

/**
 * The hover panel.
 *
 * ⚠️ CSS-ONLY, AND REACHABLE WITHOUT A MOUSE. It opens on `group-hover` and on
 * `group-focus-within`, and the trigger carries tabIndex={0} — so a keyboard
 * user tabs to it and a touch user taps it, neither of which a hover-only
 * tooltip serves. There is no state, so nothing re-renders a whole list of
 * rows to show one panel.
 *
 * ⚠️ IT IS NOT THE ONLY COPY OF THE SENTENCE. The same string sits in an
 * sr-only span on the trigger, so a screen reader gets it without ever opening
 * anything and this panel stays aria-hidden. A tooltip that holds the only
 * explanation is an explanation half the readers never get.
 *
 * ⚠️ `sm` AND UP ONLY, AND THAT IS A DELIBERATE LIMIT RATHER THAN AN OVERSIGHT.
 * A floating panel cannot be kept on screen below `sm` from a single anchor,
 * because the two lists put the mark in different places: in the measured list
 * it sits in a right-aligned group at the end of a row, while the watch-list
 * row WRAPS at narrow widths and the mark lands near the left edge — measured
 * at x=79 in a 320px viewport. Right-anchoring put the panel at −117 there;
 * left-anchoring then pushed the measured list's panels past the right edge.
 *
 * Rather than ship a panel that is half off screen on a phone, it is a
 * pointer-width affordance — which is what hover is. Nothing is lost to a
 * screen reader: the identical sentence sits in an sr-only span on the trigger
 * at every width, which is where it was always going to be read from anyway.
 */
function TrendHelp({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="bg-navy pointer-events-none absolute right-0 bottom-full z-20 mb-1.5 hidden w-max max-w-56 rounded-lg px-2.5 py-1.5 text-[0.6875rem] leading-snug font-normal text-white shadow-lift sm:group-hover/trend:block sm:group-focus-within/trend:block"
    >
      {children}
    </span>
  );
}

/**
 * Movement, as a chip: a mark, a word, and a sentence behind it.
 *
 * ⚠️ EXPORTED SO THE WATCH LIST USES THIS ONE. competitor-row.tsx renders the
 * same fact for a rival the owner named, and a second copy of these strings is
 * exactly the drift components/ui/status-icon.tsx was extracted to stop — where
 * one file called a warning "Worth a look" and another "Needs a look" for the
 * same status.
 *
 * ⚠️ THE CHIP KEEPS ITS WORD. A tinted pill with an arrow in it and nothing
 * else would be colour and a glyph carrying the whole meaning, which is the one
 * thing every status treatment in this dashboard refuses to do.
 */
export function TrendMark({
  trend,
  isYou = false,
}: {
  trend: CompetitorShare['trend'];
  isYou?: boolean;
}) {
  /* ⚠️ NULL IS NOT A FOURTH READING, SO IT IS NOT A CHIP. One run means there
     was nothing to compare. A pill would give the absence of a measurement the
     same visual weight as a result — the same reason a pillar with no score
     shows "not measured" rather than a zero bar. */
  if (trend === null) {
    return (
      <span className="group/trend relative inline-flex" tabIndex={0}>
        <span className="text-slate text-[0.6875rem]">no trend yet</span>
        <span className="sr-only"> — {NO_TREND_HELP}</span>
        <TrendHelp>{NO_TREND_HELP}</TrendHelp>
      </span>
    );
  }

  const t = TREND[trend];
  const help = isYou ? t.yourHelp : t.help;

  return (
    <span
      className={`group/trend relative inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6875rem] leading-none font-semibold ${
        isYou ? t.yourChip : t.chip
      }`}
      tabIndex={0}
    >
      {/* Decoration. The word beside it carries the meaning, and the sentence
          below carries the detail — see the note at the top of this file. */}
      <t.Icon className="h-3 w-3 shrink-0" />
      {t.word}
      <span className="sr-only"> — {help}</span>
      <TrendHelp>{help}</TrendHelp>
    </span>
  );
}

export function SourceRow({
  source,
  rank,
  topCitations,
  watched,
}: {
  source: CompetitorShare;
  rank: number;
  /** The largest count in this group, so bars are relative to the leader. */
  topCitations: number;
  /** True when the owner put this domain on their own watch list. */
  watched?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = `source-${source.domain.replace(/[^a-z0-9]/gi, '-')}`;
  const hasDetail = source.engines.length > 0 || source.topQuestions.length > 0;

  return (
    <li>
      <div className="flex items-baseline justify-between gap-4">
        <p
          className={`min-w-0 truncate text-sm ${
            source.isYou ? 'text-navy font-semibold' : 'text-slate'
          }`}
        >
          {rank}. {source.domain}
          {source.isYou && ' (you)'}
          {/* ⚠️ A REAL SPACE, NOT JUST ml-2. The margin separates these
              visually while leaving the text content joined — "yelp.comwatching"
              to a screen reader, and to anything reading the page as text. */}
          {watched && !source.isYou && (
            <>
              {' '}
              <span className="text-primary ml-1 text-[0.6875rem] font-medium">watching</span>
            </>
          )}
        </p>

        <span className="flex shrink-0 items-baseline gap-3">
          <TrendMark trend={source.trend} isYou={source.isYou} />
          {/* Both the count and the share, because a percentage with no
              denominator is not a measurement anyone can check. */}
          <span className="text-slate text-[0.6875rem] tabular-nums">
            {source.share < 1 && source.share > 0 ? '<1' : Math.round(source.share)}%
          </span>
          <span className="text-navy text-sm font-semibold tabular-nums">{source.citations}</span>
        </span>
      </div>

      <Meter
        className="mt-1.5"
        value={(source.citations / topCitations) * 100}
        tone={source.isYou ? 'primary' : 'line'}
      />

      {hasDetail && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={bodyId}
            className="text-slate hover:text-navy mt-1.5 inline-flex items-center gap-1 text-[0.6875rem] font-medium transition-colors duration-150"
          >
            <ChevronIcon
              className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
            />
            {open ? 'Hide detail' : 'Where they turn up'}
          </button>

          {open && (
            /* An inset panel rather than a left rule: this holds two different
               kinds of thing — which engines, and which questions — and a flat
               run of text gave the reader no way to tell them apart. */
            <div id={bodyId} className="bg-cloud mt-2 rounded-lg p-3">
              {source.engines.length > 0 && (
                <div>
                  <p className="text-slate text-[0.6875rem] font-medium tracking-wide uppercase">
                    Cited by
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {source.engines.map((e) => (
                      <li
                        key={e}
                        className="border-line text-navy rounded-full border bg-white px-2 py-0.5 text-[0.6875rem] font-medium"
                      >
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {source.topQuestions.length > 0 && (
                <div className={source.engines.length > 0 ? 'mt-3' : ''}>
                  {/* ⚠️ "CITED ON", NOT "BEATS YOU ON". An answer can cite this
                      domain and name the customer in the same breath, so the
                      stronger phrasing would claim something nobody measured. */}
                  <p className="text-slate text-[0.6875rem] font-medium tracking-wide uppercase">
                    Cited on these questions
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {source.topQuestions.map((q) => (
                      <li key={q} className="flex gap-2">
                        {/* A dot, not a list-style bullet: it needs to sit on
                            the first line of a question that wraps to two. */}
                        <span
                          aria-hidden="true"
                          className="bg-line mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full"
                        />
                        <span className="text-navy min-w-0 text-xs leading-snug">{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </li>
  );
}

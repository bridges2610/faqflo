'use client';

import { useState } from 'react';
import { EngineMark } from '@/components/ui/ai-marks';
import { Card } from '@/components/ui/card';
import { ENGINES, type CitationDay, type Engine } from '@/lib/dashboard/types';
import { ChartIcon } from './nav-icons';
import { SectionTitle } from './section-title';

/*
  Citations per engine over time.

  FORM: lines, not bars. Three series across thirty days would be ninety bars in
  a card this wide — about six pixels each. Change-over-time with a handful of
  series is what a line chart is for.

  COLOUR: validated, and the ORDER IS LOAD-BearING. Blue → teal → violet passes
  every check; violet placed next to blue fails catastrophically (ΔE 0.4 for
  deuteranopia — the two are the same colour to a red-green colourblind reader).
  Teal sits between them and keeps every adjacent pair separable. Assign by
  engine, never by rank, so a busy week can't repaint the chart.

  Blue↔teal separate at ΔE 6.7 under tritanopia, which is the band that's only
  legal alongside a second, non-colour encoding — hence the direct labels at the
  end of each line, the always-present legend, and the table view.
*/

const SERIES: Record<Engine, string> = {
  ChatGPT: '#2563EB', // --color-primary
  Perplexity: '#0891B2', // --color-teal-ink
  Gemini: '#7C3AED',
};

/*
  ⚠️ THE FIX FOR TWO ENGINES WITH THE SAME HISTORY.

  Identical values put two polylines on exactly the same pixels, and the one
  drawn second wins — the chart showed a single line and gave the reader no clue
  an engine was missing underneath it. Dashes make the overlap legible: the gaps
  in a dashed stroke let the line beneath show through, so two coincident series
  read as two.

  It also settles a debt this file's header comment already names. Blue↔teal
  separate at ΔE 6.7 under tritanopia, which is "only legal alongside a second,
  non-colour encoding" — that encoding was the end labels and the table, both of
  which are away from the line itself. Now the stroke carries it too.

  Assigned by engine, never by rank, for the same reason the colours are.
*/
const DASH: Record<Engine, string | undefined> = {
  ChatGPT: undefined,
  Perplexity: '6 3',
  Gemini: '2 3',
};

/** Smallest gap that keeps two 11px labels from touching. */
const LABEL_PITCH = 13;

/**
 * Below this many days, show a marker on every point.
 *
 * A two-day chart is a pair of measurements and should look like one — a bare
 * segment with a dot at one end reads as unfinished. Past ten points the dots
 * merge into the stroke and stop being information.
 */
const DOT_EVERY_POINT_UNTIL = 10;

const W = 720;
const H = 240;
const PAD = { top: 14, right: 92, bottom: 24, left: 34 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/**
 * Push overlapping end labels apart, without moving the data.
 *
 * ⚠️ THE DOTS DO NOT MOVE — only the text does. Nudging a series so it clears
 * another one would draw a value nobody measured, which is the one thing this
 * codebase will not do. So a label may end up off its own line, and when it
 * does the caller draws a leader back to the real point.
 *
 * Greedy downward sweep: sort by true position, then any label closer than
 * LABEL_PITCH to the one above gets pushed down. With three series the
 * arithmetic is trivial; it is a function because the "all three equal" case
 * has to stay legible and that is easy to break by hand.
 */
function dodge(entries: { engine: Engine; y: number }[]): { engine: Engine; y: number; at: number }[] {
  const sorted = [...entries].sort((a, b) => a.y - b.y);
  let previous = -Infinity;

  const placed = sorted.map(({ engine, y }) => {
    const at = Math.max(y, previous + LABEL_PITCH);
    previous = at;
    return { engine, y, at };
  });

  /*
    Pull the stack back inside the panel if the sweep ran past the bottom.
    Without this, three series all sitting at zero would put the last label
    below the x-axis, on top of the date row.
  */
  const overflow = (placed.at(-1)?.at ?? 0) - (H - 6);
  if (overflow > 0) for (const p of placed) p.at -= overflow;

  return placed;
}

function niceMax(value: number): number {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / (magnitude / 2)) * (magnitude / 2);
}

/**
 * An axis tick: month first.
 *
 * ⚠️ US ORDER, AND IT IS BUILT FROM THE KEY RATHER THAN FORMATTED. `key` is
 * already YYYY-MM-DD, so slicing it needs no Date and therefore cannot drift a
 * day across timezones — the hazard the pinned formatters in
 * lib/dashboard/format.ts exist to close. This read `${d}/${m}` and rendered
 * 15/8, which an American reader takes for the 8th of a fifteenth month.
 */
function shortDate(key: string): string {
  const [, m, d] = key.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export function CitationChart({
  daily,
  /**
   * What the chart covers, in words — "the last 30 days", "your 90-day window".
   *
   * ⚠️ IT USED TO SAY "the last {daily.length} days" AND THAT WAS ALREADY WRONG.
   * `daily` holds days on which a check RAN, not days elapsed, so a subscriber
   * who ran three times in a month read "over the last 3 days". On a scheduled
   * plan it became absurd: five checkpoints spread across three months
   * described as "the last 5 days".
   */
  span = 'over the last 30 days',
}: {
  daily: CitationDay[];
  span?: string;
}) {
  const [showTable, setShowTable] = useState(false);

  const max = niceMax(
    Math.max(1, ...daily.flatMap((d) => ENGINES.map((e) => d.byEngine[e] ?? 0))),
  );
  const stepX = daily.length > 1 ? PLOT_W / (daily.length - 1) : 0;

  /*
    ⚠️ ONE DAY IS NOT ZERO DAYS. With a single point stepX is 0, so the old
    scale put it hard against the left axis — the first run a customer ever
    does rendered as a chart that looked broken. Centre it instead: there is no
    line to draw, but three dots in the middle of the panel say "we measured
    once" rather than "something failed".
  */
  const lone = daily.length === 1;
  const x = (i: number) => (lone ? PAD.left + PLOT_W / 2 : PAD.left + i * stepX);
  const y = (value: number) => PAD.top + PLOT_H - (value / max) * PLOT_H;
  const ticks = [0, max / 2, max];

  const last = daily[daily.length - 1];

  /*
    ⚠️ WHEN EVERY SERIES ENDS ON ONE VALUE THEY SHARE ONE DOT, AND THREE LABELS
    POINTING AT IT IS THE BUG. dodge() below anticipated this — "the 'all three
    equal' case has to stay legible" — and made it legible rather than right: at
    zero the three stacked into 26px above the date row, each with a leader line
    converging on the same point, which reads as a fault.

    One label is what is actually true there. It is also the only version that
    fits: PAD.right is 92px, and joining the names ("Perplexity · Gemini" alone
    measures about 106px at this size) would run off the panel.

    ⚠️ ONLY WHEN ALL OF THEM AGREE. Two coincident series still dodge, because
    two labels 13px apart are readable and naming them individually keeps the
    per-series encoding the header argues for. This collapses the one case where
    there is nothing left to tell apart.
  */
  const endValue = (engine: Engine) => last?.byEngine[engine] ?? 0;
  const allShareEnd = ENGINES.every((e) => endValue(e) === endValue(ENGINES[0]));
  // +4 puts the text baseline level with the dot's centre; dodging works in
  // baseline space so the result can be handed straight to <text y>.
  const endLabels = dodge(
    ENGINES.map((engine) => ({ engine, y: y(last?.byEngine[engine] ?? 0) + 4 })),
  );
  const labelAt = new Map(endLabels.map((l) => [l.engine, l.at]));
  const showEveryDot = daily.length <= DOT_EVERY_POINT_UNTIL;

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionTitle icon={<ChartIcon className="h-4 w-4" />} tint="bg-primary-soft text-primary">
            Is it getting better?
          </SectionTitle>
          <p className="text-slate mt-1 text-sm">
            How many questions each AI linked you on, {span}.
          </p>
        </div>
        <button
          onClick={() => setShowTable((v) => !v)}
          className="text-primary hover:text-primary-hover text-sm font-medium transition-colors duration-150"
        >
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {/* ⚠️ THE SWATCH IS NOT DECORATION, AND THE LOGO DOES NOT REPLACE IT.

          The dot is the only thing tying a legend entry to its polyline.
          Swapping it for the brand mark would leave the reader nothing to match
          a line against, and would quietly undo the colour system this file's
          header argues for at length.

          The two colours also disagree, unavoidably: Perplexity's #20808D sits
          beside its series teal #0891B2, OpenAI's black beside ChatGPT's blue.
          Swatch first, mark second, name last — the larger, more saturated
          shape is what the eye lands on, so the series colour stays the primary
          read and the mark is recognition after it. */}
      <div className="mt-4 flex flex-wrap items-center gap-5">
        {ENGINES.map((engine) => (
          <span key={engine} className="text-slate flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: SERIES[engine] }}
              aria-hidden="true"
            />
            <EngineMark engine={engine} className="h-3.5 w-3.5 shrink-0" />
            {engine}
          </span>
        ))}
      </div>

      {showTable ? (
        <div className="mt-4 max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Daily citations per engine</caption>
            <thead className="text-slate sticky top-0 bg-white text-left">
              <tr className="border-line border-b">
                <th scope="col" className="py-2 font-medium">
                  Date
                </th>
                {ENGINES.map((e) => (
                  <th key={e} scope="col" className="py-2 text-right font-medium">
                    {e}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {[...daily].reverse().map((d) => (
                <tr key={d.date}>
                  <td className="text-navy py-2 font-mono text-xs">{d.date}</td>
                  {ENGINES.map((e) => (
                    <td key={e} className="text-navy py-2 text-right tabular-nums">
                      {d.byEngine[e] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="mt-4 w-full"
          role="img"
          aria-label={`Citations per engine ${span}`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="#E2E8F0"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={y(t) + 4}
                textAnchor="end"
                className="fill-slate"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                {t}
              </text>
            </g>
          ))}

          {ENGINES.map((engine) => {
            const points = daily.map((d, i) => `${x(i)},${y(d.byEngine[engine] ?? 0)}`);
            const endX = x(daily.length - 1);
            const endY = y(last?.byEngine[engine] ?? 0);
            const textY = labelAt.get(engine) ?? endY + 4;
            return (
              <g key={engine}>
                <polyline
                  points={points.join(' ')}
                  fill="none"
                  stroke={SERIES[engine]}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={DASH[engine]}
                />

                {/* ⚠️ Dots on every point only while the range is short. Two
                    engines on the same value stack their dots exactly, so the
                    white ring is doing real work: a stack reads as visibly
                    heavier than a lone dot, which is the only hint the flat
                    stretch of an overlap gives. */}
                {showEveryDot &&
                  daily.map((d, i) => (
                    <circle
                      key={d.date}
                      cx={x(i)}
                      cy={y(d.byEngine[engine] ?? 0)}
                      r="3"
                      fill={SERIES[engine]}
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                    />
                  ))}

                {/* End marker plus a direct label: identity never rests on
                    colour alone, which the tritan separation makes mandatory. */}
                <circle
                  cx={endX}
                  cy={endY}
                  r="4"
                  fill={SERIES[engine]}
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />

                {/* Drawn only when the label was actually moved. A leader to a
                    label already sitting on its own line is noise.

                    ⚠️ AND NEVER WHEN THE LABELS HAVE COLLAPSED INTO ONE. Three
                    leaders to a single shared label is the converging-lines
                    picture this change exists to remove. */}
                {!allShareEnd && Math.abs(textY - (endY + 4)) > 1 && (
                  <line
                    x1={endX + 5}
                    y1={endY}
                    x2={endX + 9}
                    y2={textY - 4}
                    stroke={SERIES[engine]}
                    strokeWidth="1"
                    opacity="0.5"
                  />
                )}

                {/* Coloured, not grey. Once a label can sit off its own line,
                    colour is what ties it back to the series. */}
                {!allShareEnd && (
                  <text x={endX + 10} y={textY} fontSize="11" fill={SERIES[engine]}>
                    {engine}
                  </text>
                )}
              </g>
            );
          })}

          {/*
            The three marks, in a row, where three stacked labels used to be.

            ⚠️ THE MARKS ARE THE LABEL HERE, WHICH IS THE ONE PLACE THAT IS
            HONEST. Everywhere else in this product a glyph is decoration beside
            a word — the legend above pairs each mark with its engine's name for
            exactly that reason. This row is different because the three series
            are on one point: there is nothing to tell apart, so the row is
            saying "all of these", and the names are already in the legend a few
            pixels up.

            ⚠️ WHICH IS WHY THE GROUP CARRIES AN accessible NAME. The marks are
            each aria-hidden by their own definition, so without this the whole
            row is silent — and the file's header counts these end labels as one
            of the three non-colour encodings that make blue and teal legal
            together. role="img" plus aria-label is what keeps that true.

            ⚠️ THE SIZE COMES FROM svg ATTRIBUTES, NOT FROM TAILWIND, AND THE
            FIRST ATTEMPT GOT THIS WRONG. Each mark is an <svg> with a viewBox
            and no width/height of its own, which per spec defaults to 100% of
            its viewport — so a `h-3 w-3` class did nothing useful and all three
            marks painted at full chart size, clipped, in the corner. Wrapping
            each in a nested <svg> that carries real x/y/width/height gives the
            mark a 12-unit viewport to fill, in the chart's own coordinate
            system, so it scales with the panel.

            ⚠️ ABOVE THE POINT, for the reason the text was: a shared value is
            usually zero, and zero is a gridline. Sitting on it drew the rule
            straight through the marks.
          */}
          {allShareEnd && (
            <g
              role="img"
              aria-label={`All ${ENGINES.length} engines: ${endValue(ENGINES[0])}`}
              transform={`translate(${x(daily.length - 1) + 10}, ${y(endValue(ENGINES[0])) - 18})`}
            >
              {ENGINES.map((engine, i) => (
                <svg key={engine} x={i * 16} y={0} width={12} height={12}>
                  <EngineMark engine={engine} className="" />
                </svg>
              ))}
            </g>
          )}

          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + PLOT_H}
            y2={PAD.top + PLOT_H}
            stroke="#E2E8F0"
            strokeWidth="1"
          />

          {/* ⚠️ THE ENDS ARE ALWAYS LABELLED. The old rule was
              `i % 7 === 0 || (i === last && i % 7 > 2)`, which silently left
              the final day undated at every length up to three: at two days
              i=1 gives 1 % 7 = 1, and 1 > 2 is false. A two-day chart showed
              one date, at the left, and nothing under the point the reader
              actually cares about. Week markers are still every 7, but only
              where they can't crowd an end label. */}
          {/* ⚠️ AND EVERY POINT IS LABELLED WHEN THERE ARE FEW ENOUGH OF THEM.
              A scheduled plan produces five points that are weeks apart, drawn
              evenly because the axis is index-based — with only the ends dated,
              five checks spread over three months read as five consecutive
              measurements. Reuses DOT_EVERY_POINT_UNTIL rather than inventing a
              second threshold: the same count at which each point is worth
              marking is the count at which each one is worth naming. */}
          {daily.map((d, i) => {
            const isEnd = i === 0 || i === daily.length - 1;
            const clearOfEnds = i >= 2 && i <= daily.length - 3;
            const sparse = daily.length <= DOT_EVERY_POINT_UNTIL;
            if (!sparse && !isEnd && !(i % 7 === 0 && clearOfEnds)) return null;
            return (
              <text
                key={d.date}
                x={x(i)}
                y={H - 6}
                // Pinned inward at the ends so a date can't overhang the panel.
                textAnchor={
                  daily.length > 1 && i === 0
                    ? 'start'
                    : daily.length > 1 && i === daily.length - 1
                      ? 'end'
                      : 'middle'
                }
                className="fill-slate"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                {shortDate(d.date)}
              </text>
            );
          })}
        </svg>
      )}
    </Card>
  );
}

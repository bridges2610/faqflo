'use client';

import { useState } from 'react';
import { EngineMark } from '@/components/ui/ai-marks';
import { Card } from '@/components/ui/card';
import { timeUntil } from '@/lib/dashboard/format';
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
  legal alongside a second, non-colour encoding — hence the always-present
  legend, the dashed strokes below, and the table view.

  ⚠️ THAT LIST USED TO NAME "the direct labels at the end of each line", AND THE
  LABELS ARE GONE. They were removed because the legend already names every
  engine and the labels repeated it on every render. The requirement they were
  serving did not go with them: three encodings still carry identity without
  colour, and the dash patterns — added later, with a note saying "Now the stroke
  carries it too" — are on the line itself, which is more than the end labels
  managed. Anything that removes the legend, the dashes or the table has to put
  a fourth encoding back.

  FIRST-SCAN FORM: bars, not a line. One measurement is not a trend, and three
  dots on an empty grid answer a question nobody asked. See the bars branch.
*/

/*
  ⚠️ TOKENS, NOT LITERALS, BECAUSE THESE THREE HAD TO SURVIVE DARK MODE. They
  were the light hex values, which on the dark card (#101d35) measure 3.25:1,
  4.57:1 and 2.95:1 — the chart would have gone nearly invisible on two of its
  three series. Each token carries a lightened dark counterpart of the SAME hue,
  so the blue → teal → violet order the comment above calls load-bearing is
  preserved in both themes.
*/
const SERIES: Record<Engine, string> = {
  ChatGPT: 'var(--color-primary)',
  Perplexity: 'var(--color-teal-ink)',
  Gemini: 'var(--color-violet)',
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

/*
  ⚠️ PAD.right WAS 92, AND THE 92 WAS THE END LABELS' GUTTER. Each line used to
  carry its engine name past the last point, so the plot stopped well short of
  the panel edge to leave room. The labels are gone — the legend names them —
  and holding the gutter open would leave a third of the card empty for nothing.
  20 is the breathing room the final dot needs and no more.
*/
const PAD = { top: 14, right: 20, bottom: 24, left: 34 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/**
 * Whole-number y-axis ticks, ending exactly on the questions checked.
 *
 * ⚠️ THIS REPLACED niceMax(), WHICH ROUNDED THE CEILING UP TO A "NICE" NUMBER
 * AND THEN HALVED IT. On an axis counting questions that produced two lies at
 * once: a top gridline above anything that could be measured, and a middle tick
 * reading 2.5 whenever the max was odd. There is no such thing as half a
 * question linked.
 *
 * The ceiling is the count of questions actually checked, so the top of the
 * panel is what a perfect score would look like and the bars beneath it are
 * legible as a proportion rather than as a number floating in space.
 *
 * ⚠️ DE-DUPLICATED, because at max 1 the midpoint IS the ceiling. Three ticks
 * where two are the same value draws the same gridline twice and labels it
 * twice.
 */
function axisTicks(max: number): number[] {
  const mid = Math.round(max / 2);
  return [...new Set([0, mid, max])].sort((a, b) => a - b);
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

/**
 * "ChatGPT", "ChatGPT and Gemini", "ChatGPT, Perplexity and Gemini" — for the
 * chart's accessible name, which is read as a sentence rather than scanned.
 * "ChatGPT and Perplexity and Gemini" is not a sentence anybody says.
 */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
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
  /**
   * No automatic re-check on this plan — free.
   *
   * ⚠️ TWO FACTS RATHER THAN A FINISHED SENTENCE, AND `span` ABOVE IS WHY. That
   * one is prose, and the overview caller carries a note conceding it is
   * "copied from the AI Mentions page rather than written again" — two callers,
   * two copies, one drift waiting to happen. Passing the plan and the date keeps
   * the wording in one place.
   */
  unscheduled = false,
  /** When the next automatic check lands, for the plans that get one. */
  nextCheckAt = null,
}: {
  daily: CitationDay[];
  span?: string;
  unscheduled?: boolean;
  nextCheckAt?: string | null;
}) {
  const [showTable, setShowTable] = useState(false);

  /*
    Which engines the reader has picked out. Any number of them, and an EMPTY
    LIST MEANS ALL THREE — not "none". A legend that can filter down to a blank
    chart is a legend that can strand someone on an empty card with no clue what
    to click, so unpicking the last one comes back to the default rather than to
    nothing. Same reason the first click focuses rather than hides: it takes one
    click to isolate a series, one more to add a second for comparison, and
    unpicking your way back is always a route home.

    ⚠️ FADE, NOT HIDE, AND THE AXIS DOES NOT MOVE. Removing series would raise
    the question of whether axisMax refits to what is left — and if it did, the
    scale would jump on every click, on a chart whose scale exists to make small
    differences legible. Dimming keeps the comparison too: "ahead of Gemini" is
    still readable while ChatGPT is focused, which is most of why three series
    are drawn at all.
  */
  const [focused, setFocused] = useState<Engine[]>([]);
  const isFocused = (engine: Engine) => focused.includes(engine);
  const toggleEngine = (engine: Engine) =>
    setFocused((current) =>
      current.includes(engine) ? current.filter((e) => e !== engine) : [...current, engine],
    );

  /* Full strength for a picked series, or for everything when nothing is picked. */
  const seriesOpacity = (engine: Engine) => (focused.length === 0 || isFocused(engine) ? 1 : 0.12);

  /*
    ⚠️ DERIVED FROM THE OPACITY RULE, NOT FROM `focused`, so the accessible name
    can never describe dimming that isn't on screen. Picking all three back one
    at a time leaves `focused` full but nothing faded — the same picture as the
    default — and a label reading "with the other engines dimmed" there would be
    describing a chart that does not exist.
  */
  const shown = ENGINES.filter((engine) => seriesOpacity(engine) === 1);
  const anyDimmed = shown.length < ENGINES.length;

  /*
    ⚠️ ONE SCAN IS NOT A TREND, AND THIS IS THE BRANCH THAT ADMITS IT. The code
    used to centre the lone point so the first run "does not render as a chart
    that looked broken" — which fixed the look and left the shape wrong. A line
    chart of one measurement plots three dots on an empty grid and invites the
    reader to find a slope in it. Bars answer what one check can actually
    answer: where you stand, out of how many.
  */
  const single = daily.length === 1;

  /*
    ⚠️ TWO NUMBERS, AND THEY USED TO BE ONE — WHICH IS THE BUG THIS REPLACES.

    A single `max` was serving as both the line chart's axis ceiling and the
    bars' denominator, and it was computed from `d.checked`. Those are three
    different quantities and conflating them was wrong twice over.

    lib/dashboard/store.ts counts the rollup like this:

        day.checked += 1                      on EVERY question × engine row
        day.byEngine[engine] += 1             one engine, cited only

    So `checked` is checks (27 questions × 3 engines = 81) while every series
    plots cited questions for ONE engine (0-3). The axis came out at 0/41/81 with
    all three lines flat on the floor, and the bars read "3 of 81" at 4% width
    when the truth was "3 of 27" at 11%.

    Keep them apart. An axis ceiling and a denominator answer different
    questions and there is no number that is honestly both.
  */

  /*
    The line chart's ceiling: the highest point any series actually reaches,
    never below 5.

    ⚠️ IT FITS THE DATA RATHER THAN THE OPPORTUNITY, DELIBERATELY. Scaling to
    "questions we could have been cited on" is the more informative axis and it
    is unreadable: 3 against 27 sits in the bottom ninth of the panel and every
    week-to-week difference — the entire point of a trend line — disappears into
    the floor. The tick labels still print the real numbers, so the size is never
    overstated; what changes is only whether the shape can be seen.

    ⚠️ THE FLOOR OF 5 IS WHAT KEEPS IT HONEST AT THE BOTTOM. Fitting a single
    citation to a 0-1 axis draws a vertical takeoff out of one data point.

    ⚠️ NO HEADROOM ON TOP OF THE PEAK. `peak + 1` turns a max of 12 into 13 and
    the middle tick into 7; the floor already supplies breathing room where the
    data is small, and a point resting on the top gridline reads fine.
  */
  const peak = Math.max(0, ...daily.flatMap((d) => ENGINES.map((e) => d.byEngine[e] ?? 0)));
  const axisMax = Math.max(5, peak);

  /*
    The bars' denominator: how many questions each engine was actually asked.

    ⚠️ DIVIDED BY THE ENGINE COUNT, because `checked` counts every question ×
    engine pair and a bar compares ONE engine's citations against the questions
    THAT engine saw.

    ⚠️ AN APPROXIMATION, AND IT ERRS IN THE FLATTERING DIRECTION — WHICH IS THE
    part to know. It is exact when all three engines answered. When one fails
    outright the day holds 2 rows per question instead of 3, so dividing by 3
    UNDERSTATES the denominator: 27 questions checked by two engines gives 18,
    and a bar then reads "3 of 18" where the honest figure is "3 of 27". Measured,
    not assumed — the fixture for a 429'd engine returns exactly that.

    It cannot be computed better from what the rollup stores: `byEngine` counts
    citations, not checks, so there is no per-engine denominator in the data. The
    exact fix is a `questions` field on CitationDay — a store change through the
    type, the rollup and the seed. Worth doing if this number is ever quoted at
    somebody rather than drawn as a bar.
  */

  const stepX = daily.length > 1 ? PLOT_W / (daily.length - 1) : 0;

  const x = (i: number) => PAD.left + i * stepX;
  const y = (value: number) => PAD.top + PLOT_H - (value / axisMax) * PLOT_H;
  const ticks = axisTicks(axisMax);

  const last = daily[daily.length - 1];

  const askedPerEngine = Math.max(1, Math.ceil((last?.checked ?? 0) / ENGINES.length));

  /*
    ⚠️ NO END LABELS ANY MORE, AND WITH THEM WENT dodge(), THE LEADER LINES AND
    THE SHARED-VALUE MARKS ROW. Every one of those existed to name a series at
    the end of its line, which the legend three inches above already does on
    every render. The header records what that costs and why it is still safe:
    the legend, the dashes and the table are three non-colour encodings, and the
    dashes sit on the line itself.

    The end DOTS stay. A marker is not a label — it is where the last
    measurement is, which nothing else says.
  */
  const showEveryDot = daily.length <= DOT_EVERY_POINT_UNTIL;

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionTitle icon={<ChartIcon className="h-4 w-4" />} tint="bg-primary-soft text-primary">
            {single ? 'Where you stand today' : 'Is it getting better?'}
          </SectionTitle>
          {/* ⚠️ THE HEADING AND THE SUBTITLE BOTH FOLLOW THE DATA. "Is it getting
              better?" over a single measurement asks a question the card cannot
              answer; "out of N checked" is the reading one scan genuinely
              supports. The `span` prose belongs to the trend state only — it
              describes a window, and one scan is a moment. */}
          <p className="text-slate mt-1 text-sm">
            {single
              ? `Questions each AI linked you on, out of ${askedPerEngine} checked.`
              : `How many questions each AI linked you on, ${span}.`}
          </p>
          {/* ⚠️ ONLY IN THE SINGLE-SCAN STATE. On a trend the same fact is
              already on the page — AI Mentions prints the next check under the
              chart — and the reader of a one-scan card is the one who needs to
              know whether a second is coming at all. */}
          {single && (
            <p className="text-slate mt-1 text-sm">
              {unscheduled
                ? 'This is your one check. Pro re-checks every week, so the numbers can move.'
                : nextCheckAt
                  ? `Next check ${timeUntil(nextCheckAt)}.`
                  : 'We check again every week.'}
            </p>
          )}
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
      {/*
        ⚠️ BUTTONS OVER THE CHART, PLAIN SPANS OVER THE TABLE. Clicking engines
        picks which lines stay at full strength, and the table is deliberately
        never filtered — see the note on it below — so above the table these
        would be controls that do nothing, which is worse than no controls.

        ⚠️ A REAL <button>, NOT A <span> WITH AN onClick. The legend is one of the
        three non-colour encodings this file's header depends on; making it the
        chart's only filter and then leaving it unreachable by keyboard, or
        silent about its state, would take that away from exactly the readers it
        was put there for. aria-pressed is what carries "picked" to anyone who
        cannot see the dimming.

        ⚠️ aria-pressed IS false ON EVERY ENTRY WHEN NOTHING IS PICKED, even
        though all three lines are drawn. "Pressed" reports the state of the
        control, not the visibility of the line — marking all three pressed by
        default would leave a screen reader unable to tell the default apart from
        a reader who had deliberately picked all three back.
      */}
      <div className="mt-4 flex flex-wrap items-center gap-5">
        {ENGINES.map((engine) =>
          showTable ? (
            <span key={engine} className="text-slate flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: SERIES[engine] }}
                aria-hidden="true"
              />
              <EngineMark engine={engine} className="h-3.5 w-3.5 shrink-0" />
              {engine}
            </span>
          ) : (
            <button
              key={engine}
              type="button"
              aria-pressed={isFocused(engine)}
              onClick={() => toggleEngine(engine)}
              className={`flex items-center gap-2 rounded-input px-1.5 py-1 text-sm transition-opacity duration-150 ${
                seriesOpacity(engine) === 1 ? 'text-navy' : 'text-slate opacity-45'
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: SERIES[engine] }}
                aria-hidden="true"
              />
              <EngineMark engine={engine} className="h-3.5 w-3.5 shrink-0" />
              {engine}
            </button>
          ),
        )}
      </div>

      {single && !showTable ? (
        /*
          ⚠️ HTML, NOT SVG. One bar per engine needs no axis, no viewBox and no
          coordinate system — a div scales itself, and the label stays real text
          that wraps and is selectable. The SVG below earns its complexity by
          drawing a line across time; this does not.

          ⚠️ WIDTH IS THE SHARE OF QUESTIONS CHECKED, WHICH IS WHY A ZERO STILL
          DRAWS ITS ROW. An engine that linked nothing is a measurement, not an
          absence — the row, the name and the 0 all render, and only the fill has
          no width. Dropping the row would read as "we did not ask".
        */
        <ul className="mt-5 space-y-3">
          {ENGINES.map((engine) => {
            const value = last?.byEngine[engine] ?? 0;
            return (
              /* Same focus rule as the line chart: the legend sits above both
                 views, so a toggle that moved only the SVG would look broken on
                 a single-scan account. */
              <li
                key={engine}
                style={{ opacity: seriesOpacity(engine) }}
                className="transition-opacity duration-200"
              >
                <div className="text-navy flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <EngineMark engine={engine} className="h-3.5 w-3.5 shrink-0" />
                    {engine}
                  </span>
                  <span className="tabular-nums">
                    {value}
                    <span className="text-slate"> of {askedPerEngine}</span>
                  </span>
                </div>
                {/* aria-hidden: the numbers above already say it, and a bar with
                    its own announcement would read the same fact twice. */}
                <div
                  aria-hidden="true"
                  className="bg-cloud mt-1.5 h-2.5 w-full overflow-hidden rounded-full"
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(value / askedPerEngine) * 100}%`,
                      backgroundColor: SERIES[engine],
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : showTable ? (
        <div className="mt-4 max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Daily citations per engine</caption>
            <thead className="text-slate sticky top-0 bg-surface text-left">
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
          /* ⚠️ IT NAMES THE PICKED ENGINES. With the rest faded to 12% the plain
             label described a chart nobody is being shown — and this is the
             element's only accessible name. Listed in ENGINES order rather than
             click order, so the same pair always reads the same way. */
          aria-label={
            anyDimmed
              ? `Citations for ${listNames(shown)} ${span}, with the other engines dimmed`
              : `Citations per engine ${span}`
          }
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-line)"
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
            return (
              /* The whole series dims together — line, dots and end marker —
                 so a faded engine reads as one receding object rather than
                 three unrelated things losing contrast at once. */
              <g key={engine} opacity={seriesOpacity(engine)} className="transition-opacity duration-200">
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
                      stroke="var(--color-surface)"
                      strokeWidth="1.5"
                    />
                  ))}

                {/* The last measurement's marker. No label beside it — the
                    legend names every series, and repeating it here on every
                    render is what this removal was for. */}
                <circle
                  cx={endX}
                  cy={endY}
                  r="4"
                  fill={SERIES[engine]}
                  stroke="var(--color-surface)"
                  strokeWidth="2"
                />
              </g>
            );
          })}

          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + PLOT_H}
            y2={PAD.top + PLOT_H}
            stroke="var(--color-line)"
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

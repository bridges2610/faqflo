'use client';

import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button';
import { EngineMark } from '@/components/ui/ai-marks';
import { checkedTodayUtc, runsLeftFor } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { groupByQuestion, type QuestionGroup } from '@/lib/dashboard/questions';
import { ENGINES, type CitationCheck, type Engine, type SiteTracking } from '@/lib/dashboard/types';

/*
  Who gets named for your prompts — the free report's centrepiece.

  ⚠️ THIS REPLACED THE ANSWER WRITER, AND IT ANSWERS A DIFFERENT QUESTION. The
  free page used to end in a generator: write some FAQs, copy them out. That put
  the work before the reason for it — somebody who has not yet seen that an
  assistant names a directory instead of them has no reason to write anything.
  So free is now sold a diagnosis, and the writing is part of Pro.

  ⚠️ A TABLE BECAUSE THE COMPARISON IS THE POINT. Results renders the same data
  as a list of expandable rows, which is right when there are twenty-five
  prompts and the reader is hunting. Here there are three, and the useful shape
  is the grid: one glance across a row says "no engine names me", one glance
  down a column says "Perplexity never does".

  ⚠️ IT SHOWS WHAT IS THERE, NOT ALWAYS THREE ROWS. Accounts created before the
  cap moved to 3 have five checked prompts, and slicing to three here would hide
  measurements that were taken and paid for. Whatever `latest` holds is what the
  table renders.
*/

/** What one cell can say. `null` is a gap, not a zero — see CELL below. */
type Cell = 'named' | 'absent' | null;

/*
  ⚠️ THE GLYPH IS NOT THE MEANING, THE `sr-only` WORD IS.

  A tick and a cross at 14px are the same smudge to a colourblind reader and
  identical in a greyscale print, and this grid has no other text in its cells —
  so unlike a chip with a label beside it, there is genuinely nothing else
  carrying the outcome. Every cell states its word.

  ⚠️ AND `null` MUST NEVER RENDER AS A CROSS. An engine can fail on its own — a
  429 mid-run — and the row for it is simply absent. A cross would claim we
  asked and were not named; we did not ask. Results states the same rule for its
  NOT_CHECKED pill.
*/
const CELL: Record<'named' | 'absent' | 'gap', { glyph: string; word: string; className: string }> =
  {
    named: { glyph: '✓', word: 'named you', className: 'text-success-ink' },
    absent: { glyph: '✗', word: 'did not name you', className: 'text-slate/50' },
    gap: { glyph: '–', word: 'not checked', className: 'text-slate/40' },
  };

/**
 * Which engine gets which colour.
 *
 * ⚠️ THE SEQUENCE IS BORROWED, NOT CHOSEN. citation-chart.tsx assigns blue →
 * teal → violet by engine and records that the ORDER IS LOAD-BEARING: violet
 * beside blue is a 0.4 ΔE collision under deuteranopia, and the arrangement it
 * uses was validated against that. A second surface keying colour by engine has
 * to reuse the same mapping or the two disagree about what Gemini looks like.
 *
 * Used on the marks' backing only — the outcome in each cell is never coloured
 * by engine.
 */
const ENGINE_TINT: Record<Engine, string> = {
  ChatGPT: 'text-primary',
  Perplexity: 'text-teal-ink',
  Gemini: 'text-violet',
};

function cellFor(group: QuestionGroup, engine: Engine): Cell {
  const check = group.checks.find((c) => c.engine === engine);
  if (!check) return null;
  return check.outcome === 'cited' || check.outcome === 'mentioned' ? 'named' : 'absent';
}

/**
 * Who the engines pointed at instead, for one prompt.
 *
 * ⚠️ NO CATEGORY CLAIMED. `citedInstead` is the top source in the engine's own
 * ranking that is not the customer's domain, which is a lead-generation
 * directory at least as often as it is a rival business — so the column is
 * headed "Named instead" and the cell is a bare domain. proof-card.tsx carries
 * the long form of this warning; calling these "competitors" would be
 * confidently wrong on a large share of local-services accounts.
 */
function insteadFor(group: QuestionGroup): string | null {
  return group.checks.find((c) => c.outcome !== 'cited' && c.citedInstead)?.citedInstead ?? null;
}

export function PromptRanking({ tracking }: { tracking: SiteTracking | null }) {
  const { trackingRun, runTracking } = useDashboard();

  const latest: CitationCheck[] = tracking?.latest ?? [];
  const groups = groupByQuestion(latest);

  if (groups.length === 0) return null;

  const runsLeft = runsLeftFor(tracking);
  const ranToday = checkedTodayUtc(latest);
  const busy = trackingRun.busy;

  /* The prompts the table is showing — exactly what the button re-asks. See the
     note on runTracking's `only` parameter. */
  const shown = groups.map((g) => g.question);

  return (
    <>
      <p className="text-slate text-sm">
        We put these to {ENGINES.join(', ')} and recorded who each one named.
      </p>

      {/* ⚠️ The table scrolls inside this box rather than widening the report.
          Five columns do not fit a phone, and a page that scrolls sideways as a
          whole is worse than one panel that does. */}
      <div className="mt-4 -mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead>
            <tr className="border-line border-b">
              <th className="text-slate py-2 pr-4 font-mono text-[0.6875rem] tracking-wide uppercase">
                Prompt
              </th>
              {ENGINES.map((engine) => (
                <th key={engine} className="px-2 py-2 text-center align-bottom">
                  <span className="flex flex-col items-center gap-1">
                    <EngineMark engine={engine} className="h-4 w-4" />
                    <span
                      className={`font-mono text-[0.6875rem] tracking-wide uppercase ${ENGINE_TINT[engine]}`}
                    >
                      {engine}
                    </span>
                  </span>
                </th>
              ))}
              <th className="text-slate py-2 pl-4 font-mono text-[0.6875rem] tracking-wide uppercase">
                Named instead
              </th>
            </tr>
          </thead>

          <tbody className="divide-line divide-y">
            {groups.map((group) => {
              const instead = insteadFor(group);

              return (
                <tr key={group.question}>
                  <td className="text-navy py-3 pr-4 align-middle text-sm">{group.question}</td>

                  {ENGINES.map((engine) => {
                    const cell = cellFor(group, engine);
                    const style = CELL[cell ?? 'gap'];

                    return (
                      <td key={engine} className="px-2 py-3 text-center align-middle">
                        <span className={`text-base font-semibold ${style.className}`}>
                          <span aria-hidden="true">{style.glyph}</span>
                          <span className="sr-only">
                            {engine} {style.word}
                          </span>
                        </span>
                      </td>
                    );
                  })}

                  <td className="py-3 pl-4 align-middle">
                    {instead ? (
                      <span className="text-slate font-mono text-xs">{instead}</span>
                    ) : (
                      /* No usable source in any answer. Honest reading: nobody
                         in particular — not an empty cell, and not a rival we
                         did not find. */
                      <span className="text-slate/50 text-xs">nobody in particular</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <RunControl
        runsLeft={runsLeft}
        ranToday={ranToday}
        busy={busy}
        error={trackingRun.error}
        onRun={() => void runTracking(shown)}
      />
    </>
  );
}

/**
 * The button, and the three reasons it might not be one.
 *
 * ⚠️ TWO LIMITS, NOT ONE, AND BOTH HAVE TO BE SAID OUT LOUD.
 *
 * `runsLeft` is the allowance — three per account, derived from rows rather
 * than stored. `ranToday` is the other one: the tracking route skips any
 * question/engine pair it already holds from today, because "re-asking the same
 * question twice in one day tells you nothing new and bills twice for it". So a
 * second press on the same day returns `{checked: 0, done: true}` and changes
 * nothing on screen.
 *
 * A button that spends a click, reports success and leaves the table identical
 * is the worst of the available failures — it reads as the product being
 * broken. Saying "come back tomorrow" is both honest and the better offer,
 * because the point of a re-check is to see whether a fix moved anything, and
 * nothing gets fixed in the ten seconds since the last press.
 */
function RunControl({
  runsLeft,
  ranToday,
  busy,
  error,
  onRun,
}: {
  runsLeft: number;
  ranToday: boolean;
  busy: boolean;
  error: string | null;
  onRun: () => void;
}) {
  const spent = runsLeft <= 0;

  return (
    <div className="border-line mt-5 border-t pt-4">
      {error && (
        <p role="alert" className="text-error-ink mb-3 text-sm">
          {error}
        </p>
      )}

      {spent ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-slate text-sm">
            That’s all three of your checks. Pro re-checks every week, on its own.
          </p>
          <ButtonLink href="/dashboard/plan" size="sm" variant="ghost">
            See what Pro includes
          </ButtonLink>
        </div>
      ) : ranToday ? (
        /* ⚠️ NOT A DISABLED BUTTON. A greyed-out control with a tooltip makes
           the reader hunt for why; a sentence says it. The allowance is still
           stated, because it is the thing they are deciding about. */
        <p className="text-slate text-sm">
          Checked today. You can run it again tomorrow —{' '}
          <span className="text-navy font-semibold">
            {runsLeft} {runsLeft === 1 ? 'check' : 'checks'}
          </span>{' '}
          left.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button size="sm" onClick={onRun} disabled={busy}>
            {busy ? 'Asking…' : 'Ask AI again'}
          </Button>
          <p className="text-slate text-sm">
            <span className="text-navy font-semibold">
              {runsLeft} {runsLeft === 1 ? 'check' : 'checks'}
            </span>{' '}
            left. Fix something first — that’s what makes the answer change.
          </p>
        </div>
      )}
    </div>
  );
}

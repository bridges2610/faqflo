'use client';

import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button';
import { EngineMark } from '@/components/ui/ai-marks';
import { checkedTodayUtc, runsLeftFor, TRACKING_PLANS } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { cellFor, groupByQuestion, insteadFor } from '@/lib/dashboard/questions';
import { ENGINE_TINT, Outcome } from './engine-outcome';
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

const PRO = TRACKING_PLANS.pro;

/*
  ⚠️ THE MARKS AND THEIR READING BOTH LIVE ELSEWHERE NOW, AND THAT WAS THE
  POINT. `CELL`, `ENGINE_TINT`, `cellFor` and `insteadFor` were all local to
  this file, holding the rules that a glyph is never the meaning and that a
  missing check is never a cross. They held because one call site remembered
  them. The pure functions are now in lib/dashboard/questions.ts beside
  groupByQuestion, and the marks are <Outcome/>, which cannot render a glyph
  without its sr-only word.

  The move was prompted by /dashboard/plan briefly rendering the same marks.
  That page has since become a plain pricing page and no longer does, so this is
  the only consumer again — which does not undo the reason. See the note in
  engine-outcome.tsx.
*/

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
      {/*
        ⚠️ TWO RENDERINGS OF ONE DATA SET, AND THE SPLIT IS AT sm.

        Five columns do not fit a phone. That was true when this was a table in
        a scroll box, and the scroll box was the right answer at the time: a
        page that scrolls sideways as a whole is worse than one panel that does.
        But "one panel that does" still means a roofer swiping a table to find
        out what Gemini said, on the screen that IS the free product.

        So below sm the same rows render as blocks — question, then its three
        engine outcomes, then who was named instead — and nothing scrolls in any
        direction. From sm up the table is unchanged, scroll box and all,
        because at that width the grid genuinely reads better than four stacked
        cards would.

        ⚠️ NO LOGIC LIVES IN EITHER BRANCH. Both call cellFor(), insteadFor(),
        CELL and ENGINES; only the markup differs. A second copy of the
        "null is a gap, not a cross" rule is exactly the drift that would make
        one of these two lie, and it is the one rule in this file that must not
        be restated anywhere.
      */}
      <ul className="divide-line divide-y sm:hidden">
        {groups.map((group) => {
          const instead = insteadFor(group);

          return (
            <li key={group.question} className="py-4 first:pt-0">
              <p className="text-navy text-sm font-medium">{group.question}</p>

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                {ENGINES.map((engine) => {
                  const outcome = cellFor(group, engine);

                  return (
                    <span key={engine} className="flex items-center gap-1.5">
                      <EngineMark engine={engine} className="h-4 w-4" />
                      <span className={`text-xs font-semibold ${ENGINE_TINT[engine]}`}>
                        {engine}
                      </span>
                      <Outcome engine={engine} outcome={outcome} />
                    </span>
                  );
                })}
              </div>

              <p className="text-slate mt-2.5 text-xs">
                Named instead:{' '}
                {instead ? (
                  /* break-all because a domain has no break opportunities and
                     this column is ~290px on a phone. */
                  <span className="text-slate font-mono break-all">{instead}</span>
                ) : (
                  <span className="text-slate/50">nobody in particular</span>
                )}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="-mx-1 hidden overflow-x-auto px-1 sm:block">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead>
            {/*
              ⚠️ SENTENCE CASE AND NO MONO, WHICH BREAKS THE HOUSE <th> STYLE ON
              PURPOSE. Every other table in the app heads its columns with the
              same 11px mono uppercase string MicroLabel uses, and that is right
              where the thing IS a data table. This one is the centre of a report
              a roofer reads once, and mono small-caps is most of what made it
              look like something to be decoded rather than read. The rest of the
              table keeps the house conventions.
            */}
            <tr className="border-line border-b">
              <th className="text-slate py-2 pr-4 text-xs font-semibold">Question</th>
              {ENGINES.map((engine) => (
                <th key={engine} className="px-2 py-2 text-center align-bottom">
                  <span className="flex flex-col items-center gap-1">
                    <EngineMark engine={engine} className="h-4 w-4" />
                    <span className={`text-xs font-semibold ${ENGINE_TINT[engine]}`}>{engine}</span>
                  </span>
                </th>
              ))}
              <th className="text-slate py-2 pl-4 text-xs font-semibold">Who it named instead</th>
            </tr>
          </thead>

          <tbody className="divide-line divide-y">
            {groups.map((group) => {
              const instead = insteadFor(group);

              return (
                <tr key={group.question}>
                  <td className="text-navy py-3 pr-4 align-middle text-sm">{group.question}</td>

                  {ENGINES.map((engine) => {
                    const outcome = cellFor(group, engine);

                    return (
                      <td key={engine} className="px-2 py-3 text-center align-middle">
                        <Outcome engine={engine} outcome={outcome} />
                      </td>
                    );
                  })}

                  <td className="py-3 pl-4 align-middle">
                    {instead ? (
                      <span className="text-slate font-mono text-xs break-all">{instead}</span>
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

  /* ⚠️ THE WHOLE CONTROL IS print:hidden, NOT JUST ITS BUTTON. Every branch
     here is about what you can do next — run another check, how many are left,
     what Pro would add — and none of it is true of a sheet of paper. The print
     block strips <button> on its own, which would have left the sentences
     beside a missing control and a rule with nothing under it. */
  return (
    <div className="border-line mt-5 border-t pt-4 print:hidden">
      {error && (
        <p role="alert" className="text-error-ink mb-3 text-sm">
          {error}
        </p>
      )}

      {spent ? (
        /*
          ⚠️ THE PITCH IS THE PROMPTS, NOT THE SCHEDULE. This said "Pro re-checks
          every week, on its own" — true, and the wrong offer in this spot. The
          reader has just run out of checks on three questions WE chose for
          them, and the thing they cannot do is ask their own. Selling a faster
          cadence answers a question they did not ask; selling their own prompts
          answers the one the table just raised.

          Numbers come from the plan so the copy cannot drift from what the
          account would actually get.
        */
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Three sentences rather than one. plain.ts sets the rule: past
              about fifteen words the grade level climbs on sentence length
              alone, whatever the vocabulary is doing. */}
          <p className="text-slate text-sm leading-relaxed">
            That’s all three of your checks. With Pro you write your own questions —{' '}
            <span className="text-navy font-semibold">{PRO.manualCap} of them</span>, alongside the{' '}
            {PRO.discoveredCap} we find. Every one is re-checked each week.
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

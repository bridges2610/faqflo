import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EngineMark } from '@/components/ui/ai-marks';
import { ScoreDial } from '@/components/ui/score-dial';
import { namedBand } from '@/lib/audit/score';
import { groupByQuestion, namedIn } from '@/lib/dashboard/questions';
import type { SiteTracking } from '@/lib/dashboard/types';
import { MicroLabel } from './micro-label';
import { StatRow } from './stat-row';

/**
 * Question rows shown before the link takes over. A Pro watch list is 25.
 *
 * ⚠️ THREE, TO MATCH THE ENGINE COLUMN BESIDE IT, AND THE REASON IS THE FOLD.
 * At five the two columns were ragged — three engines against five questions,
 * with dead space under the shorter one — and the panel grew tall enough to
 * push "Do these next" off a 1440x900 screen entirely. The worklist is the part
 * of this page somebody acts on; leading with visibility should not mean burying
 * it. Three balances the columns and keeps the worklist reachable without
 * scrolling.
 */
const QUESTION_ROWS = 3;

/*
  Whether AI names this business — the reason the subscription exists, given the
  room that implies.

  This was a 320px card in the right rail. Everything about the product points at
  it: the audit tells you whether an assistant CAN read your site, and this tells
  you whether one actually names you, which is the outcome an owner is buying.

  ⚠️ ONE NUMBER, THREE RENDERINGS, AND THAT IS THE WHOLE DESIGN. The ring, the
  band word and the sentence are all the same figure — questions where an engine
  named you, over questions we asked. A ring showing one statistic above a
  sentence quoting another is how a reader starts checking your arithmetic
  instead of reading your point.

  ⚠️ NAMED MEANS CITED **OR** MENTIONED, throughout. Results' By-engine card
  uses the same numerator. The rail card this replaces deliberately used `cited`
  alone — it had an aggregate that needed to sum to its rows — and that
  constraint went with it. Mixing the two inside one panel would be the worse
  of both.

  ⚠️ THE TWO LISTS DO NOT SUM TO THE HEADLINE, AND MUST NOT LOOK AS THOUGH THEY
  SHOULD. They are two cuts of the same checks: one question named by two
  engines is one question and two checks. That is why every row prints its own
  `N of M` rather than a bare percentage — the same reasoning the filter chips
  on Results give for carrying both units.

  ⚠️ THE GATE IS `checked > 0`, NOT `tracking == null`. On Home the provider
  falls back to emptyTracking() whenever the database read has not landed — all
  zeros — so a null check would render an empty ring and "0 of 0" both in the
  in-flight window and forever on an account nobody has checked yet.
*/
export function VisibilityPanel({ tracking }: { tracking: SiteTracking | null }) {
  const byEngine = tracking?.byEngine ?? [];

  // Nothing has answered yet. Not "nobody names you" — we have not looked.
  if (!byEngine.some((e) => e.checked > 0)) return null;

  /*
    Questions, not checks, as the headline unit.

    A check is our implementation showing through — an owner has questions, and
    "you show up for two of your five" is a sentence they can act on. `latest`
    is deduped to one row per question per engine, so grouping it gives exactly
    the questions we asked.
  */
  const groups = groupByQuestion(tracking?.latest ?? []);
  const namedGroups = groups.filter((g) => namedIn(g) > 0);
  const asked = groups.length;
  const named = namedGroups.length;
  const skipped = asked - named;

  const rate = asked > 0 ? (named / asked) * 100 : 0;
  const band = namedBand(rate);

  /*
    Worst first.

    The rows a customer can do something about are the ones where nobody named
    them, and a list sorted best-first buries those under the wins. Ties keep
    their original order, which is newest-first from `latest`.
  */
  const ranked = [...groups].sort((a, b) => namedIn(a) / a.checks.length - namedIn(b) / b.checks.length);

  return (
    <Card className="mb-5 p-5 sm:p-7">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <ScoreDial
          score={rate}
          size="sm"
          figure={`${Math.round(rate)}%`}
          /* One word. "of questions" is the truer phrase but it is wider than
             the 96px dial and rides over the stroke; the sentence beside the
             ring names the denominator in full anyway. */
          caption="questions"
          /* Legal here and only here: the band's word is the Badge directly
             beside this, and the counts are in the sentence under it. See the
             header of score-dial.tsx. */
          stroke={band.dial}
        />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:justify-start">
            <h2 className="text-navy text-[1.375rem] font-extrabold tracking-tight">
              {band.headline}
            </h2>
            <Badge tone={band.tone}>{band.label}</Badge>
          </div>

          {/* The same figures the ring is drawn from, in words. */}
          <p className="text-slate mt-1.5 text-[0.9375rem] leading-relaxed">
            AI named you for{' '}
            <span className="text-navy font-semibold tabular-nums">
              {named} of your {asked}
            </span>{' '}
            {asked === 1 ? 'question' : 'questions'}.
            {skipped > 0 && (
              <>
                {' '}
                It skipped you on the other{' '}
                <span className="text-navy font-semibold tabular-nums">{skipped}</span>.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <MicroLabel>Where you show up</MicroLabel>
          <div className="divide-line mt-1 divide-y">
            {byEngine.map((e) => (
              <StatRow
                key={e.engine}
                label={e.engine}
                icon={<EngineMark engine={e.engine} className="h-4 w-4 shrink-0" />}
                value={e.cited + e.mentioned}
                /* ⚠️ A gap, not a zero — an engine can 429 out of a run on its
                   own. total={null} is what keeps the track off the screen. */
                total={e.checked > 0 ? e.checked : null}
                note="no answers stored"
                tone={e.cited + e.mentioned > 0 ? 'primary' : 'line'}
              />
            ))}
          </div>
        </div>

        <div>
          <MicroLabel>What you show up for</MicroLabel>
          <div className="divide-line mt-1 divide-y">
            {ranked.slice(0, QUESTION_ROWS).map((g) => (
              <StatRow
                key={g.question}
                label={g.question}
                value={namedIn(g)}
                /* That group's OWN length, never ENGINES.length — a question
                   one engine failed on was asked of fewer than three. */
                total={g.checks.length}
                tone={namedIn(g) > 0 ? 'primary' : 'line'}
              />
            ))}
          </div>
        </div>
      </div>

      <Link
        href="/dashboard/tracking"
        className="text-primary hover:text-primary-hover mt-5 inline-block text-sm font-semibold"
      >
        {ranked.length > QUESTION_ROWS
          ? `See all ${ranked.length} questions →`
          : 'See all results →'}
      </Link>
    </Card>
  );
}

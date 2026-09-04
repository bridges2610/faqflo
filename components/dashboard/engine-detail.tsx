import { EngineMark } from '@/components/ui/ai-marks';
import { checksByEngine, type QuestionGroup } from '@/lib/dashboard/questions';
import { MAX_EXCERPT_CHARS, type CitationCheck, type Engine } from '@/lib/dashboard/types';
import { AnswerText } from './answer-text';

/*
  What the engines actually said about one question — the evidence itself.

  ⚠️ THIS IS ONE COPY ON PURPOSE, AND IT HAS TO STAY ONE COPY. Results renders
  the same question two ways: a matrix at sm and up, a list of expandable rows
  on a phone. Both open to this block. prompt-ranking.tsx states the rule its own
  two branches follow — "NO LOGIC LIVES IN EITHER BRANCH" — and the reason is
  sharper here than there: the null-is-a-gap-not-a-no rule below is the sort of
  thing a second copy quietly stops honouring, and then one of the two layouts
  claims a measurement that was never taken.

  It lived inside tracking-workspace.tsx's QuestionRow until the matrix needed
  it. It is a separate module rather than an export from that file because
  tracking-workspace imports the matrix, and the matrix importing back would be
  a cycle.
*/

/**
 * A source URL as it should be read: host and path, no query string.
 *
 * Keeps the host — a source list names other people's sites, so the domain is
 * the most important part of the line. (tracking-workspace.tsx's prettyUrl drops
 * the host for the opposite reason: there the host is the card's own subject.)
 */
function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, '');
    return `${parsed.hostname.replace(/^www\./, '')}${path}`;
  } catch {
    return url;
  }
}

/**
 * Does this excerpt end mid-thought?
 *
 * A cheap heuristic, and deliberately so: it decides whether to print a caveat,
 * never what the data means. Answers stored before the word-boundary cut landed
 * simply stop at 600 characters, and there is no flag on the row to consult.
 */
function looksTruncated(excerpt: string): boolean {
  const end = excerpt.trimEnd().slice(-1);
  return excerpt.length >= MAX_EXCERPT_CHARS - 1 && !'.!?"”)'.includes(end);
}

/**
 * The outcome words and their tints, shared by the pill, the chip and the
 * matrix cell.
 *
 * ⚠️ THE WORD IS NOT DECORATION. Colour alone must never carry this: `linked`
 * and `not named` are separated by a tint some readers cannot distinguish, and
 * it is the figure the customer acts on. The tint is a second encoding of a label
 * that is already readable — the same rule components/dashboard/meter.tsx
 * states for its bars.
 *
 * ⚠️ FOUR STATES, AND `linked` vs `named` MUST NOT BE COLLAPSED. The free
 * report's cellFor() folds them both into one mark because that page is selling
 * a diagnosis, not explaining one. Results does the opposite: its closing
 * paragraph tells you a named-but-not-linked answer means the text is not on a
 * page the engine can point at, which is advice you cannot give if the two look
 * the same.
 */
export const OUTCOME_STYLE: Record<CitationCheck['outcome'], { label: string; className: string }> =
  {
    cited: { label: 'linked', className: 'bg-success/12 text-success-ink' },
    mentioned: { label: 'named', className: 'bg-accent-soft text-navy' },
    absent: { label: 'not named', className: 'text-slate border-line border bg-surface' },
  };

/** Not an outcome — the absence of one. Kept visually quieter than any verdict. */
export const NOT_CHECKED = {
  label: 'not asked',
  className: 'text-slate/80 border-line border bg-surface',
};

/*
  ⚠️ THE WORDS ARE FOR A ROOFER, NOT A MARKETER, AND THAT IS WHY THEY CHANGED.
  These read `cited` / `named` / `absent` / `not checked`. Three of the four are
  industry terms: "cited" is the one that matters most and is the one a business
  owner is least likely to know, and "absent" describes the row rather than the
  business. What a customer actually wants to know is whether the AI sent people
  to their website, so the words now say that —

    linked     the AI named you AND pointed at your site
    named      it said your name but linked somewhere else
    not named  it answered, and you were not in the answer
    not asked  we have no result, usually an engine failing mid-run

  ⚠️ `not named` AND `not asked` ARE STILL DIFFERENT THINGS and the near-rhyme
  is not an invitation to merge them. One is a measurement, the other is the
  absence of one — questions.ts states the rule on cellFor.
*/

/**
 * One engine's verdict on one question, at a glance.
 *
 * ⚠️ ITS OWN COMPONENT RATHER THAN A SMALLER <Badge>. Badge hardcodes
 * `px-3 py-1 text-[0.8125rem]` and emits its tone classes BEFORE `className`,
 * so passing `px-2 text-xs` would not reliably win — conflicting Tailwind
 * utilities resolve by their order in the generated stylesheet, not by their
 * order in the class attribute. A pill that is smaller only sometimes is worse
 * than one that owns its own size, and shrinking Badge would shrink it on every
 * other screen too.
 *
 * Three of these sit under every question, so they are deliberately quiet: the
 * question is what you read, these are what you scan.
 */
export function EnginePill({ engine, check }: { engine: Engine; check: CitationCheck | null }) {
  const { label, className } = check ? OUTCOME_STYLE[check.outcome] : NOT_CHECKED;

  return (
    <span
      className={`rounded-pill inline-flex items-center gap-1 px-2 py-0.5 text-[0.6875rem] leading-none font-medium ${className}`}
    >
      <span className="font-semibold">{engine}</span>
      {label}
    </span>
  );
}

/**
 * The same verdict, where the engine is already named by something else — an
 * open row's heading, or a matrix column.
 *
 * ⚠️ IT CARRIES NO ENGINE NAME, SO ITS CONTEXT MUST. In the matrix that context
 * is a real `<th scope="col">`, which is what associates the cell with its
 * column for a screen reader. Drop the table semantics for a grid of divs and
 * this chip becomes an unlabelled word.
 */
export function OutcomeChip({
  check,
  /**
   * Size overrides for a denser context. The matrix passes its own so the chip
   * stays in proportion to a 13px prompt.
   *
   * ⚠️ SIZE ONLY — NEVER COLOUR. The tint is half of an encoding whose other
   * half is the word, and OUTCOME_STYLE is where the pairing is decided. A call
   * site that could restyle the fill could quietly make `not named` look like
   * `linked` on one screen and not another.
   */
  size = 'px-2 py-0.5 text-[0.6875rem]',
}: {
  check: CitationCheck | null;
  size?: string;
}) {
  const { label, className } = check ? OUTCOME_STYLE[check.outcome] : NOT_CHECKED;

  return (
    <span
      /* whitespace-nowrap because "not named" and "not asked" are each one
         label, not two words. In the matrix's narrowest column they were
         breaking across two lines, which reads as two verdicts in one cell. */
      className={`rounded-pill inline-flex items-center leading-none font-medium whitespace-nowrap ${size} ${className}`}
    >
      {label}
    </span>
  );
}

/**
 * Every engine's answer to one question: what it said, where it looked, and who
 * it named instead.
 *
 * ⚠️ ONE BLOCK PER ENGINE, NEVER A SUMMARY. groupByQuestion's comment sets the
 * rule: each check carries its own answer, its own source list and its own
 * citedInstead, and flattening them throws two of the three away. The comparison
 * is the reason three engines get asked at all.
 */
export function EngineDetailList({ group }: { group: QuestionGroup }) {
  return (
    <div className="divide-line divide-y">
      {checksByEngine(group).map(({ engine, check }) => (
        <div key={engine} className="py-4 first:pt-0 last:pb-0">
          {/* The engine, and what it did — one line, and the only place the
              engine is named. The chip carries the verdict alone because this
              heading has already said whose verdict it is. */}
          <p className="text-navy flex items-center gap-2 text-sm font-semibold">
            <EngineMark engine={engine} className="h-4 w-4 shrink-0" />
            {engine}
            <OutcomeChip check={check} />
          </p>

          {!check ? (
            /* ⚠️ A gap, not a zero. An engine can fail on its own — a 429
               during the run — and saying "not named" here would claim a
               measurement we never took. */
            <p className="text-slate mt-2 text-sm">
              We don’t have an answer from {engine} for this one yet.
            </p>
          ) : (
            <>
              {/* What it said. The largest, plainest thing in the block,
                  because it is the answer to the only question this panel
                  really gets asked: why wasn’t I in there? */}
              {check.excerpt ? (
                <div className="mt-2.5">
                  <AnswerText text={check.excerpt} />
                  {looksTruncated(check.excerpt) && (
                    <p className="text-slate/70 mt-2 text-xs">
                      This is the first {MAX_EXCERPT_CHARS} characters of the answer.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-slate mt-2 text-sm">
                  We didn’t keep a copy of what {engine} said this time.
                </p>
              )}

              {/* Who it pointed at instead, in words rather than beside a
                  count. It is the second thing a customer looks for and it was
                  previously a fragment on the end of a row of metadata. */}
              {check.outcome !== 'cited' && check.citedInstead && (
                <p className="text-slate mt-2.5 text-sm">
                  It sent people to{' '}
                  {/* Not mono. This is a name being read in a sentence, not a
                      URL anyone will copy — the source list below keeps mono
                      for exactly that reason. */}
                  <span className="text-navy font-semibold">{check.citedInstead}</span>{' '}
                  instead of you.
                </p>
              )}

              {check.sources.length > 0 && <SourceList sources={check.sources} />}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * How many source links one answer is worth showing.
 *
 * ⚠️ THE REST ARE COUNTED, NOT DROPPED SILENTLY. An engine can return a dozen
 * sources and a wall of them buries the two or three that matter, but a list
 * that quietly stops at seven reads as "these are all of them" — which would be
 * this file inventing a smaller number than we measured. The line below says
 * how many more there were.
 */
const SOURCE_CAP = 7;

/** Where one answer got its information, most relevant first. */
function SourceList({ sources }: { sources: string[] }) {
  const shown = sources.slice(0, SOURCE_CAP);
  const hidden = sources.length - shown.length;

  return (
    <div className="mt-3">
      <p className="text-slate text-xs font-semibold">
        {sources.length === 1 ? 'The website it used' : 'The websites it used'}
      </p>
      <ul className="mt-1.5 space-y-1">
        {shown.map((url) => (
          <li key={url} className="min-w-0 truncate">
            {/* Display is cleaned; the href is the stored URL, untouched.
                `?utm_source=openai` is the engine tagging its own referral and
                makes two links to one page look like two — but the source list
                is evidence, so what we LINK to stays exactly what was
                recorded. */}
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-slate hover:text-primary font-mono text-[0.8125rem] underline-offset-2 hover:underline"
            >
              {displayUrl(url)}
            </a>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="text-slate/70 mt-1.5 text-xs">
          and {hidden} more {hidden === 1 ? 'website' : 'websites'}
        </p>
      )}
    </div>
  );
}

/**
 * What the four words in a matrix cell mean, said once.
 *
 * ⚠️ BUILT FROM OUTCOME_STYLE AND NOT_CHECKED, NEVER FROM A SECOND LIST. The
 * word and its tint are one decision — see the note on OUTCOME_STYLE — and a
 * legend that hardcoded either would be free to drift from the cells it
 * explains, which is the one failure a legend must not have.
 *
 * It replaces two paragraphs: a 22-word blurb under the heading and a 43-word
 * note at the foot of the card. Four chips beside four glosses says the same
 * thing without a sentence in it.
 */
export const OUTCOME_LEGEND: { key: string; label: string; className: string; gloss: string }[] = [
  { key: 'cited', ...OUTCOME_STYLE.cited, gloss: 'named you and linked to your site' },
  { key: 'mentioned', ...OUTCOME_STYLE.mentioned, gloss: 'said your name, linked elsewhere' },
  { key: 'absent', ...OUTCOME_STYLE.absent, gloss: 'you were not in the answer' },
  { key: 'notAsked', ...NOT_CHECKED, gloss: 'no answer came back that time' },
];

/** The legend as a row — one line on a laptop, a stack on a phone. */
export function OutcomeLegend({ className = '' }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-2 ${className}`}>
      {OUTCOME_LEGEND.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span
            className={`rounded-pill inline-flex items-center px-1.5 py-0.5 text-[0.625rem] leading-none font-medium whitespace-nowrap ${item.className}`}
          >
            {item.label}
          </span>
          <span className="text-slate text-xs">{item.gloss}</span>
        </li>
      ))}
    </ul>
  );
}

/*
  Every answer we checked, split three ways.

  ⚠️ THE THREE SEGMENTS ARE THE WHOLE, AND THAT IS WHY THIS IS ONE BAR.
  CitationCheck['outcome'] is exactly 'cited' | 'mentioned' | 'absent', so the
  three counts sum to every check we hold — nothing else can happen to an
  answer. Results used to print those as four separate figures, two of which
  repeated the score card above them and one of which ("left you out") was just
  the total minus the others. Four boxes for one number split three ways.

  ⚠️ SOLID FILLS, DERIVED FROM OUTCOME_STYLE'S DECISION RATHER THAN INVENTED
  BESIDE IT. OUTCOME_STYLE holds chip styling — a 12% tint behind coloured
  text — which is unreadable as a bar. So the fills live here, keyed off the
  same outcome names, in the same order, and meaning the same things: a reader
  who learns "green is linked" from a matrix cell must not meet a different
  green up here.
*/
const OUTCOME_FILL: Record<CitationCheck['outcome'], string> = {
  cited: 'bg-success',
  mentioned: 'bg-accent',
  /* Not bg-line. The segments always cover the whole track, so `absent` never
     needs to blend into it — and at hairline weight the legend's swatch was
     invisible against white. A neutral grey, deliberately not an alarm colour:
     "left you out" is the majority state for a site that has just started, and
     painting most of the bar red would be a verdict rather than a count. */
  absent: 'bg-slate/30',
};

/*
  The same three outcomes as a phrase, for a legend that has room for one.

  ⚠️ KEYED ON THE OUTCOME, NOT ON OUTCOME_STYLE'S LABEL. The first draft read
  `label === 'linked' ? … : label === 'named' ? … : 'left you out'`, which works
  and rots: rename a chip label and every row silently falls through to the last
  branch, quietly relabelling "linked to you" as "left you out". A map over the
  same union the fills use cannot do that — TypeScript requires all three keys.

  A cell says `linked` because a table cell has no room for more. A legend under
  a bar does, and "linked to you" is the sentence a business owner reads.
*/
const OUTCOME_PHRASE: Record<CitationCheck['outcome'], string> = {
  cited: 'linked to you',
  mentioned: 'named you, no link',
  absent: 'left you out',
};

/** One segment's share, and the words that carry it when the colour cannot. */
export type OutcomeSplit = { outcome: CitationCheck['outcome']; count: number; note?: string };

/**
 * The split as a bar, with its counts underneath.
 *
 * ⚠️ NO MINIMUM SEGMENT WIDTH, DELIBERATELY, AND meter.tsx DOES THE OPPOSITE
 * ON PURPOSE. Meter clamps to `Math.max(2, pct)` so a 0.5% reading still shows
 * as something — right for a single bar, where the alternative is an empty
 * track. Here the widths ARE the split: padding a thin segment to 2% makes the
 * three stop summing to the whole, and a bar that does not add up is worse than
 * a segment too thin to see. A zero-count segment renders nothing at all.
 *
 * ⚠️ aria-hidden, FOR THE REASON Meter IS. Each count is printed in words
 * directly below, so the bar is the second encoding rather than the only one.
 */
export function OutcomeBar({
  splits,
  total,
  className = '',
}: {
  splits: OutcomeSplit[];
  total: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="bg-cloud flex h-2.5 w-full overflow-hidden rounded-full" aria-hidden="true">
        {total > 0 &&
          splits
            .filter((s) => s.count > 0)
            .map((s) => (
              <div
                key={s.outcome}
                className={OUTCOME_FILL[s.outcome]}
                style={{ width: `${(s.count / total) * 100}%` }}
              />
            ))}
      </div>

      {/*
        ⚠️ A GRID, BECAUSE A WRAPPING ROW LET THE DATA PICK THE LAYOUT.

        These were `flex flex-wrap` with the count and the phrase inline. The
        first cell carries a note — "+200% since the last run" — long enough to
        push the other two onto their own lines, so the three counts rendered as
        a vertical list whose reading order changed with the numbers. Three
        fixed columns cannot do that.

        ⚠️ grid-cols-3 AT EVERY WIDTH, INCLUDING A PHONE. The counts are two or
        three characters and the phrases are three words; stacking them below sm
        would rebuild the exact vertical list this replaced.
      */}
      <ul className="mt-4 grid grid-cols-3 gap-x-3">
        {splits.map((s) => {
          /* ⚠️ MUTED, NEVER DROPPED. The three cells are the whole — the bar
             above says so — and removing one would reflow the grid and quietly
             break that. A zero is a real reading; it just is not one to lead
             with. */
          const empty = s.count === 0;

          return (
            <li key={s.outcome} className={empty ? 'opacity-45' : ''}>
              <p className="flex items-center gap-1.5">
                {/* Decoration: it ties the number to its slice of the bar. The
                    phrase below is what carries the meaning — the same pairing
                    OUTCOME_STYLE requires of every chip. */}
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${OUTCOME_FILL[s.outcome]}`}
                />
                <span className="text-navy text-2xl leading-none font-semibold tabular-nums">
                  {s.count}
                </span>
              </p>
              <p className="text-slate mt-1.5 text-xs leading-snug">
                {OUTCOME_PHRASE[s.outcome]}
              </p>
              {s.note && <p className="text-slate/80 mt-1 text-xs leading-snug">{s.note}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

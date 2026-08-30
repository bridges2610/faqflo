'use client';

import { useState, type ReactNode } from 'react';
import { EngineMark } from '@/components/ui/ai-marks';
import { timeAgo } from '@/lib/dashboard/format';
import { checksByEngine, insteadFor, type QuestionGroup } from '@/lib/dashboard/questions';
import { ENGINES } from '@/lib/dashboard/types';
import { ENGINE_TINT } from './engine-outcome';
import { EngineDetailList, OutcomeChip } from './engine-detail';
import { ChevronIcon } from './nav-icons';

/*
  Every prompt against every engine, as a grid.

  ⚠️ THE GRID IS THE FINDING. groupByQuestion's comment says why three engines
  get asked at all: "being cited by Perplexity and absent from ChatGPT on the
  same question is one finding". A row of pills under a question makes the
  reader assemble that finding themselves, once per question. A fixed column per
  engine states it — one glance across a row says "nobody names me", one glance
  down a column says "Perplexity never does".

  ⚠️ A REAL <table>, AND THE SEMANTICS ARE THE ACCESSIBILITY. `<th scope="col">`
  on each engine and `<th scope="row">` on each prompt are what tell a screen
  reader which prompt and which engine a cell belongs to. That is the whole
  reason the outcome chip can be a bare word here — engine-detail.tsx's note on
  OutcomeChip states the dependency. Rebuild this as a grid of divs and every
  cell becomes an unlabelled word.

  ⚠️ IT IS sm AND UP ONLY. Four columns do not fit a phone. Results keeps its
  existing list of expandable rows below sm — see the note at the call site.
  Both layouts open to the same <EngineDetailList/>, so neither can drift into
  claiming something the other does not.

  ⚠️ CELLS SAY WHAT HAPPENED, NOT HOW OFTEN. The reference this was built from
  shows "0/1" and "1/1" counts. We hold exactly one check per (question, engine)
  — `latest` is deduped to that, see lib/dashboard/store.ts — so a "1/1" here
  would be a denominator we invented. The outcome word is the measurement we
  actually took.
*/

/**
 * Rows for one page of questions.
 *
 * `action` is a render prop rather than a node so each row gets its own — the
 * Draft button is per-question and closes that question's gap.
 */
export function PromptMatrix({
  groups,
  action,
}: {
  groups: QuestionGroup[];
  action?: (group: QuestionGroup) => ReactNode;
}) {
  /*
    Which rows are open, by question text.

    Question text is the key everywhere else on this page — groupByQuestion
    groups on it and Results dedupes on it — so it is already unique per group.
    An index would break the moment a filter reorders the list underneath an
    open row.
  */
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const toggle = (question: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(question)) next.add(question);
      return next;
    });

  return (
    /*
      The scroll box is this div, not the page.

      Card carries no overflow-hidden, so a wide table inside one would push the
      whole dashboard sideways. min-w-144 is what forces the columns to keep
      their width and this wrapper to scroll instead — the same shape
      prompt-ranking.tsx uses for the free report's narrower version of this
      table. The -mx-1/px-1 pair keeps the focus ring on a row button from being
      clipped by the scroll edge.

      ⚠️ 144 (576px) IS MEASURED AGAINST THE NARROWEST COLUMN THIS CARD GETS,
      NOT PICKED FOR LOOKS. Results puts this card in the left cell of a
      `lg:grid-cols-[minmax(0,1fr)_20rem]` beside a 20rem rail, so on a 1280px
      laptop the card is 632px wide and 576px inside its p-7. At min-w-160 the
      table was 64px too wide there and scrolled on the most common laptop size.
      Widen this and re-measure at 1280 before assuming it still fits.
    */
    <div className="-mx-1 overflow-x-auto px-1">
      {/*
        ⚠️ table-fixed, AND THE COLUMN WIDTHS ARE THE POINT OF IT.

        With `auto`, the browser sizes each column to its content: the AI
        columns hold a short pill and collapse to about 123px each, while the
        question column soaks up every spare pixel — measured at 628px of a
        998px table, 63%. That is backwards for a comparison grid. The eye is
        meant to travel ACROSS the three AI columns, and they were the three
        narrowest things on the row.

        Fixed percentages give the comparison the room and leave the question
        enough to read on two lines. min-w-144 still governs the floor — see
        the note below on where 144 came from — so this changes how the spare
        width is shared, not when the table starts scrolling.
      */}
      <table className="w-full min-w-144 table-fixed border-collapse text-left">
        <thead>
          {/*
            ⚠️ SENTENCE CASE AND NO MONO, WHICH BREAKS THE HOUSE <th> STYLE ON
            PURPOSE — the same exception prompt-ranking.tsx takes, for the same
            reason. Every other table in the app heads its columns with
            MicroLabel's 11px mono uppercase, which is right where the thing IS a
            data table. This one is the evidence a customer reads to find out
            whether the product worked, and mono small-caps is most of what made
            it look like something to be decoded rather than read.
          */}
          <tr className="border-line border-b">
            <th scope="col" className="text-slate w-[44%] py-2 pr-4 text-xs font-semibold">
              Question a customer asks
            </th>
            {ENGINES.map((engine) => (
              <th key={engine} scope="col" className="w-[18.6%] px-2 py-2 text-center align-bottom">
                <span className="flex flex-col items-center gap-1">
                  <EngineMark engine={engine} className="h-4 w-4" />
                  <span className={`text-xs font-semibold ${ENGINE_TINT[engine]}`}>{engine}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-line divide-y">
          {groups.map((group) => (
            <MatrixRow
              key={group.question}
              group={group}
              open={open.has(group.question)}
              onToggle={() => toggle(group.question)}
              action={action?.(group)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One question: its row of outcomes, and the evidence underneath when open.
 *
 * ⚠️ TWO <tr>s, NOT A <details>. A <details> cannot wrap table rows without
 * breaking the table's own structure, and losing the structure loses the
 * header association the whole layout depends on. React state plus
 * aria-expanded/aria-controls is the standards path, and it is what lets the
 * detail row span every column.
 */
function MatrixRow({
  group,
  open,
  onToggle,
  action,
}: {
  group: QuestionGroup;
  open: boolean;
  onToggle: () => void;
  action?: ReactNode;
}) {
  const instead = insteadFor(group);
  /* Encoded because a question is free text and this lands in an id and an
     aria-controls reference — a quote or a space would break the pairing. */
  const detailId = `matrix-detail-${encodeURIComponent(group.question)}`;

  return (
    <>
      <tr>
        <th scope="row" className="py-3 pr-4 text-left align-middle font-normal">
          {/*
            ⚠️ THE WHOLE HEADING IS THE BUTTON, NOT A CHEVRON BESIDE IT. A
            14px triangle is a hard target on a laptop trackpad and an
            unlabelled one for a screen reader; making the question itself the
            control gives it a name and a hit area for free. It is a <button>
            rather than a click handler on the <th> so it is focusable and
            responds to Enter and Space without any key handling of ours.
          */}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={detailId}
            className="group flex w-full items-start gap-2 text-left"
          >
            <ChevronIcon
              className={`text-slate group-hover:text-navy mt-0.5 h-4 w-4 shrink-0 transition-transform duration-200 ${
                open ? 'rotate-90' : ''
              }`}
            />
            <span className="min-w-0">
              {/* 13px, down from the list's 15px. A row here is one line of a
                  grid you scan down, not a paragraph you read — and the smaller
                  the prompt sets, the more of them fit above the fold, which is
                  the whole advantage a matrix has over the list. */}
              <span className="text-navy block text-[0.8125rem] leading-snug">
                {group.question}
              </span>
              <span className="text-slate mt-0.5 block text-[0.6875rem]">
                {timeAgo(group.checkedAt)}
                {instead && (
                  <>
                    {' '}
                    · AI sent people to <span className="text-navy font-medium">{instead}</span>
                  </>
                )}
              </span>
            </span>
          </button>
        </th>

        {checksByEngine(group).map(({ engine, check }) => (
          /* ⚠️ A MISSING CHECK IS AN OutcomeChip WITH null, NOT AN EMPTY CELL
             AND NOT "absent". An engine can 429 mid-run, and a blank here would
             read as "we asked and got nothing" — see questions.ts on cellFor.
             The chip renders "not checked" for null on its own. */
          <td key={engine} className="px-2 py-2.5 text-center align-middle">
            {/* Back up to 11px from 10. The 10px was chosen to survive a
                column the browser had squeezed to 123px; table-fixed above
                gives each AI column ~18.6% instead, and the word IS the
                outcome here — no other text in the cell carries it — so the
                right move with the extra room is to spend it on legibility. */}
            <OutcomeChip check={check} size="px-2.5 py-1 text-[0.6875rem]" />
          </td>
        ))}
      </tr>

      {open && (
        <tr id={detailId}>
          {/* Spans the prompt column plus every engine column, so the evidence
              sits under the whole row rather than under one cell. */}
          <td colSpan={ENGINES.length + 1} className="pb-4">
            <div className="bg-cloud rounded-xl p-4">
              <EngineDetailList group={group} />
              {action && <div className="mt-3">{action}</div>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

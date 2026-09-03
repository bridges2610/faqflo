'use client';

import type { ArticleStreamPhase } from '@/lib/article';

/*
  What the model is doing, while it does it.

  ⚠️ EVERYTHING ON SCREEN HERE IS REAL OUTPUT OR A REAL BOUNDARY. There is no
  percentage, no timer and no bar that creeps — components/dashboard/audit-notice.tsx
  states the rule this follows: a bar moving between events nobody measured is
  "a clock pretending to be a measurement". `thinking` lasts until the first
  token arrives, `writing` until the last one does, and the headings underneath
  are the article's own headings, sent the moment each one finishes.

  ⚠️ THAT IS ALSO WHY THIS BEATS A SPINNER RATHER THAN JUST DECORATING ONE. A
  thousand words takes the better part of a minute. What makes that bearable is
  not motion, it is seeing the thing being made — the title lands after a few
  seconds and a heading every few after that, so the wait has evidence in it.

  ⚠️ ARTICLES ONLY. This once had a `what` prop and a branch for FAQ-only runs,
  which showed one phase and nothing else because /api/dashboard/generate does
  not stream. Nothing generates a FAQ through here any more — they are written
  from a finished article, on the article's page — so the branch went with the
  feature rather than being left as a mode nobody reaches.
*/

const PHASES: { key: ArticleStreamPhase; label: string }[] = [
  { key: 'thinking', label: 'Reading your site' },
  { key: 'writing', label: 'Writing it' },
  { key: 'saving', label: 'Saving it' },
];

export function WritingProgress({
  phase,
  title,
  headings,
}: {
  phase: ArticleStreamPhase;
  /** The article's title, once it has actually been written. */
  title: string | null;
  /** Headings written so far, in order. */
  headings: string[];
}) {
  const at = Math.max(
    0,
    PHASES.findIndex((p) => p.key === phase),
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-primary/30 bg-primary-soft/50 rounded-xl border p-4"
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="bg-primary/15 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        >
          <span className="bg-primary h-2 w-2 animate-pulse rounded-full" />
        </span>
        <p className="text-navy text-sm font-semibold">Writing your article</p>
      </div>

      <ol className="mt-3 space-y-1.5">
        {PHASES.map((p, i) => {
          const done = i < at;
          const current = i === at;

          return (
            <li key={p.key} className="flex items-center gap-2.5">
              {/* ⚠️ THE MARK IS NEVER THE MEANING — status-icon.tsx's rule. A
                  filled circle and a hollow one are the same smudge at this
                  size, so the state is a word for a screen reader too. */}
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  done ? 'bg-success' : current ? 'bg-primary animate-pulse' : 'bg-line'
                }`}
              />
              <span
                className={`text-xs leading-snug ${
                  current ? 'text-navy font-medium' : done ? 'text-slate' : 'text-slate/60'
                }`}
              >
                {p.label}
                <span className="sr-only">
                  {done ? ' — done' : current ? ' — in progress' : ' — not started'}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {/* The article as it arrives. Nothing here is a placeholder: a heading is
          on screen because it has been written. */}
      {(title || headings.length > 0) && (
        <div className="border-primary/20 mt-3 border-t pt-3">
          {title && <p className="text-navy text-sm font-semibold">{title}</p>}

          {headings.length > 0 && (
            <ul className="mt-2 space-y-1">
              {headings.map((h, i) => (
                <li key={`${i}-${h}`} className="text-slate flex items-start gap-2 text-xs">
                  <span aria-hidden="true" className="text-success mt-0.5">
                    ✓
                  </span>
                  <span>
                    <span className="sr-only">Section written: </span>
                    {h}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

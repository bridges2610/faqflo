import type { Engine } from '@/lib/dashboard/types';
import type { EngineOutcome } from '@/lib/dashboard/questions';

/*
  What one engine did about one question, as a mark.

  ⚠️ THE GLYPH IS NOT THE MEANING, THE `sr-only` WORD IS.

  A tick and a cross at 14px are the same smudge to a colourblind reader and
  identical in a greyscale print. Where these are used there is often no other
  text carrying the outcome — a table cell holds the mark and nothing else — so
  every mark states its word.

  ⚠️ AND `null` MUST NEVER RENDER AS A CROSS. An engine can fail on its own — a
  429 mid-run — and that question simply has no row for it. A cross would claim
  we asked and were not named; we did not ask. Results states the same rule for
  its NOT_CHECKED pill, and lib/dashboard/questions.ts states it for cellFor,
  which is what produces the null.

  ⚠️ IT IS A COMPONENT SO THE PAIRING CANNOT BE FORGOTTEN. This was a bare
  record in prompt-ranking.tsx, and the rule above held only because that one
  call site remembered to render `word` next to `glyph`. The two ship together
  now: there is no way to render the glyph from outside this file.

  ⚠️ AND IT HAS ONE CONSUMER AGAIN, WHICH IS NOT AN ARGUMENT TO INLINE IT BACK.
  The split was made when /dashboard/plan briefly rendered these marks too; that
  page has since become a plain pricing page and dropped them. The reason to
  keep this separate was never the consumer count — it is that a rule enforced
  by a component holds, and a rule enforced by whoever edits the JSX next does
  not. Folding it back into prompt-ranking.tsx would restore exactly the shape
  that made a second copy possible in the first place.
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
 * Used on the marks' backing only — the outcome itself is never coloured by
 * engine.
 */
export const ENGINE_TINT: Record<Engine, string> = {
  ChatGPT: 'text-primary',
  Perplexity: 'text-teal-ink',
  Gemini: 'text-violet',
};

/**
 * One engine's result. `engine` is named in the spoken form so a screen reader
 * hears "Gemini did not name you" rather than a bare verdict — the marks appear
 * in grids where the column header is far from the cell.
 */
export function Outcome({
  engine,
  outcome,
  className = '',
}: {
  engine: Engine;
  outcome: EngineOutcome;
  className?: string;
}) {
  const cell = CELL[outcome ?? 'gap'];

  return (
    <span className={`text-base font-semibold ${cell.className} ${className}`}>
      <span aria-hidden="true">{cell.glyph}</span>
      <span className="sr-only">
        {engine} {cell.word}
      </span>
    </span>
  );
}

import type { CheckStatus } from '@/lib/audit/types';

/*
  What a check came back as, drawn and named.

  ⚠️ THREE COPIES OF THIS EXISTED BEFORE IT WAS A FILE, and the third is what
  forced the extraction. components/dashboard/audit-workspace.tsx and
  components/marketing/visibility-audit.tsx each carried a byte-identical glyph
  switch and a near-identical chip map — near, not identical: one called a
  warning "Worth a look" and the other "Needs a look", so the same finding
  described itself differently depending on whether the reader had signed up.
  That is the drift micro-label.tsx and section-title.tsx were each written to
  stop, arriving a third time.

  ⚠️ THE WORD IS NOT OPTIONAL, AND IT IS NOT THE ICON'S JOB. The svg is
  aria-hidden and every glyph here is a shape, not a sentence — a tick and a
  cross at 14px are the same smudge to a colourblind reader and identical in
  print. STATUS_WORD is exported alongside so a caller can put the word in an
  `sr-only` span beside the mark. A call site that renders the icon and the
  chip without the word is the exact failure audit-summary.tsx documents:
  "colour was carrying the whole meaning, which is what score-dial.tsx refuses
  to do and what every status colour in this dashboard is required not to do".
*/

/**
 * The chip a status wears — a background and the ink to sit on it.
 *
 * ⚠️ `warn` IS AMBER NOW, NOT CYAN. It used to be `bg-accent-soft text-teal-ink`
 * in both copies, which is the brand accent and also what the Pro-lock chip
 * uses — so "needs a look" and "you have not paid for this" were the same
 * colour, and pass/warn/fail rendered as two states with a decoration. See the
 * note on --color-warn in app/globals.css.
 */
export const STATUS_CHIP: Record<CheckStatus, string> = {
  pass: 'bg-success/12 text-success-ink',
  warn: 'bg-warn-soft text-warn-ink',
  fail: 'bg-error/12 text-error-ink',
  locked: 'bg-cloud text-slate border border-line',
  na: 'bg-cloud text-slate border border-line',
};

/** The status in words, for the `sr-only` span every caller owes the icon. */
export const STATUS_WORD: Record<CheckStatus, string> = {
  pass: 'Pass',
  warn: 'Worth a look',
  fail: 'Problem',
  locked: 'Not checked',
  na: 'Not applicable',
};

/**
 * The glyph alone.
 *
 * Colour comes from the parent, like every other icon in components/ui — the
 * chip supplies it, so the mark and its background cannot disagree.
 */
export function StatusIcon({
  status,
  className = 'h-3.5 w-3.5',
}: {
  status: CheckStatus;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {status === 'pass' && <polyline points="3 8.5 6.5 12 13 4.5" />}
      {status === 'warn' && <path d="M8 4v5M8 11.5h.01" />}
      {status === 'fail' && <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />}
      {status === 'locked' && (
        <>
          <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
          <path d="M5.8 7V5.6a2.2 2.2 0 0 1 4.4 0V7" />
        </>
      )}
      {status === 'na' && <path d="M4 8h8" />}
    </svg>
  );
}

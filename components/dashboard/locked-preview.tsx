import type { ReactNode } from 'react';
import { LockIcon } from './nav-icons';

/*
  Real rows, then the shape of the ones a free account does not have.

  ⚠️ THERE IS NOTHING BEHIND THE BLUR, AND THAT IS THE ENTIRE DESIGN. The bars
  below are empty divs. Not faint text, not a sample question, not an sr-only
  string — nothing. A blur is a visual effect: a screenshot, a reader extension,
  a user stylesheet or `filter: none` in devtools all defeat it in a second, so
  the only thing safe to put behind one is nothing at all.

  Anything else would be inventing readings on somebody's own dashboard, which
  is the line this codebase holds everywhere else — lib/dashboard/worklist.ts
  puts it plainly for the locked tasks that sit alongside this: "a locked task
  carries NO invented data. It names what the paid audit covers; it never shows
  a count of findings we did not run."

  ⚠️ THE BARS ARE aria-hidden AND THE LOCK LINE CARRIES THE MEANING. A blurred
  rectangle says nothing to a screen reader, and the effect is also invisible to
  anyone who cannot see it — so the words underneath are the real signal, not a
  caption for the picture. Same reason the padlock glyph never travels alone
  anywhere in this product.
*/
export function LockedPreview({
  children,
  /** How many placeholder bars to draw. Cosmetic — never a count of anything. */
  bars = 3,
  /** What the reader is actually missing, in words. Derived, never typed. */
  label,
}: {
  children: ReactNode;
  bars?: number;
  label: string;
}) {
  return (
    <div>
      {children}

      {/* ⚠️ WIDTHS VARY SO THE BLOCK READS AS A LIST RATHER THAN A LOADING
          SKELETON. Three identical bars look like something still arriving,
          which would promise that waiting is enough. */}
      <div
        aria-hidden="true"
        className="mt-3 space-y-2 blur-[3px] select-none"
      >
        {Array.from({ length: bars }, (_, i) => (
          <div
            key={i}
            className="bg-line h-4 rounded-full"
            style={{ width: `${[88, 72, 94, 66, 81][i % 5]}%` }}
          />
        ))}
      </div>

      <p className="text-slate mt-3 flex items-center gap-2 text-xs">
        <LockIcon className="h-3.5 w-3.5 shrink-0" />
        {label}
      </p>
    </div>
  );
}

/**
 * Has the reader asked for less motion?
 *
 * ⚠️ THIS EXISTS BECAUSE CSS CANNOT ANSWER FOR EVERYTHING. The reduced-motion
 * block in app/globals.css clamps animation-duration and transition-duration to
 * 0.01ms on `*`, which covers every piece of motion in this product that is
 * expressed in CSS — and it is invisible to motion driven from JavaScript. The
 * help panel reveals streamed text on a paced loop; no stylesheet can slow that
 * down or turn it off, so the loop has to ask.
 *
 * Two callers today and they use the answer differently, which is the point:
 * components/ui/overlay.tsx skips its entrance so the dialog is simply there,
 * and components/dashboard/help-bubble.tsx stops pacing and prints each chunk
 * as it lands. Both are "the honest end state, arrived at immediately" — the
 * rule the meter-fill note in globals.css states for its own animation.
 *
 * ⚠️ READ AT THE MOMENT IT MATTERS, NOT SUBSCRIBED TO. Nothing here re-runs when
 * the preference changes mid-session: a dialog already open stays open, and a
 * summary already writing keeps writing. Both finish in under a second, and a
 * listener would be machinery for a case that lasts less time than reading the
 * sentence about it.
 *
 * Returns false during server rendering, where there is no reader to ask. Every
 * caller is behind a mount check, so that value is never the one used.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * How many characters to reveal on this frame, given how many are waiting.
 *
 * A model's text does not arrive evenly. Deltas land in bursts — forty
 * characters at once, then nothing for a beat — and appending each one straight
 * to state reproduces that stutter exactly. This spreads the backlog over
 * frames instead.
 *
 * ⚠️ PROPORTIONAL, NOT A FIXED RATE, AND THAT IS THE WHOLE DESIGN. A constant
 * "three characters a frame" reads beautifully until the model outruns it, and
 * then the text is still being typed out seconds after the response finished —
 * which is no longer a reveal, it is a re-enactment. Draining a share of
 * whatever is waiting means the reveal speeds up exactly when it is behind and
 * settles down when it has caught up, so it stays close to the real arrival
 * while never moving in jerks.
 *
 * ⚠️ THE FLOOR OF 1 IS LOAD-BEARING. Math.ceil already guarantees it for any
 * positive backlog, but a rate that could round to zero would be a loop that
 * never finishes and text that never completes.
 *
 * The divisor sets the smoothing: bigger is smoother and lags further behind.
 * Eight drains a 40-character burst in about five frames — under a tenth of a
 * second, faster than the eye reads and slow enough not to flash.
 *
 * Exported and pure so it can be tested over a recorded burst pattern; the
 * effect that calls it, sixty times a second, cannot be.
 */
export function revealStep(pending: number, divisor = 8): number {
  if (pending <= 0) return 0;
  return Math.min(pending, Math.max(1, Math.ceil(pending / divisor)));
}

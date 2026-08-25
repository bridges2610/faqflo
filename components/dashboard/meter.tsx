/*
  A horizontal bar showing a proportion.

  Four of these existed independently — the audit's pillar scores, the
  competitor share and the tracking quota, and the setup checklist's progress —
  at three different heights, on two different track colours, with `aria-hidden`
  on exactly one of them.

  ⚠️ ALWAYS aria-hidden, and that is a rule about the CALLER.

  Every one of these bars already prints its own number as text beside or above
  it: "62/100 · 8 checks", "4" next to the competitor, "12 of 35 prompts", "2 of
  4 done". The bar is a second, visual encoding of a figure that is already
  readable, so exposing it to a screen reader would announce the same value
  twice in a vaguer form. If you ever add a Meter with no number next to it,
  this is the wrong component — give it a real role and label instead.

  A minimum width on the fill keeps a small non-zero value visible; a bar that
  renders as nothing for 1 out of 400 reads as zero, which is a different claim.

  ⚠️ `animate` IS CSS-ONLY, AND THAT IS A CONSTRAINT RATHER THAN A PREFERENCE.

  The obvious way to fill a bar on mount is to hold the width in state and set
  it in an effect. That would make this a Client Component, and
  run-progress.tsx renders it from a Server Component — so the whole file has to
  stay free of hooks. A keyframe on the fill does the same job with no state,
  no effect and nothing added to the bundle.

  It also stays honest under prefers-reduced-motion for free: the global block
  in globals.css clamps every animation-duration to 0.01ms, so the bar arrives
  at its true width instantly rather than not arriving.
*/
const TONES = {
  primary: 'bg-primary',
  success: 'bg-success',
  accent: 'bg-accent',
  error: 'bg-error',
  line: 'bg-line',
} as const;

export function Meter({
  value,
  tone = 'primary',
  animate = false,
  className = '',
}: {
  /** 0–100. Clamped, so a caller's arithmetic can't overflow the track. */
  value: number;
  tone?: keyof typeof TONES;
  /**
   * Grow from empty on first paint.
   *
   * For bars that show a standing figure — how much of something is done — so
   * the shape reads as progress rather than as a static block of colour. Leave
   * it off for anything that updates in place: a bar already mid-flight, like
   * a live scan or run, should move by its width transition from wherever it
   * was, not restart from zero every time the number changes.
   */
  animate?: boolean;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));

  return (
    <div
      className={`bg-cloud h-1.5 w-full overflow-hidden rounded-full ${className}`}
      aria-hidden="true"
    >
      <div
        className={`h-full origin-left rounded-full transition-all duration-500 ${TONES[tone]} ${
          animate ? 'motion-meter-fill' : ''
        }`}
        style={{ width: pct === 0 ? '0%' : `${Math.max(2, pct)}%` }}
      />
    </div>
  );
}

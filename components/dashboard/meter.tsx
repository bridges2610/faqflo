/*
  A horizontal bar showing a proportion.

  Four of these existed independently — the audit's pillar scores, the
  competitor share and the tracking quota, and the setup checklist's progress —
  at three different heights, on two different track colours, with `aria-hidden`
  on exactly one of them.

  ⚠️ ALWAYS aria-hidden, and that is a rule about the CALLER.

  Every one of these bars already prints its own number as text beside or above
  it: "62/100 · 8 checks", "4" next to the competitor, "12 of 25 prompts", "2 of
  4 done". The bar is a second, visual encoding of a figure that is already
  readable, so exposing it to a screen reader would announce the same value
  twice in a vaguer form. If you ever add a Meter with no number next to it,
  this is the wrong component — give it a real role and label instead.

  A minimum width on the fill keeps a small non-zero value visible; a bar that
  renders as nothing for 1 out of 400 reads as zero, which is a different claim.
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
  className = '',
}: {
  /** 0–100. Clamped, so a caller's arithmetic can't overflow the track. */
  value: number;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));

  return (
    <div
      className={`bg-cloud h-1.5 w-full overflow-hidden rounded-full ${className}`}
      aria-hidden="true"
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${TONES[tone]}`}
        style={{ width: pct === 0 ? '0%' : `${Math.max(2, pct)}%` }}
      />
    </div>
  );
}

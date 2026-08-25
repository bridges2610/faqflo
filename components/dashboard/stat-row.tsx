import { Meter } from './meter';

/*
  A labelled ratio, shown as a shape as well as a number.

  The dashboard was full of these written as bare text — "Pages read 4 of 4",
  "With FAQ markup 1 of 4", "AI citations 3 of 15", all right-aligned in a
  definition list. Every one is a proportion, and none of them looked like one:
  the reader had to do the division themselves to find out whether 1 of 4 was
  most of the way there or barely started.

  ⚠️ THE `null` PATH IS THE WHOLE POINT OF THIS BEING A COMPONENT.

  "We have not measured this" and "this is zero" are different claims, and the
  dashboard says so in half a dozen files — see the note on AI citations in
  overview-workspace.tsx, and `null` must never render as 0 in
  tracking-workspace.tsx. A bar cannot express the difference: an empty track
  reads as zero no matter what the label says.

  So `total: null` renders the words and NO track at all. That turns a rule
  every caller previously had to remember into one the type system asks about —
  you cannot pass an unmeasured ratio to this and accidentally get a bar.

  The number stays printed beside the label, which is what makes the borrowed
  Meter legal: meter.tsx is always aria-hidden on the contract that its caller
  states the figure in text.
*/
export function StatRow({
  label,
  value,
  total,
  note,
  icon,
  tone = 'primary',
}: {
  label: string;
  /**
   * A mark before the label — an engine's logo, on the Home rail.
   *
   * Sized by the caller. Note that EngineMark and the other marks in
   * components/ui/ai-marks.tsx take `className` for SIZE ONLY: they carry
   * their owners' fixed fills and must not be recoloured to match a row.
   */
  icon?: React.ReactNode;
  /** The measured count. Ignored when `total` is null. */
  value: number;
  /**
   * The denominator, or null when nothing has been measured yet.
   *
   * ⚠️ Null is a real state, not a missing prop. It renders `note` and no bar.
   */
  total: number | null;
  /** What to say instead of a ratio when there is nothing to divide. */
  note?: string;
  /**
   * `line` is the flat one: a measured zero.
   *
   * ⚠️ It is NOT the same as `total: null`. A grey track means we looked and
   * the count was nothing; no track at all means we never looked. Both render
   * as an empty-looking row and they mean opposite things, which is why the
   * words differ too — "0 of 5" against "no answers stored".
   */
  tone?: 'primary' | 'success' | 'accent' | 'line';
}) {
  const measured = total !== null && total > 0;

  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        {/* items-center on the label pair, inside a row that aligns on the
            baseline: a logo has no baseline of its own, so it is centred
            against the word, while this box still hands that word's baseline
            up to the row and keeps the figure on the right level with it. */}
        <span className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="text-slate truncate text-sm">{label}</span>
        </span>
        <span className="text-navy shrink-0 text-sm font-semibold tabular-nums">
          {measured ? `${value} of ${total}` : (note ?? 'not measured')}
        </span>
      </div>

      {/* No track when there is nothing measured — an empty bar would say
          "zero", which is a claim we have not earned. */}
      {measured && (
        <Meter className="mt-2" value={(value / total) * 100} tone={tone} animate />
      )}
    </div>
  );
}

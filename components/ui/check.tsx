/*
  Tick mark for feature lists.

  Takes className only — like the doodles, positioning and colour belong to the
  list that renders it, since the vertical nudge that lines a 13px tick up with
  a line of text depends on that text's size.
*/
export function Check({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="13"
      height="13"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="1.5 6.5 4.5 9.5 10.5 2.5" />
    </svg>
  );
}

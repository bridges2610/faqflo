/*
  The small mono label above a group of fields, a metric, or a rail section.

  Eighteen of these across the dashboard, previously in four spellings: the
  intended `text-[0.6875rem]`, a rounded-off `text-xs` (12px, a noticeable step
  bigger), one missing `uppercase` entirely, and one that swapped slate for
  primary. They are meant to recede — a label that competes with the number
  under it is a label doing the opposite of its job.

  ⚠️ 12px ON A PHONE, 11px FROM `sm:` UP — WHICH IS NOT A REVERSAL OF THE ABOVE.
  The note says 12px is "a noticeable step bigger" and that these are meant to
  recede, and that still holds at the width it was written for: the desktop size
  is unchanged. On a 320px screen 11px uppercase mono is a different problem —
  it stops receding and starts being unreadable. If the two ever have to be the
  same number, 11px everywhere is the wrong one to pick.

  `tone` exists for the one legitimate variant: a label that heads an action
  rather than a fact ("Do these N things") earns primary. Everything describing
  data stays slate.
*/
export function MicroLabel({
  children,
  tone = 'slate',
  className = '',
}: {
  children: React.ReactNode;
  tone?: 'slate' | 'primary';
  className?: string;
}) {
  return (
    <p
      className={`font-mono text-xs tracking-wide uppercase sm:text-[0.6875rem] ${
        tone === 'primary' ? 'text-primary' : 'text-slate'
      } ${className}`}
    >
      {children}
    </p>
  );
}

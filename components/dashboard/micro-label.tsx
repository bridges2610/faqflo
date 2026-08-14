/*
  The small mono label above a group of fields, a metric, or a rail section.

  Eighteen of these across the dashboard, previously in four spellings: the
  intended `text-[0.6875rem]`, a rounded-off `text-xs` (12px, a noticeable step
  bigger), one missing `uppercase` entirely, and one that swapped slate for
  primary. They are meant to recede — a label that competes with the number
  under it is a label doing the opposite of its job.

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
      className={`font-mono text-[0.6875rem] tracking-wide uppercase ${
        tone === 'primary' ? 'text-primary' : 'text-slate'
      } ${className}`}
    >
      {children}
    </p>
  );
}

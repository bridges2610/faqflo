import type { ReactNode } from 'react';

type Tone = 'blue' | 'cyan' | 'neutral' | 'success';

const TONES: Record<Tone, string> = {
  blue: 'bg-primary-soft text-primary',
  // Navy on cyan-tint, never white — the cyan is too light for white text.
  cyan: 'bg-accent-soft text-navy',
  neutral: 'bg-surface text-slate border border-line',
  // success-ink, not success: #22C55E as text is 2.28:1 on its own tint.
  success: 'bg-success/12 text-success-ink',
};

export function Badge({
  tone = 'blue',
  children,
  className = '',
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded-pill inline-flex items-center gap-1.5 px-3 py-1 text-[0.8125rem] font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

import type { ReactNode } from 'react';

type Tone = 'white' | 'cloud';

// Surface colour is a prop, not a className override: `bg-cloud` passed in
// alongside a hardcoded `bg-white` lands at equal specificity, so which one
// wins depends on Tailwind's output order rather than on intent.
const TONES: Record<Tone, string> = {
  white: 'bg-white shadow-card',
  cloud: 'bg-cloud',
};

export function Card({
  children,
  className = '',
  tone = 'white',
  hover = false,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  tone?: Tone;
  /** Lifts slightly on hover — for cards that are themselves interactive. */
  hover?: boolean;
  as?: 'div' | 'article' | 'li';
}) {
  return (
    <Tag
      className={`border-line rounded-xl border ${TONES[tone]} ${
        hover ? 'hover:shadow-lift hover:-translate-y-0.5 transition-all duration-200' : ''
      } ${className}`}
    >
      {children}
    </Tag>
  );
}

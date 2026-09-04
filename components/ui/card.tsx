import type { ReactNode } from 'react';

type Tone = 'white' | 'cloud';

// Surface colour is a prop, not a className override: `bg-cloud` passed in
// alongside a hardcoded `bg-surface` lands at equal specificity, so which one
// wins depends on Tailwind's output order rather than on intent.
const TONES: Record<Tone, string> = {
  white: 'bg-surface shadow-card',
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
  /** Lifts slightly on hover, and presses in on tap — for interactive cards. */
  hover?: boolean;
  as?: 'div' | 'article' | 'li';
}) {
  /*
    ⚠️ THE `active:` HALF IS FOR TOUCH, WHERE THE `hover:` HALF NEVER MATCHES.
    Tailwind v4 guards hover behind @media (hover: hover), so on a phone a card
    that only lifted on hover did nothing at all when pressed.

    ⚠️ THE PRESS MUST DIFFER FROM REST, NOT FROM HOVER — AND THE OBVIOUS VERSION
    OF THIS DOES NOT. The first attempt was `active:translate-y-0` plus a
    lighter shadow, i.e. "settle back down out of the hover lift". Measured on an
    emulated phone, that changes nothing at all: the card is never lifted there,
    so cancelling the lift is a no-op, and shadow-card → shadow-soft is a 0.08 →
    0.06 alpha step nobody can see. Rest and pressed came back byte-identical.

    A small scale is the one thing visible from rest. 0.99 rather than the
    button's 0.97: a whole tile shrinking by 3% reads as the layout glitching.

    translate-y-0 stays for hybrid devices — a laptop with a touchscreen can be
    hovering AND pressing, and without it the card would press while still held
    up in the air.
  */
  const interactive = hover
    ? 'transition-all duration-200 hover:shadow-lift hover:-translate-y-0.5 active:scale-[0.99] active:translate-y-0 active:duration-75'
    : '';

  return (
    <Tag
      className={`border-line rounded-xl border ${TONES[tone]} ${interactive} ${className}`}
    >
      {children}
    </Tag>
  );
}

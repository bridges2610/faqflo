/*
  Icons shared by more than one surface.

  Menu and Close started life in components/dashboard/nav-icons.tsx, next to the
  sidebar icons they were drawn alongside. They moved here when the marketing
  header grew a drawer of its own: an import reaching from components/marketing/
  into components/dashboard/ would imply the two share more than a hamburger.

  Same 20×20 grid and 1.6 stroke as nav-icons.tsx, so an icon that appears in
  both places reads identically in both.
*/

type IconProps = { className?: string };

const BASE = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export function MenuIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
    </svg>
  );
}

export function CloseIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
    </svg>
  );
}

/**
 * A clock, for the "I'm busy" explainer.
 *
 * ⚠️ IT NEVER TRAVELS ALONE. The button beside it always carries the words, and
 * its accessible name is a full sentence — a clock face on its own could mean
 * opening hours, a schedule, or history. Same rule as the padlock in
 * nav-icons.tsx: the glyph decorates the meaning, it is never the meaning.
 */
export function ClockIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4.2l2.8 1.7" />
    </svg>
  );
}

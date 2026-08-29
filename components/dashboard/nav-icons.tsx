/*
  Sidebar icons.

  Drawn as 20×20 line icons on a shared grid so they sit at the same optical
  weight as each other — the marketing doodles are hand-drawn and deliberately
  loose, which is wrong for navigation that has to read at a glance.

  Each takes className only, like every other icon in components/ui.
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

export function HomeIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1V8.5Z" />
    </svg>
  );
}

export function FaqIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M3 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8l-4 3.5V14H5a2 2 0 0 1-2-2V5Z" />
      <path d="M8.2 7.1a1.9 1.9 0 0 1 3.6.8c0 1.3-1.8 1.5-1.8 2.6" />
      <path d="M10 12.6h.01" />
    </svg>
  );
}

/** Content: a page with lines of writing on it. */
export function DocIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M5 3h6.5L16 7v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M11.5 3v4H16" />
      <path d="M7 11h6M7 14h4" />
    </svg>
  );
}

export function SetupIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M7.5 6.5 4 10l3.5 3.5M12.5 6.5 16 10l-3.5 3.5" />
      <path d="M11.2 4.5 8.8 15.5" />
    </svg>
  );
}

export function AeoIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="10" cy="10" r="7" />
      <path d="M3.2 8.4h13.6M3.2 11.6h13.6" />
      <path d="M10 3c-2 2.2-2.9 4.6-2.9 7s.9 4.8 2.9 7c2-2.2 2.9-4.6 2.9-7S12 5.2 10 3Z" />
    </svg>
  );
}

export function SearchIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="8.8" cy="8.8" r="5.3" />
      <path d="M12.8 12.8 17 17" />
    </svg>
  );
}

export function GlobeIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M3.5 10h13" />
      <path d="M10 3.5c1.8 2 2.6 4.2 2.6 6.5S11.8 16.5 10 16.5 7.4 12.3 7.4 10 8.2 3.5 10 3.5Z" />
    </svg>
  );
}

export function ChartIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M3.5 16.5h13" />
      <path d="M6 16.5V11M10 16.5V5.5M14 16.5v-4" />
    </svg>
  );
}

// MenuIcon and CloseIcon used to sit here. The marketing header needed them
// too, so they live in components/ui/icons.tsx now — import them from there.

export function PlusIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M10 4.5v11M4.5 10h11" />
    </svg>
  );
}

export function TrashIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.2a1 1 0 0 0 1 .8h4.6a1 1 0 0 0 1-.8L14 6" />
    </svg>
  );
}

/**
 * Save a copy.
 *
 * ⚠️ ARROW INTO A TRAY, NOT A BARE ARROW-DOWN. ArrowDownIcon already exists and
 * means "move this down" — it is the reorder control on answers and groups. A
 * download that borrowed it would be the same glyph for two unrelated verbs on
 * screens a customer moves between.
 */
export function DownloadIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M3.5 13.5v2a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}

export function ArrowUpIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M10 15.5v-11M5.5 9 10 4.5 14.5 9" />
    </svg>
  );
}

export function ArrowDownIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M10 4.5v11M5.5 11l4.5 4.5L14.5 11" />
    </svg>
  );
}

export function CopyIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="7" y="7" width="9.5" height="9.5" rx="1.8" />
      <path d="M13 4.5H5.3A1.8 1.8 0 0 0 3.5 6.3V14" />
    </svg>
  );
}

/** Confirmation tick, sized to swap in for CopyIcon without shifting layout. */
export function TickIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <polyline points="4 10.5 8.2 14.5 16 5.5" />
    </svg>
  );
}

/** Points right when closed; callers rotate it 90° to point down when open. */
export function ChevronIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M8 5l5 5-5 5" />
    </svg>
  );
}

export function LockIcon({ className = '' }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="4.5" y="8.5" width="11" height="8" rx="1.5" />
      <path d="M7.2 8.5V6.8a2.8 2.8 0 0 1 5.6 0v1.7" />
    </svg>
  );
}

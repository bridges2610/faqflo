/*
  Hand-drawn marks.

  These exist to break the machine-perfect feel of the rest of the page. Every
  path is deliberately a little wobbly and slightly off-centre — the strokes
  don't close cleanly, the underline isn't symmetric, the arrow's tail wavers.
  Perfectly even curves would defeat the point.

  All decorative, so all aria-hidden.
*/

/** Rough marker underline. Sits behind/below a word in a headline. */
export function Underline({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 300 22"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M4 14.5C48 7.5 108 4.2 168 5.4c34 .7 82 2.9 128 7.8"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* Second, lighter pass — like going over it twice with a marker. */}
      <path
        d="M14 19c52-5.5 116-7.4 174-5.6 30 .9 68 2.6 104 5.2"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}

/** Curving arrow, for pointing at something. */
export function CurvedArrow({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 96 84" fill="none" aria-hidden="true">
      <path
        d="M8 5c26 3.5 51 17 62 39 3.6 7.2 5.2 15.4 5 24.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M63 55.5c4.6 6.6 8 11.2 12 15.5M87 57c-4.4 6.8-8.6 10.6-12 14"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Four-point sparkle. Replaces the ✨ emoji, which reads as filler. */
export function Sparkle({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 .8c.5 3.4 1.7 5.4 3.6 6.3-2 .9-3.1 2.9-3.6 6.3-.5-3.4-1.6-5.4-3.6-6.3C6.3 6.2 7.5 4.2 8 .8Z"
        fill="currentColor"
      />
      <path
        d="M13.4 9.6c.24 1.6.8 2.6 1.7 3-.95.44-1.5 1.4-1.7 3-.23-1.6-.78-2.56-1.7-3 .9-.4 1.47-1.4 1.7-3Z"
        fill="currentColor"
        opacity="0.6"
      />
    </svg>
  );
}

/**
 * Loose hand-drawn ring, for circling a word.
 *
 * preserveAspectRatio="none" matters here: without it the ring keeps its own
 * proportions and floats as a small oval in the middle of the box instead of
 * stretching around whatever it's meant to enclose.
 */
export function Circled({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 84 64"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M44 4.5C24 3 6.5 13.5 4.6 27.6 2.7 41.7 17 55.6 37.5 58.6c20.5 3 39.3-6 42-20.4C82 24.7 70 11 50.5 6.6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

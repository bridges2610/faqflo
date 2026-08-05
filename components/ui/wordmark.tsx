import Link from 'next/link';

/*
  "Faq" in navy, "Flo" on a rounded chip tilted -3°.

  The tilt is the playful bit — it needs a touch of padding around the chip so
  the rotated corners never clip against neighbouring content.

  `reverse` is for DARK backgrounds only (navy, the code block) — it flips to a
  white chip with navy text. Don't use it on the bright cyan CTA band: that
  surface is light, so a white chip would vanish into it.
*/
export function Wordmark({
  reverse = false,
  className = '',
  asLink = true,
}: {
  reverse?: boolean;
  className?: string;
  asLink?: boolean;
}) {
  const inner = (
    <span
      className={`font-display inline-flex items-baseline gap-1 text-[1.375rem] leading-none font-extrabold tracking-tight ${className}`}
    >
      <span className={reverse ? 'text-white' : 'text-navy'}>Faq</span>
      <span
        className={`inline-block -rotate-3 rounded-[10px] px-2 py-1 ${
          reverse ? 'text-navy bg-white' : 'bg-primary text-white'
        }`}
      >
        Flo
      </span>
    </span>
  );

  if (!asLink) return inner;

  return (
    <Link href="/" aria-label="FaqFlo home" className="inline-flex items-center">
      {inner}
    </Link>
  );
}

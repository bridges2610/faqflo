/*
  The title of a card.

  ⚠️ `tracking-normal` is doing real work here, not tidying up.

  globals.css sets every h1–h4 to Plus Jakarta at weight 800 with -0.02em
  tracking, which is right for a 40px marketing headline and wrong for a 15px
  card title — at this size the negative tracking reads as cramped and the 800
  shouts over the data underneath it. A bare `text-lg` h2 inherits all of that,
  which is what sixteen cards across this dashboard were doing.

  This exists as a component rather than a className because those sixteen had
  already drifted into four spellings: `text-lg`, `text-xl`, `text-base`, and
  `text-lg font-bold` where someone had noticed the weight and half-fixed it.
  One component means the seventeenth can't invent a fifth.

  `as` handles nesting, not size. A card whose title sits under another card's
  title takes h3 so the document outline stays honest — it looks identical.
*/
export function SectionTitle({
  children,
  as: Tag = 'h2',
  icon,
  tint = 'bg-cloud text-slate',
  className = '',
}: {
  children: React.ReactNode;
  as?: 'h2' | 'h3';
  /**
   * A small mark in a tinted square, left of the title.
   *
   * ⚠️ DECORATION, AND IT MUST STAY DECORATION. The icon is aria-hidden and
   * carries no meaning the title does not already say — it exists so a reader
   * scanning a long page can find a card by its shape instead of reading five
   * headings. Anything the icon alone would tell you belongs in the words.
   *
   * ⚠️ IDENTITY, NOT STATE. Same rule metric-tile.tsx states for its chip
   * tint: this says WHICH card you are looking at, so it never changes with
   * the data. A tint that moved with a value would be colour carrying meaning
   * with no word beside it, which status-icon.tsx and score-dial.tsx both
   * refuse.
   *
   * Optional, so the forty-odd existing call sites are untouched.
   */
  icon?: React.ReactNode;
  /** Chip colours for the icon. Pair fills with their -ink text, never accent. */
  tint?: string;
  className?: string;
}) {
  const heading = (
    <Tag className={`text-[0.9375rem] font-bold tracking-normal ${icon ? '' : className}`}>
      {children}
    </Tag>
  );

  if (!icon) return heading;

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden="true"
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tint}`}
      >
        {icon}
      </span>
      {heading}
    </div>
  );
}

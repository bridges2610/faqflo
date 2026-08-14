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
  className = '',
}: {
  children: React.ReactNode;
  as?: 'h2' | 'h3';
  className?: string;
}) {
  return (
    <Tag className={`text-[0.9375rem] font-bold tracking-normal ${className}`}>{children}</Tag>
  );
}

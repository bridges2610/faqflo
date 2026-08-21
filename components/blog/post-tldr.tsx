import type { ReactNode } from 'react';

/*
  The summary box at the top of a post.

  Children are ordinary markdown — a lead paragraph, then a list — so a post
  writes the takeaways the way it writes everything else, and inline `code`
  still lands on the mapping in mdx-components.tsx. Only the first paragraph is
  restyled, which is what makes the box read as one claim with its supporting
  points rather than a wall of equal-weight sentences.

  No surface, no rule, no card. Both a fill and a border competed with the
  featured image immediately above, so the block is set off by its label and
  its smaller type alone — which is all a reader needs to know it's a summary
  and not the article's first section.

  Note the arbitrary variants below rather than styling from inside P and Li.
  Markdown-generated elements can't know where they were used, and a `variant`
  prop on P would have to be threaded through the MDX element map, which has no
  way to pass one. The type is stepped down from body copy on purpose — a
  summary should look like an aside, not like the article restated.
*/
export function PostTldr({ children }: { children?: ReactNode }) {
  return (
    <aside className="mt-8">
      <p className="text-primary font-mono text-[0.6875rem] tracking-wide uppercase">TL;DR</p>

      {/* The bullet is an ::before on the item now rather than a span inside it
          — see the note in post-prose.tsx — so the nudge that lines it up with
          this box's smaller type has to target the pseudo-element. */}
      <div className="mt-2.5 [&_li]:text-[0.9375rem] [&_li]:leading-[1.7] [&_li]:before:mt-2.5 [&_p]:text-[0.9375rem] [&_p]:leading-[1.7] [&>p:first-child]:text-navy [&>p:first-child]:font-semibold [&>ul]:mt-3.5">
        {children}
      </div>
    </aside>
  );
}

import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

/*
  Body copy for blog posts.

  These are wired to markdown element names in mdx-components.tsx, so a post
  writes plain markdown and still lands on the site's type scale. They take
  element props rather than a bespoke API because MDX hands them whatever the
  markdown produced — `children`, and for links an `href`.

  Measurements match the article pages so a post and the guide read as the same
  publication.
*/

export function P({ children }: { children?: ReactNode }) {
  return <p className="text-slate mt-5 text-[1.0625rem] leading-[1.8] first:mt-0">{children}</p>;
}

export function H2({ children }: { children?: ReactNode }) {
  return <h2 className="mt-12 mb-1 text-[1.625rem] leading-snug text-balance">{children}</h2>;
}

export function H3({ children }: { children?: ReactNode }) {
  return <h3 className="mt-9 mb-1 text-[1.1875rem]">{children}</h3>;
}

/*
  ⚠️ THE MARKER BELONGS TO THE LIST, NOT TO THE ITEM.

  Li used to draw a cyan dot itself, which meant an ORDERED list rendered as
  bullets — the numbers silently disappeared, and with them the only reason to
  have written an ordered list. Preflight strips real list markers, so something
  has to draw them; the parent is the only element that knows which kind it is.

  Both markers are ::before pseudo-elements on the item. Li is a flex container,
  so a pseudo-element becomes its first flex item and sits exactly where the old
  span did.
*/
export function Ul({ children }: { children?: ReactNode }) {
  return (
    <ul className="mt-5 space-y-3 [&>li]:before:bg-accent [&>li]:before:mt-3 [&>li]:before:h-1.5 [&>li]:before:w-1.5 [&>li]:before:shrink-0 [&>li]:before:rounded-full [&>li]:before:content-['']">
      {children}
    </ul>
  );
}

/*
  Numbers from a CSS counter rather than from the browser's own list marker.

  `display: flex` on the item removes its marker box entirely, so `list-decimal`
  renders nothing — and the flex layout is what keeps a wrapped second line
  aligned under the first rather than under the number. A counter gives both.

  tabular-nums so 9. and 10. occupy the same width and the text stays in one
  column.
*/
export function Ol({ children }: { children?: ReactNode }) {
  return (
    <ol className="mt-5 space-y-3 [counter-reset:item] [&>li]:before:text-primary [&>li]:before:w-5 [&>li]:before:shrink-0 [&>li]:before:text-right [&>li]:before:font-semibold [&>li]:before:tabular-nums [&>li]:before:[content:counter(item)'.'] [&>li]:[counter-increment:item]">
      {children}
    </ol>
  );
}

export function Li({ children }: { children?: ReactNode }) {
  return (
    <li className="text-slate flex gap-3 text-[1.0625rem] leading-[1.8]">
      <span>{children}</span>
    </li>
  );
}

/** Pull-quote. A left rule rather than quotation marks — the copy usually
    already contains quotes and two sets read as a mistake. */
export function Quote({ children }: { children?: ReactNode }) {
  return (
    <blockquote className="border-primary/30 [&>p]:font-display [&>p]:text-navy mt-8 border-l-2 pl-6 [&>p]:text-[1.25rem] [&>p]:leading-snug [&>p]:font-extrabold [&>p]:text-balance">
      {children}
    </blockquote>
  );
}

/*
  Inline code — a bot name, a robots.txt directive, a header.

  Sized in `em` rather than `rem` so a snippet inside a heading scales with the
  heading instead of shrinking to body size.

  box-decoration-clone is not cosmetic polish. A name like `OAI-SearchBot` wraps
  on a phone, and the default `slice` draws one box across both fragments — an
  open-ended half on each line, which reads as broken layout rather than as one
  token. Cloning gives each fragment its own border and padding.
*/
export function Code({ children }: { children?: ReactNode }) {
  return (
    <code className="bg-cloud text-navy border-line box-decoration-clone rounded-md border px-1.5 py-0.5 font-mono text-[0.875em]">
      {children}
    </code>
  );
}

/*
  Fenced code blocks.

  Markdown gives every fence a `<code>` inside the `<pre>`, and that inner
  element also hits the Code mapping above — so the badge styling is undone
  here rather than by teaching Code where it sits. One rule, no context, and
  Code stays a component that only has to know about itself.

  overflow-x-auto is the load-bearing part: a long curl command must scroll
  inside its own box instead of widening the article on a phone.
*/
export function Pre({ children }: { children?: ReactNode }) {
  return (
    <pre className="bg-cloud border-line text-navy mt-6 overflow-x-auto rounded-xl border p-5 font-mono text-[0.875rem] leading-[1.75] [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">
      {children}
    </pre>
  );
}

export function Strong({ children }: { children?: ReactNode }) {
  return <strong className="text-navy font-semibold">{children}</strong>;
}

export function Hr() {
  return <hr className="border-line mt-10 border-t" />;
}

/** Inline link. next/link for internal paths, a plain anchor for anything
    external, which also gets the noopener treatment. */
export function A({ href = '', children }: ComponentPropsWithoutRef<'a'>) {
  const className =
    'text-primary hover:text-primary-hover underline decoration-2 underline-offset-4 transition-colors duration-150';

  if (href.startsWith('/') || href.startsWith('#')) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/*
  Inline images inside post bodies.

  A plain <img>, not next/image: markdown's ![alt](src) carries no dimensions,
  and next/image needs either those or a `fill` parent. The featured image —
  the one that actually governs layout shift on these pages — still goes
  through next/image in FeaturedImage.

  Export images at roughly the content width (~1500px) before dropping them in;
  nothing here will resize them for you.
*/
export function Img({ src, alt }: ComponentPropsWithoutRef<'img'>) {
  if (typeof src !== 'string') return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt ?? ''} loading="lazy" className="mt-8 w-full rounded-xl" />
  );
}

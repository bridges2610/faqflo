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

export function Ul({ children }: { children?: ReactNode }) {
  return <ul className="mt-5 space-y-3">{children}</ul>;
}

export function Ol({ children }: { children?: ReactNode }) {
  return <ol className="mt-5 space-y-3">{children}</ol>;
}

/** Preflight strips list markers, so the dot is drawn explicitly. */
export function Li({ children }: { children?: ReactNode }) {
  return (
    <li className="text-slate flex gap-3 text-[1.0625rem] leading-[1.8]">
      <span className="bg-accent mt-3 h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden="true" />
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

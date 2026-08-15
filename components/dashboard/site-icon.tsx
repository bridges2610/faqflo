'use client';

import { useState } from 'react';

/*
  The site's own favicon, beside its name in the header.

  Fetched straight from the customer's domain — not through Google's or
  DuckDuckGo's favicon endpoint. Those are one line and resolve almost every
  domain, but they would ship every customer's domain to a third party on every
  dashboard load, which is not a trade worth making for a decorative 16px image
  in a product that otherwise sends nothing anywhere.

  A plain <img> rather than next/image: next.config.ts declares no
  `images.remotePatterns`, so next/image throws at request time on any external
  host. Allowing arbitrary customer domains would mean a wildcard pattern AND
  routing every customer's favicon through our own optimizer. Same escape hatch,
  for the same class of reason, as components/blog/post-prose.tsx.
*/
export function SiteIcon({
  name,
  domain,
  className = '',
}: {
  name: string;
  domain: string;
  className?: string;
}) {
  /*
    Keyed by domain, not a bare boolean.

    `useState(false)` survives a prop change, so switching from a site whose
    favicon 404s to one that has an icon would leave the monogram stuck on. This
    keeps the component self-contained — a `key` at the call site would work too
    and is exactly the sort of thing that rots the first time someone adds a
    third caller.
  */
  const [failedFor, setFailedFor] = useState<string | null>(null);

  /*
    new URL() rather than a template string, because `domain` is free text
    somebody typed into the add-site form. normalizeDomain() lowercases it and
    strips the scheme and path, but never checks it is a hostname — so this
    throws on junk instead of firing off a malformed request. React escapes
    attribute values, so the concern is a sane request, not injection.
  */
  let href: string | null = null;
  try {
    href = new URL('/favicon.ico', `https://${domain}`).toString();
  } catch {
    href = null;
  }

  // Narrowed inline rather than through a `showImage` boolean, which TypeScript
  // doesn't carry back to `href`.
  if (href !== null && failedFor !== domain) {
    return (
      <img
        src={href}
        alt=""
        width={24}
        height={24}
        loading="lazy"
        /* Their own server logs don't need our dashboard URLs. */
        referrerPolicy="no-referrer"
        onError={() => setFailedFor(domain)}
        /*
          A hard 404 fires onError. A host that answers /favicon.ico with 200
          and an HTML error page does not — it decodes to nothing and renders as
          a broken-image glyph. Zero natural width is how that case announces
          itself, and it is common enough to be worth the four lines.
        */
        onLoad={(e) => {
          if (e.currentTarget.naturalWidth === 0) setFailedFor(domain);
        }}
        className={`border-line h-6 w-6 shrink-0 rounded-md border bg-white object-contain ${className}`}
      />
    );
  }

  // Same idiom as the account chip at the other end of this header — see
  // account-menu.tsx. Two monograms in one bar should not disagree.
  const initial = (name || domain).trim().charAt(0).toUpperCase();

  return (
    <span
      className={`bg-primary-soft text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${className}`}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

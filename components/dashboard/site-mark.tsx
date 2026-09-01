'use client';

/*
  A website's icon, with a tinted letter behind it.

  ⚠️ THE ICON COMES FROM OUR OWN DOMAIN, NEVER A THIRD PARTY. The one-line
  version of this points an <img> at Google's favicon service, which tells
  Google every competitor domain a customer is watching — their commercial
  information, handed over for decoration, on the page about who is beating
  them. /api/favicon fetches it server-side and serves it back, so the only
  host this component talks to is ours. See the header of that route.

  ⚠️ THE LETTER IS NOT A PLACEHOLDER, IT IS THE FLOOR. It renders first and
  always, and the image sits on top of it once it arrives. Plenty of small
  trade sites have no usable icon at all, so "no image" is a normal outcome
  rather than an error state — the route answers 204 for it and this just keeps
  showing the letter. Nothing flashes, nothing breaks, and it still works
  offline and in print.

  ⚠️ THE COLOUR IS DERIVED, NOT RANDOM, so a rival keeps the same tint on every
  visit and between the two lists on the page. A hash of the domain picks the
  slot; the same domain always lands in the same one.
*/

import { useState } from 'react';

/**
 * Six tints from the existing palette.
 *
 * ⚠️ IDENTITY, NEVER STATE. Same rule section-title.tsx states for its icon
 * tint: this says WHICH website you are looking at, so it must not move with
 * the data. Nothing here may be read as good or bad — the trend chip a few
 * pixels away is the thing carrying that, and two colour systems in one row
 * saying different things is how a row becomes unreadable.
 */
const TINTS = [
  'bg-primary-soft text-primary',
  'bg-accent-soft text-teal-ink',
  'bg-success/12 text-success-ink',
  'bg-warn-soft text-warn-ink',
  'bg-navy/8 text-navy',
  'bg-cloud text-slate',
] as const;

/** Stable across reloads and machines — no Math.random, no index. */
function tintFor(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return TINTS[Math.abs(hash) % TINTS.length];
}

/**
 * The letter to show.
 *
 * The first letter of the domain rather than of the display name, because the
 * domain is what both lists join on and what a customer types — and a watch
 * list entry can be named anything, including nothing.
 */
function initialFor(domain: string): string {
  const first = domain.replace(/^www\./, '').match(/[a-z0-9]/i);
  return (first?.[0] ?? '?').toUpperCase();
}

export function SiteMark({ domain, className = '' }: { domain: string; className?: string }) {
  const [failed, setFailed] = useState(false);

  return (
    /* ⚠️ aria-hidden, AND THE DOMAIN IS ALWAYS BESIDE IT. The badge is a
       second, weaker encoding of a name that is already written out in full
       next to it — announcing "S" before "summitroofing.com" would be noise. */
    <span
      aria-hidden="true"
      className={`relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg text-xs font-semibold ${tintFor(
        domain,
      )} ${className}`}
    >
      {initialFor(domain)}
      {!failed && (
        /*
          Layered over the letter rather than swapped for it, so there is no
          gap while it loads and no reflow when it arrives.

          A plain <img>, not next/image: this is a 16px icon from an arbitrary
          domain proxied through our own route, which is exactly the case
          next/image's optimiser adds cost to and gains nothing on — and it
          would need every competitor domain in remotePatterns, which is not
          knowable ahead of time.

          onError covers the 204 (no icon found) and anything that arrives
          undecodable; both mean the same thing here — keep the letter.
        */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/favicon?d=${encodeURIComponent(domain)}`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full bg-white object-contain p-0.5"
        />
      )}
    </span>
  );
}

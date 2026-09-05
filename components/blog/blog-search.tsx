'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SearchEntry } from '@/lib/blog/search-index';

/*
  The archive's search box, and the grid it filters.

  ⚠️ THE CARDS ARRIVE AS PROPS, ALREADY RENDERED. This component must never
  import PostCard. PostCard imports formatPostDate from lib/blog/posts.ts, and
  that module imports all 22 MDX posts — so importing it into a client component
  would pull the entire blog corpus into the browser bundle. That is 154KB of
  prose, and avoiding it is the whole reason the index below is 7KB.

  React elements rendered on the server can be passed to a client component as
  props, and they stay server-rendered. So this receives opaque nodes it can
  show or hide, plus the small index it matches against, and never sees a post.

  ⚠️ NO useSearchParams(), AND NO searchParams PROP EITHER — BOTH HAVE A COST
  THIS PAGE WILL NOT PAY.

    - The hook "opts the whole subtree into a Suspense boundary", which is the
      reason app/(app)/dashboard/audit/page.tsx and .../faqs/page.tsx both read
      their params on the server instead.
    - The server prop is worse here: Next's production checklist says it "will
      opt the entire route into Dynamic Rendering", and the archive is a
      marketing page that should stay prerendered on a CDN.

  So the query is read from window.location once, on mount, and written back
  with history.replaceState. No hook, no boundary, no dynamic route.

  ⚠️ THE CONSEQUENCE, WHICH IS ACCEPTED RATHER THAN OVERLOOKED: a deep link to
  /blog?q=schema paints every post for one frame before this filters.

  With JavaScript off it stays unfiltered AND the box stays empty — measured,
  not assumed: arriving from a post's search form at /blog?q=pricing renders all
  22 cards with this input reading "". Seeding it server-side would mean taking
  the searchParams prop, which is the dynamic-rendering cost this whole design
  exists to avoid. So a no-JS reader gets the full archive rather than a filtered
  one. Nothing is broken; nothing is filtered either.
*/

export function BlogSearch({
  header,
  index,
  cards,
}: {
  /**
   * The page masthead, rendered on the server and passed in so the search box
   * can sit beside it on a wide screen.
   *
   * ⚠️ IT COMES IN AS A NODE FOR THE SAME REASON THE CARDS DO — this component
   * is on the client, and the masthead is server markup. Rebuilding it here
   * would be a second copy of an h1 whose size is measured.
   */
  header: ReactNode;
  index: SearchEntry[];
  /** Server-rendered PostCards, keyed by slug. Never constructed here. */
  cards: { slug: string; node: ReactNode }[];
}) {
  const [query, setQuery] = useState('');

  /* Read the incoming ?q= once. Not during render — that would differ between
     the server pass (no window) and the client one, which is a hydration
     mismatch on a page that is otherwise identical on both. */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setQuery(q);
  }, []);

  /* Keep the address bar honest so a filtered archive can be linked and the
     back button behaves. replaceState rather than push: typing eight characters
     should not put eight entries in the reader's history. */
  useEffect(() => {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set('q', query.trim());
    else url.searchParams.delete('q');
    window.history.replaceState(null, '', url);
  }, [query]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null; // null means "no filter", distinct from "no results"
    /* Every word must appear somewhere in the haystack, in any order — so
       "schema blog" finds the post whether or not those words are adjacent.
       With 22 entries this is instant and needs no scoring. */
    const words = needle.split(/\s+/);
    return new Set(
      index.filter((e) => words.every((w) => e.text.includes(w))).map((e) => e.slug),
    );
  }, [index, query]);

  const shown = matches ? cards.filter((c) => matches.has(c.slug)) : cards;

  return (
    <>
      {/*
        ⚠️ TWO COLUMNS FROM lg: ONLY, AND items-end IS THE POINT. The masthead is
        a badge, a chipped h1 and a paragraph; the search is one field. Aligning
        their tops would hang the box in space beside a three-line block, so they
        meet on the baseline instead.

        ⚠️ NO mx-auto ON EITHER SIDE. The masthead's own note in
        app/(marketing)/blog/page.tsx explains it: a centred 736px block inside
        this 1152px column sits inset from the first tile, so "the eye lands on
        two different left edges". justify-between keeps the headline hard left
        with the grid beneath it, and pushes the field to the right margin.

        Below lg they stack in source order — headline, then search, then grid —
        which is what the page did before it had two columns.
      */}
      <div className="lg:flex lg:items-end lg:justify-between lg:gap-12">
        {header}

        <div className="mt-8 shrink-0 lg:mt-0 lg:w-72">
          <label htmlFor="blog-search" className="sr-only">
            Search posts
          </label>
          <input
            id="blog-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts…"
            className="border-line focus:border-primary text-navy shadow-soft h-12 w-full max-w-md rounded-input border bg-white px-4 text-[0.9375rem] outline-none transition-colors duration-150 lg:max-w-none"
          />

          {/*
            ⚠️ THE COUNT IS ANNOUNCED, NOT JUST SHOWN. Filtering a grid changes
            the page silently for anyone not watching it — a screen reader user
            types and hears nothing. aria-live turns the result into something
            said out loud. It is rendered even when empty so the region exists
            before it has anything to announce; a live region inserted at the
            same moment as its text is frequently missed.

            ⚠️ min-h-5 SO THE ROW DOES NOT JUMP. Empty, this still occupies its
            line — otherwise the first keystroke would shift the field up by the
            height of one line of text, on a baseline shared with the headline.
          */}
          <p aria-live="polite" className="text-slate mt-2.5 min-h-5 text-sm">
            {matches ? `${shown.length} of ${cards.length} posts` : ''}
          </p>
        </div>
      </div>

      {shown.length > 0 ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <div key={c.slug}>{c.node}</div>
          ))}
        </div>
      ) : (
        <div className="border-line mt-8 rounded-xl border border-dashed p-10 text-center">
          <h2 className="text-xl">Nothing matches “{query.trim()}”</h2>
          <p className="text-slate mx-auto mt-3 max-w-sm text-[0.9375rem] leading-relaxed">
            Search covers post titles, summaries and the questions each one answers. Try a shorter
            phrase.
          </p>
          {/* A dead end needs a way out that is not the back button. */}
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-primary hover:text-primary-hover mt-5 text-sm font-semibold transition-colors duration-150"
          >
            Show all {cards.length} posts
          </button>
        </div>
      )}
    </>
  );
}

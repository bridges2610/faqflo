import { Button } from '@/components/ui/button';

/*
  Search the archive, from the bottom of a post.

  ⚠️ A PLAIN GET FORM, AND IT SHOULD STAY ONE — the same call
  components/marketing/start-form.tsx makes, for the same reason. `method="get"`
  serialises the field into the query string and the browser navigates to
  /blog?q=… by itself: no state, no fetch, no 'use client', and therefore no
  hydration on a page that is otherwise static prose. This hands a value to the
  next page, which a link with a field in it already does.

  It also means search still works here with JavaScript disabled. The archive's
  own box is a client filter and cannot make that promise; this one can, and it
  costs nothing to keep.

  ⚠️ THE ARCHIVE PICKS THE QUERY UP ON MOUNT. BlogSearch reads window.location
  once when it hydrates, so arriving from here lands on a filtered archive
  rather than merely a URL that mentions the query. If that ever stops being
  true, this form silently becomes a link to an unfiltered page.
*/
/*
  ⚠️ CENTRED, UNLIKE EVERYTHING ABOVE IT. The article and the author bio are
  left-aligned prose in a reading measure; this is not prose, it is the way out
  of the page. Centring is what separates it from the column it follows — the
  same job the rule above it does, done twice.
*/
export function PostSearchForm() {
  return (
    <section className="border-line mt-14 border-t pt-10 text-center">
      <h2 className="text-xl">Looking for something else?</h2>
      <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">
        Search the archive by title, summary, or the questions a post answers.
      </p>

      {/* mx-auto centres the row itself; text-left stops the placeholder
          inheriting the centring above and sitting in the middle of the field. */}
      <form
        action="/blog"
        method="get"
        className="mx-auto mt-5 flex max-w-md flex-col gap-3 text-left sm:flex-row"
      >
        <label htmlFor="post-search" className="sr-only">
          Search posts
        </label>
        <input
          id="post-search"
          type="search"
          name="q"
          required
          placeholder="schema, pricing, robots.txt…"
          className="border-line focus:border-primary text-navy shadow-soft h-12 min-w-0 rounded-input border bg-white px-4 text-[0.9375rem] outline-none transition-colors duration-150 sm:flex-1"
        />
        {/* No `arrow`: this searches rather than advances, and the arrow reads
            as "next" everywhere else on the site. */}
        <Button type="submit">Search</Button>
      </form>
    </section>
  );
}

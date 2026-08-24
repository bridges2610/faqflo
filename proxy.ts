import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/*
  Session refresh, and an optimistic redirect.

  Two jobs, and it is important they stay small.

  1. Refresh the auth token and write the new cookies onto the response. Server
     Components cannot set cookies, so if this does not happen here it does not
     happen at all, and sessions quietly stop renewing.

  2. Send signed-out traffic away from the dashboard and signed-in traffic away
     from the sign-in pages. This is a redirect for the benefit of the person
     browsing — it is NOT the security boundary.

  ⚠️ Why it cannot be the boundary, from Next's own proxy docs:

     "Server Functions are not separate routes in this chain. They are handled
      as POST requests to the route where they are used, so a Proxy matcher
      that excludes a path will also skip Server Function calls on that path.
      A matcher change or a refactor that moves a Server Function to a
      different route can silently remove Proxy coverage. Always verify
      authentication and authorization inside each Server Function rather than
      relying on Proxy alone."

  So every route handler and every action re-checks for itself through
  lib/auth/dal.ts. This file is a courtesy; that file is the gate.

  Next 16 renamed this convention from `middleware.ts`, and the export from
  `middleware` to `proxy`. It runs on the Node.js runtime and that is not
  configurable — setting `runtime` here throws.
*/

/** Signed out, these redirect to sign-in. */
const PROTECTED = ['/dashboard'];

/** Signed in, these redirect to the dashboard — you are already through. */
const AUTH_ONLY = ['/sign-in', '/sign-up', '/forgot-password'];

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  /*
    Unconfigured Supabase must not take the site down.

    Without this, a missing env var turns every request — including the
    marketing pages and the free audit, which need no account at all — into a
    500. Failing open here is safe precisely because this file is not the
    boundary: the DAL still refuses, so a misconfigured deploy gets a working
    marketing site and a dashboard that won't let anyone in.
  */
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Onto the request, so anything rendering downstream in THIS pass sees
        // the refreshed token rather than the stale one.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        // And onto the response, so the browser keeps them.
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }

        /*
          The headers the library hands us are Cache-Control: no-store and
          friends. They are not optional: a response that sets an auth cookie
          and gets cached by a CDN serves one person's session to the next
          person who asks. This is the only place in the app with a response
          object to put them on.
        */
        for (const [header, value] of Object.entries(headers)) {
          response.headers.set(header, value);
        }
      },
    },
  });

  /*
    getClaims(), not getSession().

    Supabase is explicit that getSession() must never be trusted in server
    code: it reads the cookie without guaranteeing the token is still valid.
    getClaims() verifies the JWT — locally against the project's signing keys
    where it can — and refreshes an about-to-expire session as a side effect,
    which is job 1 above.
  */
  /*
    ⚠️ This definition of "signed in" is shared with lib/auth/dal.ts and the
    two must not drift.

    A valid token, and nothing else. It cannot be more than that — the docs are
    clear that proxy runs on every request including prefetches and must not do
    database work. So the DAL is the one that has to match, and it does.

    They disagreed once: the DAL additionally required a `profiles` row, so an
    account without one was "signed in" here and "signed out" there. Every
    request then ping-ponged — the DAL redirected to /sign-in, this file
    redirected back to /dashboard — until the browser gave up with
    ERR_TOO_MANY_REDIRECTS. If a future check is added on either side, add it
    to both or to neither.
  */
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const path = request.nextUrl.pathname;

  if (!signedIn && PROTECTED.some((p) => path.startsWith(p))) {
    /*
      Where they were headed, INCLUDING the query string.

      This used to send only `path`. Two things went wrong with that, and the
      second is why it was invisible: clone() carries the original params over
      to the sign-in URL, so `/dashboard/start?domain=acme.com` became
      `/sign-in?domain=acme.com&next=/dashboard/start` — the domain was still on
      screen, and still lost the moment sign-in redirected. The visitor was then
      asked for a web address they had already typed on the home page.

      So: capture the search before clearing it, clear it so the sign-in URL
      carries nothing it doesn't need, and put the whole destination in `next`.
      safeNext() in lib/auth/origin.ts permits a query string and still refuses
      anything that isn't a same-origin path, so this widens no hole.
    */
    const destination = path + request.nextUrl.search;
    const target = request.nextUrl.clone();

    /*
      Which form they meet depends on why they are here.

      ⚠️ THE LIST CHANGED WITH THE PLANS, AND IT IS THE MARKETING CTAs THAT
      DECIDE IT. It used to be `/dashboard/checkout/*` alone, because buying was
      the only new-customer action and everything else was a returning customer
      with a bookmark. The two destinations the home page now sends strangers to
      are `/dashboard/start` (the free check, carrying ?domain= from the home
      page audit) and `/dashboard/plan` (the Pro card's CTA) — so both show the
      form that creates an account. Everything else — a bookmarked
      /dashboard/audit, a link from an email — is somebody who wants back in.

      ⚠️ Keep this in step with the hrefs in components/marketing/*. A CTA
      pointing at a path missing from this list shows a stranger a sign-in form,
      which is the highest-friction possible answer to "I'd like to try this".

      Both pages link to each other carrying `next`, so guessing wrong costs a
      click rather than the signup.
    */
    const SIGNUP_FIRST = ['/dashboard/start', '/dashboard/plan', '/dashboard/checkout/'];
    target.pathname = SIGNUP_FIRST.some((p) => path.startsWith(p)) ? '/sign-up' : '/sign-in';
    target.search = '';
    target.searchParams.set('next', destination);
    return NextResponse.redirect(target);
  }

  if (signedIn && AUTH_ONLY.some((p) => path.startsWith(p))) {
    const target = request.nextUrl.clone();
    target.pathname = '/dashboard';
    target.search = '';
    return NextResponse.redirect(target);
  }

  return response;
}

export const config = {
  /*
    Without a matcher this runs on every asset request — the docs warn that
    "auth logic or redirects can unintentionally block CSS, JS, or images".

    `api` is excluded because those routes authenticate themselves through the
    DAL and a redirect is the wrong answer for a fetch: an API caller wants a
    401 it can read, not an HTML sign-in page with a 200 on it.

    ⚠️ sitemap.xml, robots.txt and llms.txt are excluded for a different reason:
    they are for crawlers, which never carry a session. Left in, every crawl of
    those three files would open a Supabase session lookup to decide a redirect
    that can never apply — latency and a database round trip on the three URLs
    most likely to be hit by automated traffic.
  */
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|icon.svg|sitemap.xml|robots.txt|llms.txt|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)',
  ],
};

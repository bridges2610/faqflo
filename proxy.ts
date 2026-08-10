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
    const target = request.nextUrl.clone();
    target.pathname = '/sign-in';
    // So the sign-in page can send them back where they were headed.
    target.searchParams.set('next', path);
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
  */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|gif|webp|svg)$).*)'],
};

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/*
  "Sign in" or "Dashboard", decided in the browser.

  ⚠️ WHY NOT ON THE SERVER, WHERE IT WOULD BE SIMPLER.

  The marketing pages are `○ Static` — prerendered once at build time and
  served from a CDN. Reading the session on the server would make them dynamic,
  turning every visit to the page this product exists to rank into a function
  invocation, for a cosmetic detail that only affects people who have already
  signed up. The trade goes the other way: keep the page static, resolve this
  one link client-side.

  ⚠️ AND THIS IS COSMETIC. IT IS NOT A PERMISSION.

  A nav that says "Dashboard" grants nothing. proxy.ts still redirects a
  signed-out visitor away from /dashboard, and lib/auth/dal.ts still refuses on
  the server. If this component were tricked into the wrong state — an expired
  token it cannot see is expired, say — the worst outcome is a link that
  bounces someone to /sign-in, which is where they were going anyway.
*/

type State = 'unknown' | 'in' | 'out';

export function NavAccountLink() {
  /*
    Starts 'unknown', and only moves inside the effect.

    That is deliberate, not laziness: the server prerenders 'unknown', so the
    first client render has to agree or React reports a hydration mismatch.
    Reading document.cookie during render would be faster and wrong.
  */
  const [state, setState] = useState<State>('unknown');

  useEffect(() => {
    const supabase = createClient();
    let live = true;

    // Answers from the cookie, not the network — see lib/supabase/client.ts.
    supabase.auth.getSession().then(({ data }) => {
      if (live) setState(data.session ? 'in' : 'out');
    });

    // Keeps the nav honest when the session changes somewhere else: signing
    // out in another tab, or a token expiring while this page sits open.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (live) setState(session ? 'in' : 'out');
    });

    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /*
    A fixed minimum width on ALL THREE states, wide enough for the longer
    label. That is what stops the button beside this reflowing when the state
    settles — the box never changes size, only what is inside it.

    The placeholder is deliberately EMPTY rather than the word "Dashboard" made
    invisible. Invisible text would still be in the prerendered HTML that the
    CDN serves to everyone, including crawlers, and hidden keyword text in a
    nav is a bad look on the page this product exists to make rank. Reserving
    the space costs the same and says nothing.
  */
  const className =
    'text-slate hover:text-primary inline-block min-w-18 text-sm font-medium transition-colors duration-150';

  if (state === 'unknown') {
    return <span className={className} aria-hidden="true" />;
  }

  return state === 'in' ? (
    <Link href="/dashboard" className={className}>
      Dashboard
    </Link>
  ) : (
    <Link href="/sign-in" className={className}>
      Sign in
    </Link>
  );
}

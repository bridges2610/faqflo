import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseEnv } from './env';

/**
 * Supabase on the server — Server Components, Route Handlers, Server Actions.
 *
 * A fresh client per call, never shared. The package is explicit: "Always
 * create a new client with this function for each server render — never share
 * a client across requests." A shared client would leak one request's session
 * into another's, which on a server rendering for many users is the worst bug
 * available.
 *
 * `cookies()` is awaited because Next 16 removed synchronous access to it
 * entirely — the 15-era fallback is gone, not merely deprecated.
 */
export async function createClient() {
  const { url, key } = supabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        /*
          Server Components cannot set cookies — HTTP does not allow it once
          streaming has begun — so this throws there and is expected to. It is
          safe to swallow only because proxy.ts refreshes the session on every
          request and writes the result back itself. If the proxy is ever
          removed or its matcher stops covering a route, sessions on that route
          will expire and not renew, and it will look like random logouts.

          The `headers` argument the library passes here (the no-store set that
          stops a CDN caching one user's session cookie for another) is
          deliberately not used: there is no response object to put it on from
          this context. proxy.ts applies it where there is one.
        */
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component. See above.
        }
      },
    },
  });
}

'use client';

import { createBrowserClient } from '@supabase/ssr';
import { supabaseEnv } from './env';

/**
 * Supabase in the browser.
 *
 * No `cookies` option: in a browser runtime the client falls back to
 * `document.cookie`, which is what we want. The package's own docs are blunt
 * that a half-configured custom cookie store causes "random logouts, early
 * session termination or problems with inconsistent state" — so the right
 * amount of configuration here is none.
 *
 * Called per component rather than module-scoped. `createBrowserClient` is a
 * singleton internally, so this is cheap, and a module-level client would be
 * constructed during the server pass of a Client Component — before the env
 * check can produce a useful error.
 */
export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}

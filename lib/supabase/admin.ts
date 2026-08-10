import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { supabaseEnv } from './env';

/**
 * The service-role Supabase client. ⚠️ THIS BYPASSES ROW-LEVEL SECURITY.
 *
 * Every other client in this codebase acts as a signed-in user and is bound by
 * the policies in supabase/migrations/. This one is not bound by anything. It
 * can read and write every row of every table for every account.
 *
 * It exists for exactly one reason: entitlements. `sites.get_cited_at` and
 * `profiles.subscription` have no UPDATE grant for `authenticated`, precisely
 * so that a browser cannot promote itself — which means something has to be
 * able to write them when a payment succeeds, and that something is this.
 *
 * Rules, and none of them are stylistic:
 *
 *   1. `server-only` above. If this ever reaches a client bundle the key is
 *      published, and the key is total access to the database.
 *   2. SUPABASE_SERVICE_ROLE_KEY must NEVER gain a NEXT_PUBLIC_ prefix. That
 *      prefix is what inlines a value into the browser bundle.
 *   3. Import it from Stripe webhook/checkout code and nowhere else. If a
 *      route needs data on behalf of a user, use lib/supabase/server.ts and
 *      let RLS do its job — reaching for this instead turns a policy bug into
 *      a data breach rather than an error message.
 *   4. Never filter by a user id taken from a request body. RLS is not there
 *      to catch the mistake any more; the `eq()` in your query IS the boundary.
 *
 * `persistSession: false` because there is no session to persist: this client
 * is not a user, and storing tokens for it would only create somewhere for
 * them to leak from.
 */
export function createAdminClient() {
  const { url } = supabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured. It is required for Stripe fulfilment — see .env.example. Project Settings → API → service_role. Never expose it to the browser.',
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

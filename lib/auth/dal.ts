import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { ProfileRow, SiteRow } from '@/lib/supabase/types';

/**
 * The data access layer — where authentication is actually decided.
 *
 * proxy.ts redirects people who obviously shouldn't be somewhere, but it can't
 * be trusted as the boundary: Next's docs warn that a matcher change or moving
 * a Server Function to another route "can silently remove Proxy coverage", and
 * that a layout returning null doesn't stop its segments rendering either. So
 * nothing is protected by where it sits in the tree. Everything that reads or
 * writes a customer's data calls into this file first.
 *
 * Wrapped in React's `cache()` so a page, its layout and three components can
 * each ask independently within one request and cause one round trip. The
 * cache is per-request; there is no cross-request sharing to leak.
 */

/**
 * Who is asking, or null.
 *
 * `getClaims()` rather than `getSession()`: Supabase is explicit that
 * getSession() must not be trusted server-side because it reads the cookie
 * without verifying the token is still valid. getClaims() verifies the JWT.
 * Trusting the unverified one here would mean a forged cookie is a login.
 */
export const currentUser = cache(async (): Promise<ProfileRow | null> => {
  /*
    An unconfigured Supabase means nobody is signed in.

    Returning null rather than letting the missing-env error propagate, because
    the direction of the failure matters: null fails CLOSED — every gate reads
    it as "no session" and refuses — whereas a thrown error turns a route that
    should answer 401 into a 500, and turns the marketing pages that merely
    happen to ask into a broken site. There is no configuration state in which
    this returns a user it shouldn't.
  */
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return null;
  }

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  /*
    ⚠️ INVARIANT: a verified token means signed in, here and in proxy.ts.

    Past this line every return is a user. That is not a nicety — it is what
    stops the two layers fighting. proxy.ts decides "signed in" from the JWT
    alone (it must: the docs are explicit that proxy should not do database
    work). If this function used a stricter test, the two would disagree, and a
    request would bounce between them forever:

      /dashboard  -> proxy: signed in, allow
                  -> requireUser(): not signed in, redirect /sign-in
      /sign-in    -> proxy: signed in, redirect /dashboard   ... and around

    That is exactly what happened: this used to return null when the `profiles`
    row was missing, and any account created before the signup trigger existed
    hit an infinite redirect. The mistake was treating missing application data
    as a failure of AUTHENTICATION. Identity is the token's answer; the profile
    row is data *about* that identity.
  */
  const profile = await loadOrCreateProfile(supabase, claims);
  if (profile) return profile;

  /*
    The row could not be read or written — RLS, a race, a network blip.

    Still a signed-in user, built from the verified token. Entitlements fail
    CLOSED: 'none' is the free tier, so the worst case is someone not seeing
    what they paid for, which is recoverable and visible. The alternative —
    returning null — is the loop above.
  */
  return fromClaims(claims);
});

/** The name to show, in the order the sources are trustworthy. */
function displayName(claims: Record<string, unknown>): string {
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const email = typeof claims.email === 'string' ? claims.email : '';

  for (const candidate of [meta.full_name, meta.name]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return email ? email.split('@')[0] : 'Account';
}

/** A user with no stored profile: identity real, entitlements at the free default. */
function fromClaims(claims: Record<string, unknown>): ProfileRow {
  return {
    id: String(claims.sub),
    name: displayName(claims),
    email: typeof claims.email === 'string' ? claims.email : '',
    subscription: 'none',
    subscription_since: null,
    created_at: new Date().toISOString(),
  };
}

/**
 * Read the profile, and write one if it is missing.
 *
 * The signup trigger creates this row for everyone who signs up from now on.
 * It cannot help anyone who already existed when the trigger was added — a
 * trigger fires on insert and there is no going back — so this repairs those
 * accounts on their next request instead of leaving them permanently broken.
 *
 * The insert can only set id, email and name; `subscription` has no grant and
 * takes its column default of 'none'. So this heals an account without ever
 * being able to promote one.
 */
async function loadOrCreateProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  claims: Record<string, unknown>,
): Promise<ProfileRow | null> {
  const userId = String(claims.sub);

  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle<ProfileRow>();

  if (existing) return existing;

  const { data: created } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      email: typeof claims.email === 'string' ? claims.email : '',
      name: displayName(claims),
    })
    .select()
    .maybeSingle<ProfileRow>();

  return created ?? null;
}

/**
 * Who is asking. Sends them to sign in if the answer is nobody.
 *
 * For pages and layouts. API routes should use `currentUser()` and return
 * their own 401 — an HTML redirect is a confusing answer to a `fetch`.
 */
export async function requireUser(): Promise<ProfileRow> {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  return user;
}

/**
 * A site, but only if it belongs to whoever is asking.
 *
 * This is the check that closes the real hole. Before this, the content route
 * took a `domain` straight from the request body and audited whatever it was
 * given; the audit route took a page budget from the body and believed it.
 * Ownership has to be proved server-side, from the row, every time.
 *
 * Row-level security means the query cannot return somebody else's site even
 * if this filter were wrong — belt and braces, deliberately.
 */
export const siteForUser = cache(
  async (siteId: string, userId: string): Promise<SiteRow | null> => {
    if (!siteId) return null;

    const supabase = await createClient();
    const { data } = await supabase
      .from('sites')
      .select('*')
      .eq('id', siteId)
      .eq('user_id', userId)
      .maybeSingle<SiteRow>();

    return data ?? null;
  },
);

/** Every site the caller owns, newest last — the order the switcher shows. */
export const sitesForUser = cache(async (userId: string): Promise<SiteRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('sites')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  return (data as SiteRow[] | null) ?? [];
});

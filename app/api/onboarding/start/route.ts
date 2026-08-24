import { NextResponse } from 'next/server';
import { currentUser, sitesForUser } from '@/lib/auth/dal';
import { isPro } from '@/lib/auth/entitlements';
import { normalizeDomain } from '@/lib/dashboard/domain';
import { canAddSite, SITE_CAP } from '@/lib/dashboard/plans';
import { enqueueScan, hasScanned } from '@/lib/scan/enqueue';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SiteRow } from '@/lib/supabase/types';

/*
  Getting a new account off the ground: make the site, start the first check.

  ⚠️ THIS WAS /api/checkout/start AND IT NO LONGER TOUCHES STRIPE. It used to be
  the pricing page's buy button — work out which site the $129 was for, creating
  the row if the domain the visitor scanned on the home page had not been saved
  yet, then hand over to createCheckoutSession(). Free signup replaced the
  purchase, so the half that resolved a site survives and the half that charged
  for it is gone. Buying Pro is /api/stripe/checkout, which needs no site at all.

  The first check runs here rather than at payment, which is the whole free
  tier: somebody who signs up lands on a dashboard that already knows their
  score, their questions, and whether anyone is citing them.

  ⚠️ POST, and only POST. This creates database rows and spends money on a crawl
  and an Opus call, and the entry point is a page a browser may prefetch. As a
  GET this would scan a site every time somebody's mouse crossed a link.
*/

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return fail('Sign in first.', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.', 400);
  }

  const { domain: rawDomain, siteId } = (body ?? {}) as Record<string, unknown>;

  try {
    const site = await resolveSite(user.id, rawDomain, siteId);
    if ('error' in site) return fail(site.error, site.status);

    /*
      Already checked once, and not paying. Not an error worth a red screen —
      this is the normal result of a refresh, a back button, or a second visit
      to a link that still carries ?domain=. Send them to what they already have.
    */
    if (!isPro(user) && (await hasScanned(site.row.id))) {
      return NextResponse.json({ url: '/dashboard', alreadyChecked: true });
    }

    const result = await enqueueScan(site.row.id, user.id);
    if (!result.ok) {
      // The database's own words. The alternative — "something went wrong" — is
      // what made the original version of this failure take a probe to diagnose.
      return fail(`We couldn't start your check. ${result.error}`, 502);
    }

    return NextResponse.json({ url: '/dashboard/start', siteId: site.row.id });
  } catch (err) {
    console.error('Unexpected onboarding error:', err);
    return fail('Something went wrong setting up your site. Please try again.', 500);
  }
}

type Resolved = { row: SiteRow } | { error: string; status: number };

/**
 * Which site is being set up.
 *
 * Three ways in, in order of how much the caller already knows:
 *
 *   siteId  — they picked one from their existing sites.
 *   domain  — carried from the home page scan, may or may not exist yet.
 *   neither — the one site they have, or nothing to do.
 */
async function resolveSite(userId: string, rawDomain: unknown, siteId: unknown): Promise<Resolved> {
  const sites = await sitesForUser(userId);

  if (typeof siteId === 'string' && siteId) {
    const picked = sites.find((s) => s.id === siteId);
    // 404 rather than 403 — confirming an id exists but belongs to someone
    // else answers a question that isn't ours to answer.
    if (!picked) return { error: 'No such site on your account.', status: 404 };
    return { row: picked };
  }

  if (typeof rawDomain !== 'string' || !rawDomain.trim()) {
    // No domain and one site already: that is the site. This is the refresh
    // case, and asking "which site?" of someone who only has one is a dead end.
    if (sites.length === 1) return { row: sites[0] };
    return { error: 'Which website is this for?', status: 400 };
  }

  const domain = normalizeDomain(rawDomain);
  if (!domain.includes('.')) {
    return { error: "That doesn't look like a web address.", status: 400 };
  }

  /*
    Find before create. Someone who scanned the same domain twice, or who came
    back to a link they had bookmarked, must land on the SAME row — otherwise
    they end up with two copies of their site and the cap refuses the second.

    The (user_id, domain) unique index is what makes that reliable rather than
    merely likely: two tabs racing here both check, both miss, and one loses
    the insert. Catching 23505 and re-reading is the only version of this that
    is correct under concurrency.
  */
  const existing = sites.find((s) => s.domain === domain);
  if (existing) return { row: existing };

  /*
    ⚠️ THE SITE CAP, ENFORCED SERVER-SIDE.

    lib/dashboard/store.ts refuses past SITE_CAP too, but that runs in the
    browser and only covers the Sites form. This is the funnel every new account
    comes through, and it is reachable with a ?domain= in the address bar. An
    account that could add sites here would get a fresh free scan for each one.
  */
  if (!canAddSite(sites.length)) {
    return {
      error:
        SITE_CAP === 1
          ? 'You can track one website per account. Change it on the Sites page.'
          : `You can track up to ${SITE_CAP} websites per account.`,
      status: 409,
    };
  }

  return createSiteRow(userId, domain);
}

/**
 * Insert the site, tolerating the race.
 *
 * Uses the service-role client rather than the user's own. Not to bypass a
 * policy — a signed-in user may insert their own site — but because this runs
 * in a route handler with no browser session to borrow, and `user_id` is set
 * from the verified session id rather than anything in the request body.
 */
async function createSiteRow(userId: string, domain: string): Promise<Resolved> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('sites')
    // The name is the domain until they rename it. Asking someone to name
    // their own business before they have seen anything is a form to fill in
    // between arriving and getting the thing they came for.
    .insert({ user_id: userId, name: domain, domain })
    .select()
    .single<SiteRow>();

  if (!error && data) return { row: data };

  // 23505 — the other tab won. Its row is the right one.
  if (error?.code === '23505') {
    const { data: won } = await supabase
      .from('sites')
      .select('*')
      .eq('user_id', userId)
      .eq('domain', domain)
      .maybeSingle<SiteRow>();

    if (won) return { row: won };
  }

  throw new Error(`Failed to create site for ${domain}: ${error?.message ?? 'no row returned'}`);
}

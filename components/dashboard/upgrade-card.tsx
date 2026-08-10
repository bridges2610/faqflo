'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ENTITLEMENTS,
  canBuyStayCited,
  getCitedExpired,
  type EntitlementId,
} from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { LockIcon } from './nav-icons';

/**
 * What a locked feature shows instead of nothing.
 *
 * It names the entitlement, and the entitlement knows its own scope — so a
 * Get Cited lock says "for this site" and a Stay Cited lock doesn't, because
 * one is bought per site and the other covers the account. Getting that wrong
 * in the copy would teach the customer the wrong mental model of what they own.
 */
export function UpgradeCard({
  entitlement,
  title,
  body,
  siteName,
  compact = false,
}: {
  /** What the feature WANTS. What is actually offered can differ — see below. */
  entitlement: EntitlementId;
  title: string;
  body: string;
  /** Named when the entitlement is per-site, so the scope is unambiguous. */
  siteName?: string;
  compact?: boolean;
}) {
  const { site, user, data } = useDashboard();

  /*
    ⚠️ THE ONE PLACE THE EXPIRED CASE IS HANDLED.

    Five call sites ask for `get_cited` when a generating feature is locked.
    For a site whose 30-day window has CLOSED that is the wrong offer twice
    over: they already bought Get Cited, and checkPurchasable() 409s on a
    second purchase — so the button would simply fail. What they actually need
    is Stay Cited.

    Deciding it here rather than at each call site means the five never have to
    know about the window, and there is one branch to get right instead of five.
  */
  const expired = getCitedExpired(site, user);
  const offered: EntitlementId = expired ? 'stay_cited' : entitlement;

  const target = ENTITLEMENTS[offered];
  const scopeLine =
    target.scope === 'site'
      ? `Unlocks this for ${siteName ?? 'this site'} — bought once, not a subscription.`
      : expired
        ? 'Picks up where Get Cited left off, across every site on your account.'
        : 'Covers every site on your account, for as long as you keep it running.';

  /*
    Stay Cited follows Get Cited — enforced in app/api/stripe/checkout/route.ts,
    mirrored here so the button is never one that will 409. An account with no
    set-up site is sent to buy the thing that comes first.
  */
  const orderBlocked = offered === 'stay_cited' && data !== null && !canBuyStayCited(data.sites);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setError(null);
    setBusy(true);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        /*
          `offered`, not `entitlement` — an expired site is being sold Stay
          Cited, and posting what the FEATURE wanted would ask Stripe for a
          second Get Cited on a site that already has one. That comes back 409.

          The site id comes from context rather than a prop. All five call
          sites already render inside the selected site's workspace, so asking
          each to pass an id it already has would be five chances to pass the
          wrong one — and Get Cited is bought per site, so buying it for the
          site that isn't on screen is the mistake worth designing out.
        */
        body: JSON.stringify(
          offered === 'get_cited'
            ? { product: 'get_cited', siteId: site?.id }
            : // Monthly is the default here; switching to annual is one click
              // inside Stripe's portal afterwards, so this doesn't need to be
              // a decision made twice.
              { product: 'stay_cited', period: 'monthly' },
        ),
      });

      // `payload`, not `data` — `data` is the dashboard snapshot from context
      // in this scope, and shadowing it here would be a quiet trap for whoever
      // edits this function next.
      const payload = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !payload.url) {
        setError(payload.error ?? 'Could not start checkout. Please try again.');
        setBusy(false);
        return;
      }

      // Leave `busy` set: the browser is navigating to Stripe, and flipping
      // the button back to idle mid-navigation invites a second click and a
      // second checkout session.
      window.location.href = payload.url;
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  // A per-site purchase with no site selected has nothing to buy.
  const canBuy = (offered !== 'get_cited' || Boolean(site)) && !orderBlocked;

  /*
    Expired is not the same lock as never-bought, and saying so matters: this
    customer has already paid us $129 and is looking at a feature that worked
    yesterday. Silently swapping the price tag without explaining why reads as
    a bait-and-switch.
  */
  const heading = expired ? 'Your Get Cited window has ended' : title;
  const explain = expired
    ? `Everything already made for ${siteName ?? 'this site'} stays yours — the audit, the answers, the export. Stay Cited is what keeps new ones coming.`
    : body;

  return (
    <Card tone="cloud" className={compact ? 'p-5' : 'p-7'}>
      <div className="flex gap-4">
        <span className="bg-accent-soft text-teal-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
          <LockIcon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base leading-snug">{heading}</h3>
          <p className="text-slate mt-1.5 text-sm leading-relaxed">{explain}</p>
          <p className="text-slate mt-3 text-sm">
            <span className="text-navy font-semibold">{target.label}</span> · {target.price}
          </p>
          <p className="text-slate mt-1 text-xs leading-relaxed">{scopeLine}</p>

          {orderBlocked ? (
            <p className="text-slate mt-4 text-sm leading-relaxed">
              Get Cited comes first — Stay Cited watches whether the answers it writes are being
              picked up, so there needs to be a set-up site for it to watch.
            </p>
          ) : (
            <Button size="sm" className="mt-4" onClick={buy} disabled={busy || !canBuy}>
              {busy ? 'Taking you to checkout…' : `Get ${target.label} · ${target.price}`}
            </Button>
          )}

          {error && (
            <p role="alert" className="text-error-ink mt-3 text-sm">
              {error}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

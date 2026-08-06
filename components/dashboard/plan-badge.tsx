'use client';

import { Badge } from '@/components/ui/badge';
import { useDashboard } from '@/lib/dashboard/provider';
import { hasGetCited, hasStayCited } from '@/lib/dashboard/plans';

/** What this account and this site are entitled to, at a glance. */
export function PlanBadge() {
  const { user, site } = useDashboard();

  if (hasStayCited(user)) return <Badge tone="cyan">Stay Cited</Badge>;
  if (hasGetCited(site)) return <Badge tone="blue">Get Cited</Badge>;
  return <Badge tone="neutral">Free</Badge>;
}

/**
 * DEV ONLY — toggles the two entitlements so both the unlocked and locked
 * states can be seen without buying anything.
 *
 * ⚠️ DELETE THIS BEFORE LAUNCH, along with its use in app-shell.tsx and the
 * store functions it calls. Once entitlements come from Stripe, a client that
 * can grant its own is a client with no entitlements at all. It exists only
 * because they currently live in localStorage anyway.
 */
export function EntitlementSwitcher() {
  const { user, site, setGetCited, setSubscription } = useDashboard();

  const getCited = hasGetCited(site);
  const stayCited = hasStayCited(user);

  return (
    <div className="border-line bg-cloud flex items-center gap-1 rounded-full border py-1 pr-1 pl-3">
      <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">Dev</span>

      <button
        onClick={() => site && setGetCited(site.id, !getCited)}
        disabled={!site}
        aria-pressed={getCited}
        title="Get Cited is bought per site"
        className={`rounded-full px-2.5 py-1 text-xs transition-all duration-200 disabled:opacity-40 ${
          getCited ? 'text-navy shadow-soft bg-white font-semibold' : 'text-slate hover:text-navy'
        }`}
      >
        Get Cited
      </button>

      <button
        onClick={() => setSubscription(stayCited ? 'none' : 'stay_cited')}
        aria-pressed={stayCited}
        title="Stay Cited is an account subscription"
        className={`rounded-full px-2.5 py-1 text-xs transition-all duration-200 ${
          stayCited ? 'text-navy shadow-soft bg-white font-semibold' : 'text-slate hover:text-navy'
        }`}
      >
        Stay Cited
      </button>
    </div>
  );
}

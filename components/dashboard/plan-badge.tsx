'use client';

import { Badge } from '@/components/ui/badge';
import { useDashboard } from '@/lib/dashboard/provider';
import { getCitedDaysLeft, hasGetCited, hasStayCited } from '@/lib/dashboard/plans';

/*
  EntitlementSwitcher used to live here.

  It was a dev control that toggled Get Cited and Stay Cited from the browser,
  and its own comment said to delete it before launch: "a client that can grant
  its own entitlements is a client with no entitlements at all. It exists only
  because they currently live in localStorage anyway."

  They don't any more. `subscription` and `get_cited_at` are columns the
  `authenticated` role has no UPDATE grant on, so the switcher could not work
  now even if it were still here — and leaving a control that silently failed
  would be worse than not having one. To exercise the paid states in
  development, set the columns directly in the Supabase SQL editor, which is
  also what Stripe's webhook will do.
*/

/**
 * What this account and this site are entitled to, at a glance.
 *
 * Stay Cited is checked first because it is account-wide and outranks the
 * per-site window: a subscriber's sites never expire, so showing a countdown
 * to one would be both wrong and alarming.
 */
export function PlanBadge() {
  const { user, site } = useDashboard();

  if (hasStayCited(user)) return <Badge tone="cyan">Stay Cited</Badge>;

  if (hasGetCited(site)) {
    /*
      The number matters more than the label here. "Get Cited" alone tells
      somebody nothing is wrong right up until the day something is; the count
      is the only warning they get, and it is the difference between an upgrade
      decision made calmly and one made when a feature has already stopped.
    */
    const left = getCitedDaysLeft(site);

    if (left !== null && left <= 0) {
      return <Badge tone="neutral">Get Cited · ended</Badge>;
    }
    return (
      <Badge tone="blue">
        Get Cited{left !== null && left <= 7 ? ` · ${left}d left` : ''}
      </Badge>
    );
  }

  return <Badge tone="neutral">Free</Badge>;
}

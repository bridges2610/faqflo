'use client';

import { Badge } from '@/components/ui/badge';
import { useDashboard } from '@/lib/dashboard/provider';
import { hasGetCited, hasStayCited } from '@/lib/dashboard/plans';

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

/** What this account and this site are entitled to, at a glance. */
export function PlanBadge() {
  const { user, site } = useDashboard();

  if (hasStayCited(user)) return <Badge tone="cyan">Stay Cited</Badge>;
  if (hasGetCited(site)) return <Badge tone="blue">Get Cited</Badge>;
  return <Badge tone="neutral">Free</Badge>;
}

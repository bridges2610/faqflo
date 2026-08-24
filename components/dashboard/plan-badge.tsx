'use client';

import { Badge } from '@/components/ui/badge';
import { useDashboard } from '@/lib/dashboard/provider';
import { isPro } from '@/lib/dashboard/plans';

/*
  EntitlementSwitcher used to live here.

  It was a dev control that toggled entitlements from the browser, and its own
  comment said to delete it before launch: "a client that can grant its own
  entitlements is a client with no entitlements at all. It exists only because
  they currently live in localStorage anyway."

  They don't any more. `profiles.plan` is a column the `authenticated` role has
  no UPDATE grant on, so the switcher could not work now even if it were still
  here — and leaving a control that silently failed would be worse than not
  having one. To exercise Pro in development, set the column directly in the
  Supabase SQL editor, which is also what Stripe's webhook does.
*/

/**
 * What this account is on, at a glance.
 *
 * ⚠️ NO COUNTDOWN STATE ANY MORE, AND ITS ABSENCE IS CORRECT. This badge used to
 * carry "Get Cited · 5d left" and "Get Cited · ended", because a one-time
 * purchase bought a window that expired on a date the customer had no other
 * warning about. A subscription does not expire; it renews or it is cancelled,
 * and Stripe tells them about both. A countdown here would be inventing an
 * anxiety the plan does not have.
 */
export function PlanBadge() {
  const { user } = useDashboard();

  return isPro(user) ? <Badge tone="cyan">Pro</Badge> : <Badge tone="neutral">Free</Badge>;
}

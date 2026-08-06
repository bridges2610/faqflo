'use client';

import { Badge } from '@/components/ui/badge';
import { useDashboard } from '@/lib/dashboard/provider';
import { PLAN_LIMITS } from '@/lib/dashboard/plans';
import type { PlanId } from '@/lib/dashboard/types';

const PLAN_IDS = Object.keys(PLAN_LIMITS) as PlanId[];

/** Read-only plan pill. */
export function PlanBadge() {
  const { plan } = useDashboard();
  return <Badge tone={plan === 'business' ? 'cyan' : 'blue'}>{PLAN_LIMITS[plan].label}</Badge>;
}

/**
 * DEV ONLY — flips the signed-in user between plans so both tiers can be seen
 * without editing a constant.
 *
 * ⚠️ DELETE THIS BEFORE LAUNCH, along with its use in app-shell.tsx. Once plans
 * come from Stripe, the client must never be able to set its own tier; this
 * exists purely because the plan currently lives in localStorage anyway.
 */
export function PlanSwitcher() {
  const { plan, setPlan } = useDashboard();

  return (
    <label className="border-line bg-cloud flex items-center gap-2 rounded-full border py-1 pr-1 pl-3">
      <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">Dev</span>
      <select
        value={plan}
        onChange={(e) => setPlan(e.target.value as PlanId)}
        aria-label="Preview plan (development only)"
        className="text-navy focus:border-primary rounded-full border border-transparent bg-white px-2.5 py-1 text-sm font-semibold outline-none"
      >
        {PLAN_IDS.map((id) => (
          <option key={id} value={id}>
            {PLAN_LIMITS[id].label}
          </option>
        ))}
      </select>
    </label>
  );
}

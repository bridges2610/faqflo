'use client';

import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { PLAN_LIMITS, nextPlanUp } from '@/lib/dashboard/plans';
import { LockIcon } from './nav-icons';

/**
 * What a locked feature shows instead of nothing.
 *
 * Three things every time: what it is, which plan has it, and the way to get
 * there. A disabled control with no explanation reads as a bug, and a feature
 * that's simply hidden can't be sold.
 *
 * Renders nothing when the current plan already includes the feature, so
 * callers can drop it in without a surrounding conditional.
 */
export function UpgradeCard({
  title,
  body,
  /** Set when the block is a limit rather than a missing feature. */
  compact = false,
}: {
  title: string;
  body: string;
  compact?: boolean;
}) {
  const { plan } = useDashboard();
  const next = nextPlanUp(plan);
  if (!next) return null;

  const target = PLAN_LIMITS[next];

  return (
    <Card tone="cloud" className={compact ? 'p-5' : 'p-7'}>
      <div className="flex gap-4">
        <span className="bg-accent-soft text-teal-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
          <LockIcon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base leading-snug">{title}</h3>
          <p className="text-slate mt-1.5 text-sm leading-relaxed">{body}</p>
          <p className="text-slate mt-3 text-sm">
            Included with <span className="text-navy font-semibold">{target.label}</span> · $
            {target.monthly}/month
          </p>
          <ButtonLink href="/#pricing" size="sm" className="mt-4">
            See {target.label}
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}

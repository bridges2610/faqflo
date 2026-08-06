'use client';

import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ENTITLEMENTS, type EntitlementId } from '@/lib/dashboard/plans';
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
  entitlement: EntitlementId;
  title: string;
  body: string;
  /** Named when the entitlement is per-site, so the scope is unambiguous. */
  siteName?: string;
  compact?: boolean;
}) {
  const target = ENTITLEMENTS[entitlement];
  const scopeLine =
    target.scope === 'site'
      ? `Unlocks this for ${siteName ?? 'this site'} — bought once, not a subscription.`
      : 'Covers every site on your account, for as long as you keep it running.';

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
            <span className="text-navy font-semibold">{target.label}</span> · {target.price}
          </p>
          <p className="text-slate mt-1 text-xs leading-relaxed">{scopeLine}</p>
          <ButtonLink href="/#pricing" size="sm" className="mt-4">
            See {target.label}
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}

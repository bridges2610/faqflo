'use client';

import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PLAN_COPY, PRO_PRICE } from '@/lib/dashboard/plans';
import { LockIcon } from './nav-icons';
import { SectionTitle } from './section-title';

/**
 * What a locked feature shows instead of nothing.
 *
 * ⚠️ THIS USED TO CONTAIN A CHECKOUT, AND NOW IT CONTAINS A LINK. The old
 * version posted straight to /api/stripe/checkout, because it had to decide
 * things the call sites could not: which of two products to offer, whether the
 * site's window had expired, whether the account had bought the prerequisite
 * first. All of that is gone with the second product — there is one plan, one
 * price, and no ordering rule — and what is left is a decision worth a page
 * rather than a button: monthly or yearly, at $39 a month.
 *
 * Sending people to /dashboard/plan also means the monthly/annual choice is made
 * once, in one place, instead of this card hardcoding `period: 'monthly'` the
 * way it used to and quietly making annual unreachable outside Stripe's portal.
 *
 * ⚠️ NO PER-SITE SCOPE LINE EITHER. It used to say "unlocks this for <site>",
 * because Get Cited was bought per site and getting that wrong in the copy
 * taught the wrong mental model of what someone owned. Pro covers the account.
 */
export function UpgradeCard({
  title,
  body,
  compact = false,
}: {
  title: string;
  /** What this particular locked feature gives them. One sentence, plain. */
  body: string;
  compact?: boolean;
}) {
  const pro = PLAN_COPY.pro;

  /*
    ⚠️ `p-5 sm:p-7`, NOT `p-7`. `compact` is a CONTAINER decision made by the
    caller; the sm: is a VIEWPORT one, and the two are independent. This card
    carried a bare p-7 while seven-plus siblings had already moved —
    done-for-you-card.tsx's own note says "same problem and same prop name as
    UpgradeCard, which got here first", so this is the one that never got the fix
    it inspired. At 360px p-7 left the copy a ~218px column.
  */
  return (
    <Card tone="cloud" className={compact ? 'p-5' : 'p-5 sm:p-7'}>
      <div className="flex gap-4">
        <span className="bg-accent-soft text-teal-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
          <LockIcon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <SectionTitle as="h3">{title}</SectionTitle>
          <p className="text-slate mt-1.5 text-sm leading-relaxed">{body}</p>
          <p className="text-slate mt-3 text-sm">
            <span className="text-navy font-semibold">{pro.label}</span> · {pro.price}
          </p>
          <p className="text-slate mt-1 text-xs leading-relaxed">
            Covers everything on your account. Cancel any time, or pay yearly for{' '}
            {PRO_PRICE.annualTotal / PRO_PRICE.monthly < 12
              ? `${12 - Math.round(PRO_PRICE.annualTotal / PRO_PRICE.monthly)} months free`
              : 'the same price'}
            .
          </p>

          <ButtonLink href="/dashboard/plan" size="sm" className="mt-4">
            See what Pro includes
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}

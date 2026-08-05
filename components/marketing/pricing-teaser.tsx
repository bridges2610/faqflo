'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';

/*
  ⚠️ PLACEHOLDER PRICES. These are stand-ins, not researched numbers. Set the
  real figures before this goes live; they also have to match the Stripe prices
  created in step 4.

  Annual rates are set explicitly rather than derived from a "months free"
  formula, because the two no longer line up: $15/mo billed annually is $180
  against $228 monthly — a $48 saving, or roughly 2.5 months free, not 2.
  Storing both rates keeps the displayed numbers honest whatever the discount
  works out to.
*/
type Plan = {
  name: string;
  /** null = free tier, so there's no annual variant to switch to. */
  monthly: number | null;
  /** Per-month rate when billed annually. */
  annualMonthly: number | null;
  blurb: string;
  cta: string;
  href: string;
  featured: boolean;
  note: string | null;
  features: string[];
};

const PLANS: Plan[] = [
  {
    name: 'Free',
    monthly: null,
    annualMonthly: null,
    blurb: 'The generator, whenever you need it.',
    cta: 'Start generating',
    href: '/#try',
    featured: false,
    note: null,
    features: [
      'Free FAQ generator',
      '3 FAQ sets a day',
      'No account needed',
      'Six languages, three tones',
    ],
  },
  {
    name: 'Pro',
    monthly: 19,
    annualMonthly: 15,
    blurb: 'For one site that wants to get found.',
    cta: 'Join the waitlist',
    href: '/#try',
    featured: true,
    note: 'Most popular',
    features: [
      'Everything in Free',
      '1 site',
      'Embed widget — one line',
      'Unlimited FAQs',
      'AEO schema published for you',
      'Basic analytics',
    ],
  },
  {
    name: 'Business',
    monthly: 49,
    annualMonthly: 40,
    blurb: 'For agencies and multi-site owners.',
    cta: 'Join the waitlist',
    href: '/#try',
    featured: false,
    note: null,
    features: [
      'Everything in Pro',
      'Up to 5 sites',
      'Full analytics',
      'Unanswered-question report',
      'FaqFlo badge removed',
      'Priority support',
    ],
  },
];

/**
 * Whole dollars when the figure is exact, cents when it isn't.
 *
 * Deliberately never rounds to a whole number: $190/12 is $15.83, and showing
 * either "$16" or "$15" would misstate a real price.
 */
function money(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

function Check() {
  return (
    <svg
      className="text-primary mt-[0.35rem] shrink-0"
      width="13"
      height="13"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="1.5 6.5 4.5 9.5 10.5 2.5" />
    </svg>
  );
}

export function PricingTeaser() {
  // Defaults to monthly so this section agrees with the price advertised
  // everywhere else on the page.
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="bg-tint-blue scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <Badge>Pricing</Badge>
          <h2 className="mt-5 text-[2rem] text-balance sm:text-[2.5rem]">
            Start free. Upgrade when it&rsquo;s working.
          </h2>
          <p className="text-slate mt-4 text-[1.0625rem] leading-relaxed">
            The generator is free for good. Paid plans are for when you want your answers live on
            your own site.
          </p>
        </div>

        {/* Same segmented-control language as the generator's input switcher. */}
        <div className="mt-9 flex justify-center">
          <div
            className="bg-cloud border-line inline-flex items-center gap-1 rounded-full border p-1"
            role="group"
            aria-label="Billing period"
          >
            <button
              onClick={() => setAnnual(false)}
              aria-pressed={!annual}
              className={`rounded-full px-4 py-1.5 text-sm transition-all duration-200 ${
                !annual
                  ? 'text-navy shadow-soft bg-white font-semibold'
                  : 'text-slate hover:text-navy'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              aria-pressed={annual}
              className={`flex items-center gap-2 rounded-full py-1.5 pr-2 pl-4 text-sm transition-all duration-200 ${
                annual ? 'text-navy shadow-soft bg-white font-semibold' : 'text-slate hover:text-navy'
              }`}
            >
              Annual
              {/* Not <Badge> — overriding its size/padding via className would
                  collide with the component's own utilities at equal
                  specificity, so which wins would depend on CSS output order.

                  "2 months free" is a floor, not the exact figure: Pro actually
                  saves 2.53 months' worth and Business 2.20. It understates the
                  discount rather than overstating it, which is the safe
                  direction for a claim — and the per-plan saving underneath
                  each price is exact. */}
              <span className="bg-accent-soft text-navy rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold">
                2 months free
              </span>
            </button>
          </div>
        </div>

        <div className="mt-12 grid items-start gap-5 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isPaid = plan.monthly !== null && plan.annualMonthly !== null;
            const perMonth = !isPaid ? 0 : annual ? plan.annualMonthly! : plan.monthly!;
            const billedYearly = !isPaid ? 0 : plan.annualMonthly! * 12;
            const yearlySaving = !isPaid ? 0 : (plan.monthly! - plan.annualMonthly!) * 12;

            return (
              <div
                key={plan.name}
                className={`relative rounded-2xl border bg-white p-7 ${
                  plan.featured
                    ? 'border-primary shadow-hero md:-mt-4 md:pb-9'
                    : 'border-line shadow-card'
                }`}
              >
                {plan.note && (
                  <span className="bg-brand-gradient-bright text-navy shadow-soft absolute -top-3 left-7 rounded-full px-3 py-1 text-xs font-bold">
                    {plan.note}
                  </span>
                )}

                <h3 className="text-xl">{plan.name}</h3>
                <p className="text-slate mt-1.5 text-sm">{plan.blurb}</p>

                <p className="mt-5 flex items-baseline gap-1.5">
                  <span className="font-display text-navy text-[2.5rem] leading-none font-extrabold">
                    {isPaid ? money(perMonth) : '$0'}
                  </span>
                  <span className="text-slate text-sm">{isPaid ? 'per month' : 'forever'}</span>
                </p>

                {/* Fixed height so the cards don't jump when the toggle flips.
                    Both figures are exact — the annual rate is a set price, not
                    a derived one, so $15 × 12 really is the $180 charged. */}
                <p className="text-slate mt-1.5 h-4 text-xs leading-4">
                  {isPaid && annual
                    ? `${money(billedYearly)} billed yearly · save ${money(yearlySaving)}`
                    : ''}
                </p>

                <ButtonLink
                  href={plan.href}
                  variant={plan.featured ? 'primary' : 'ghost'}
                  className="mt-5 w-full"
                >
                  {plan.cta}
                </ButtonLink>

                <ul className="mt-7 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="text-slate flex gap-2.5 text-sm">
                      <Check />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="text-slate mt-8 text-center text-sm">
          Widget and analytics are coming soon — join the waitlist and we&rsquo;ll tell you the
          moment they land.
        </p>
      </div>
    </section>
  );
}

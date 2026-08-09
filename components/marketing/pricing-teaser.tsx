'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Check } from '@/components/ui/check';

/*
  ⚠️ PLACEHOLDER PRICES. Starting points to test, not researched numbers. Set
  the real figures before launch; they also have to match the Stripe prices.

  The structure is the decision, not the dollars: a one-time fee for the
  discrete "get me set up" job, and a subscription for the continuous "keep me
  cited" job. Tracking costs us money every month it runs — repeatedly asking
  ChatGPT, Perplexity and Google what they say about a customer — so it can only
  be funded by recurring revenue. One-time money cannot pay a forever cost.

  The three tiers are no longer the same kind of thing, so `price` is a union
  rather than a monthly figure with nulls in it. That's what stops a one-time
  fee from being rendered as "$129 per month".
*/

type Price =
  | { kind: 'free' }
  | { kind: 'oneTime'; amount: number }
  // The annual figure is the total charged, not a derived per-month rate: $290
  // a year displays as $24.17/month, and storing 24.17 would bill $290.04.
  | { kind: 'subscription'; monthly: number; annualTotal: number };

type Plan = {
  name: string;
  price: Price;
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
    price: { kind: 'free' },
    blurb: 'Find out where you stand.',
    cta: 'Check my site',
    href: '/#audit',
    featured: false,
    note: null,
    features: [
      'Quick AI-visibility score',
      'Is your content readable without JavaScript',
      'Are AI crawlers allowed in',
      'FAQ generator, capped',
    ],
  },
  {
    name: 'Get Cited',
    price: { kind: 'oneTime', amount: 129 },
    blurb: 'The one-off job of getting set up properly.',
    cta: 'Get set up',
    href: '/#audit',
    featured: true,
    note: 'Start here',
    features: [
      'Full audit, including whether AI cites you today',
      'The questions people actually ask AI in your category',
      'The pages your industry expects, and which of yours are missing',
      'A complete answer-first FAQ set, written to be quoted',
      'Publish-ready HTML for your own site',
      'Entity schema and llms.txt',
      'One site, yours to keep',
    ],
  },
  {
    name: 'Stay Cited',
    price: { kind: 'subscription', monthly: 29, annualTotal: 290 },
    blurb: 'Because being cited once is not the same as staying cited.',
    cta: 'Keep me cited',
    href: '/#audit',
    featured: false,
    note: null,
    features: [
      'Citation tracking across ChatGPT, Perplexity and Google AI Overviews',
      'Monthly re-audit as your site changes',
      'Questions you are not being cited for, fed back into new answers',
      'Alerts when a citation appears or disappears',
      'Unlimited regeneration',
    ],
  },
];

/** Whole dollars when exact, cents when not — $290/12 is $24.17, not $24. */
function money(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

/**
 * Price block per kind.
 *
 * The billing switch lives inside the subscription card rather than above all
 * three. A page-level monthly/annual control would imply it changes the free
 * tier and the one-time fee, and it changes neither.
 */
function PriceBlock({ price }: { price: Price }) {
  const [annual, setAnnual] = useState(true); // annual is the default offer

  if (price.kind === 'free') {
    return (
      <div className="mt-5">
        <p className="flex items-baseline gap-1.5">
          <span className="font-display text-navy text-[2.5rem] leading-none font-extrabold">
            $0
          </span>
          <span className="text-slate text-sm">forever</span>
        </p>
        <p className="text-slate mt-1.5 h-4 text-xs leading-4">No account, no card</p>
      </div>
    );
  }

  if (price.kind === 'oneTime') {
    return (
      <div className="mt-5">
        <p className="flex items-baseline gap-1.5">
          <span className="font-display text-navy text-[2.5rem] leading-none font-extrabold">
            {money(price.amount)}
          </span>
          <span className="text-slate text-sm">once</span>
        </p>
        <p className="text-slate mt-1.5 h-4 text-xs leading-4">Per site · not a subscription</p>
      </div>
    );
  }

  const perMonth = annual ? price.annualTotal / 12 : price.monthly;
  const yearlySaving = price.monthly * 12 - price.annualTotal;

  return (
    <div className="mt-5">
      <p className="flex items-baseline gap-1.5">
        <span className="font-display text-navy text-[2.5rem] leading-none font-extrabold">
          {money(perMonth)}
        </span>
        <span className="text-slate text-sm">per month</span>
      </p>
      <p className="text-slate mt-1.5 h-4 text-xs leading-4">
        {annual
          ? `${money(price.annualTotal)} billed yearly · save ${money(yearlySaving)}`
          : 'Billed monthly · cancel any time'}
      </p>

      <div
        className="bg-cloud border-line mt-3 inline-flex items-center gap-1 rounded-full border p-1"
        role="group"
        aria-label="Billing period for Stay Cited"
      >
        <button
          type="button"
          onClick={() => setAnnual(true)}
          aria-pressed={annual}
          className={`flex items-center gap-1.5 rounded-full py-1 pr-1.5 pl-3 text-xs transition-all duration-200 ${
            annual ? 'text-navy shadow-soft bg-white font-semibold' : 'text-slate hover:text-navy'
          }`}
        >
          Annual
          <span className="bg-accent-soft text-navy rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold">
            2 months free
          </span>
        </button>
        <button
          type="button"
          onClick={() => setAnnual(false)}
          aria-pressed={!annual}
          className={`rounded-full px-3 py-1 text-xs transition-all duration-200 ${
            !annual ? 'text-navy shadow-soft bg-white font-semibold' : 'text-slate hover:text-navy'
          }`}
        >
          Monthly
        </button>
      </div>
    </div>
  );
}

export function PricingTeaser() {
  return (
    <section id="pricing" className="bg-tint-blue scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <Badge>Pricing</Badge>
          <h2 className="mt-5 text-[2rem] text-balance sm:text-[2.5rem]">
            Get set up once. Stay cited monthly.
          </h2>
          <p className="text-slate mt-4 text-[1.0625rem] leading-relaxed">
            Checking where you stand is free. Getting properly set up is a one-off job with a
            one-off price. Staying cited is the part that never finishes.
          </p>
        </div>

        <div className="mt-12 grid items-start gap-5 md:grid-cols-3">
          {PLANS.map((plan) => (
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

              <PriceBlock price={plan.price} />

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
                    <Check className="text-primary mt-[0.35rem] shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-slate mt-8 text-center text-sm">
          Stay Cited builds on Get Cited — one sets your answers up properly, the other watches
          whether the AI engines pick them up.
        </p>
      </div>
    </section>
  );
}

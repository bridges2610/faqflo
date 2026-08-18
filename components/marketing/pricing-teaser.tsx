'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Check } from '@/components/ui/check';
import {
  DISCOVERED_PROMPT_CAP,
  MANUAL_QUESTION_CAP,
  STAY_CITED_PROMPT_CAP,
  TRACKING_CHECKS_PER_PERIOD,
  TRACKING_RUNS_PER_PERIOD,
} from '@/lib/dashboard/plans';

/*
  ⚠️ THESE FIGURES ARE NOT DERIVED FROM STRIPE, AND STRIPE DOES NOT READ THEM.

  Stripe charges whatever ITS price object says. This file is copy. If the two
  disagree, a customer is quoted one number and billed another — so a price
  change is always two edits: here, and the price in the Stripe dashboard
  (whose id lives in STRIPE_PRICE_* rather than in code, so the amount can move
  without a deploy). Test mode and live mode have SEPARATE price objects, so a
  change made in one does not follow into the other.

  The structure is the decision, not the dollars: a one-time fee for the
  discrete "get me set up" job, and a subscription for the continuous "keep me
  cited" job. Tracking costs us money every time it runs — asking ChatGPT,
  Perplexity and Gemini what they say about a customer, per question, per engine
  — so it can only be funded by recurring revenue. One-time money cannot pay a
  forever cost.

  ⚠️ TRACKING IS LIVE NOW, AND THE ENGINE LIST IS NOT WHAT IT USED TO SAY. This
  card promised "ChatGPT, Perplexity and Google AI Overviews". AI Overviews has
  no API and cannot be queried by anyone — see the warning on ENGINES in
  lib/dashboard/types.ts, which corrected the same string inside the app. We ask
  GEMINI. Never put AI Overviews back on this list: naming an engine we cannot
  ask means reporting a permanent zero, which reads as "you are never cited
  there" rather than "we never looked".

  ⚠️ What is still NOT built is the SCHEDULE. Runs are started by hand from the
  Results page, so "automatic checks" is listed with `soon` — ticking tracking
  without that line would imply an automation that does not exist. Alerts are
  the same. lib/dashboard/plans.ts carries the matching copy in the app.

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

/*
  A feature is either shipping or it isn't, and the card has to be able to say
  which. `soon` carried citation tracking while it was unbuilt; tracking ships
  now, and the flag has moved to the two things around it that genuinely don't
  exist — a schedule, and alerts.

  ⚠️ TICKED FEATURES MUST ALL BE REAL TODAY. If you find yourself wanting to tick
  something aspirational, mark it `soon` instead. The flag earning its keep for a
  second time is the argument for keeping the mechanism rather than deleting it
  the moment the first feature landed.
*/
type Feature = { label: string; soon?: boolean };

type Plan = {
  name: string;
  price: Price;
  blurb: string;
  cta: string;
  href: string;
  featured: boolean;
  note: string | null;
  features: Feature[];
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
      { label: 'Quick AI-visibility score' },
      { label: 'Is your content readable without JavaScript' },
      { label: 'Are AI crawlers allowed in' },
      { label: 'FAQ generator, capped' },
    ],
  },
  {
    name: 'Get Cited',
    price: { kind: 'oneTime', amount: 129 },
    blurb: 'The one-off job of getting set up properly.',
    cta: 'Get set up',
    /*
      Straight at checkout, not at /sign-up.

      This used to land people in the dashboard, where they had to go hunting
      for a locked feature to find a buy button — a detour through the product
      on the way to paying for it. The page is protected, so an arrival who is
      not signed in gets sign-in first and comes back automatically. The
      scanned domain, if there is one, is appended by the home page audit.
    */
    href: '/dashboard/checkout/start',
    featured: true,
    note: 'Start here',
    features: [
      // ⚠️ Tracking IS included here now, for the 30 days — which is why the
      // line below can finally be ticked. It went from impossible, to
      // wrong-plan, to true; check which of those three the product is in
      // before editing this card again. The ceiling is real
      // (TRACKING_CHECKS_PER_PERIOD, enforced in the tracking route) and is
      // what makes a one-off payment safe to sell against a recurring cost.
      { label: 'Full audit — 44 checks across your whole site' },
      { label: 'The questions people actually ask AI in your category' },
      { label: 'The pages your industry expects, and which of yours are missing' },
      { label: 'A complete answer-first FAQ set, written to be quoted' },
      { label: 'Publish-ready HTML for your own site' },
      { label: 'Entity schema and llms.txt' },
      { label: 'Citation tracking across ChatGPT, Perplexity and Gemini, for the 30 days' },
      // ⚠️ Both halves of the deal, stated before the card rather than
      // discovered on day 31. Everything MADE is permanent; the running of new
      // audits is what ends. Selling "yours to keep" and then stopping audits
      // without having said so is a chargeback.
      { label: '30 days of full access — everything you make stays yours for good' },
    ],
  },
  {
    name: 'Stay Cited',
    price: { kind: 'subscription', monthly: 29, annualTotal: 290 },
    blurb: 'Because being cited once is not the same as staying cited.',
    /*
      Points at Get Cited, deliberately.

      Stay Cited watches whether the answers Get Cited wrote are being picked
      up, so subscribing first buys a monthly report on an empty set. The
      checkout API refuses it with a 409 either way — this is so nobody has to
      meet that error to find out.
    */
    cta: 'Start with Get Cited',
    href: '/dashboard/checkout/start',
    featured: false,
    note: null,
    /*
      Tracking leads now that it exists — it is the reason this subscription is
      bought, and it spent a long time buried at the bottom under "coming soon"
      because it was the one thing the card could not honestly claim.

      ⚠️ THE NUMBERS ARE IMPORTED, NOT TYPED. The prompt caps moved twice in one
      week; a hardcoded "25 questions" here would have been wrong within days,
      and a pricing page that overstates what a plan includes is a refund rather
      than a typo.
    */
    features: [
      { label: 'Citation tracking that keeps running after the 30 days' },
      {
        label: `${STAY_CITED_PROMPT_CAP} questions watched — ${DISCOVERED_PROMPT_CAP} we find for you, ${MANUAL_QUESTION_CAP} you write yourself`,
      },
      { label: 'Share of voice: every domain the engines cite, ranked against yours' },
      { label: 'Which of your pages earn citations, and what each answer actually said' },
      { label: 'Keeps every site on your account running after its 30 days' },
      { label: 'Unlimited re-audits, regeneration, and answers kept per site' },
      { label: 'Everything Get Cited unlocks, on every site you add' },
      // ⚠️ The ceiling, stated where the plan is sold. "Full platform" with a
      // silent cap is something customers discover AT the cap.
      {
        label: `${TRACKING_CHECKS_PER_PERIOD} engine checks a month — every question, every engine, ${TRACKING_RUNS_PER_PERIOD} times`,
      },
      // ⚠️ Not decoration. Tracking runs when you press the button; without this
      // line a tick beside "citation tracking" implies it watches on its own.
      { label: 'Automatic scheduled checks', soon: true },
      { label: 'Alerts when a citation appears or disappears', soon: true },
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
        <p className="text-slate mt-1.5 h-4 text-xs leading-4">
          Per site · includes 30 days of full access
        </p>
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
                  <li key={feature.label} className="text-slate flex gap-2.5 text-sm">
                    {/* A tick means it works. Anything still being built gets a
                        hollow dot and says so, so the two can't be skim-read as
                        the same promise. */}
                    {feature.soon ? (
                      <span
                        className="border-line mt-[0.42rem] h-2.5 w-2.5 shrink-0 rounded-full border-2"
                        aria-hidden="true"
                      />
                    ) : (
                      <Check className="text-primary mt-[0.35rem] shrink-0" />
                    )}
                    <span className={feature.soon ? 'text-slate/70' : undefined}>
                      {feature.label}
                      {feature.soon && (
                        <span className="bg-cloud text-slate border-line ml-2 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap">
                          Coming soon
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* The order and the cut-off, in one sentence, on the page where the
            decision is made. Everything downstream enforces this; if the copy
            and the enforcement ever disagree, the copy is the promise. */}
        <p className="text-slate mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed">
          Get Cited comes first — it writes your answers and gives you 30 days to work with them.
          Everything it makes is yours permanently, including the export. Stay Cited is what keeps
          new audits and fresh answers coming after that, across every site on your account.
        </p>

        {/*
          ⚠️ THE DONE-FOR-YOU SERVICE IS DELIBERATELY NOT PITCHED HERE.

          A line used to sit under these cards reading "rather not do it
          yourself? $497 on top of Get Cited". It was removed on purpose, and
          re-adding it would break /done-for-you rather than this page.

          That service is only offered to people who ALREADY pay for Get Cited,
          so its landing page opens by telling the reader they have it and
          never mentions the $129. The audience for this pricing section is the
          opposite: somebody choosing a plan, who has bought nothing. Sending
          them to a page written for an existing customer means a stranger
          reading "$497 once" as all-in and meeting a second charge later —
          which is a refund.

          It is offered inside the dashboard instead (Publish, Help and Start),
          where every reader is a customer by definition. If it ever needs to
          be sold to a cold audience, the ordering has to go back into that
          page's copy in the same commit — the note at the top of
          app/(marketing)/done-for-you/page.tsx spells out why.
        */}
      </div>
    </section>
  );
}

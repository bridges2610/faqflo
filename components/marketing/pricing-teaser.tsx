'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Check } from '@/components/ui/check';
import { GUARANTEE_DAYS, PRO_PRICE, TRACKING_PLANS } from '@/lib/dashboard/plans';

const FREE = TRACKING_PLANS.free;
const PRO = TRACKING_PLANS.pro;

/*
  ⚠️ THESE FIGURES ARE NOT DERIVED FROM STRIPE, AND STRIPE DOES NOT READ THEM.

  Stripe charges whatever ITS price object says. PRO_PRICE is copy that lives in
  lib/dashboard/plans.ts so the pricing page and the dashboard quote one number.
  If it and Stripe disagree, a customer is quoted one figure and billed another
  — so a price change is always two edits: PRO_PRICE, and the price in the
  Stripe dashboard (whose id lives in STRIPE_PRICE_* rather than in code, so the
  amount can move without a deploy). Test mode and live mode have SEPARATE price
  objects, so a change made in one does not follow into the other.

  ⚠️ THE STRUCTURE CHANGED, AND THE OLD ONE'S REASONING NO LONGER APPLIES. This
  page used to sell three things: free, a $129 one-time setup fee, and a $29
  subscription. The argument for that shape was that "tracking costs us money
  every time it runs… so it can only be funded by recurring revenue. One-time
  money cannot pay a forever cost" — which was true, and is exactly why the
  one-time product is gone rather than repriced. Everything recurring is now
  funded by something recurring.

  ⚠️ FREE COSTS US MONEY TOO, and that is a deliberate bet rather than an
  oversight. A free signup gets a real check: five questions across three
  search-backed engines, once. It is metered as a lifetime allowance (see
  trackingPeriod in plans.ts) so it cannot repeat.

  ⚠️ WE ASK GEMINI, NOT GOOGLE AI OVERVIEWS. AI Overviews has no API and cannot
  be queried by anyone — see the warning on ENGINES in lib/dashboard/types.ts.
  Never put it on this list: naming an engine we cannot ask means reporting a
  permanent zero, which reads as "you are never cited there" rather than "we
  never looked".

  ⚠️ ALERTS ARE NOT BUILT AND ARE NOT LISTED. Nothing emails a customer when a
  citation appears or disappears; they find out by looking. The `soon` flag this
  card used to carry for that line is gone with it — every tick below is
  something that works today, which is the only state this card is allowed to
  be in. If something aspirational needs listing again, bring the flag back
  rather than ticking it.
*/

type Price = { kind: 'free' } | { kind: 'subscription'; monthly: number; annualTotal: number };

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

/*
  Written for a plumber, a dentist or a restaurant owner — not for a marketer.

  Every line answers "what do I get" in words somebody would say out loud. No
  JSON-LD, no schema markup, no crawlers, no AEO. Where a technical term is
  genuinely the name of the thing (llms.txt), it gets explained in the same
  breath rather than assumed.
*/
const PLANS: Plan[] = [
  {
    name: 'Free',
    price: { kind: 'free' },
    blurb: 'Find out where you stand.',
    cta: 'Check my site free',
    href: '/sign-up',
    featured: false,
    note: null,
    features: [
      'Your AI-visibility score, out of 100',
      'Can AI read your site, or does it just see a blank page?',
      'Are the AI bots allowed in, or is your site accidentally shut to them?',
      `${FREE.promptCap} real questions a customer might ask, put to ChatGPT, Perplexity and Google’s Gemini`,
      'See which of them named you — and who got named instead',
      `Check again ${FREE.runsPerPeriod} times as you fix things, so you can watch it change`,
    ],
  },
  {
    name: 'Pro',
    price: { kind: 'subscription', monthly: PRO_PRICE.monthly, annualTotal: PRO_PRICE.annualTotal },
    blurb: 'Get quoted by AI, and stay quoted.',
    cta: 'Start Pro',
    /*
      The in-app plan page, not straight to Stripe.

      $39 a month is a considered decision, and the comparison plus the
      monthly/annual choice belongs on a page rather than inside a checkout
      form. The page is protected, so somebody who is not signed in gets sign-up
      first and arrives back here automatically.
    */
    href: '/dashboard/plan',
    featured: true,
    note: 'Most popular',
    features: [
      'Everything in Free, plus:',
      'A full check of every page on your site, not just the home page',
      'The questions people really ask AI in your line of work',
      'The pages your industry expects — and which of yours are missing',
      'A complete set of answers, written to be quoted',
      'Ready-to-paste code for your own website, whoever built it',
      'An llms.txt file — a plain-text summary written for AI to read',
      `${PRO.promptCap} questions watched — ${PRO.discoveredCap} we find for you, ${PRO.manualCap} you write yourself`,
      'Checked automatically every week, and any time you press the button',
      'Who gets quoted instead of you, ranked',
      'Which of your pages earn a mention, and what the AI actually said',
      'Unlimited re-checks and rewrites',
    ],
  },
];

/** Whole dollars when exact, cents when not — $390/12 is $32.50, not $32. */
function money(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

function PriceBlock({ price }: { price: Price }) {
  /*
    ⚠️ MONTHLY, BECAUSE MONTHLY IS THE FIRST INVOICE MOST PEOPLE WILL GET.

    Annual is genuinely purchasable now — it was display-only under the old
    model, where the upgrade card hardcoded monthly — so showing it would not be
    quoting a plan nobody is charged. It still opens on monthly, for two
    reasons: $39 is the lower-friction entry for a small business owner deciding
    in thirty seconds, and headlining "$32.50/month" when the card is charged
    $390 today is the kind of small mismatch that reads as a bait and switch even
    when nothing was hidden.

    Annual does its own selling from the toggle, where the saving and the
    guarantee are both stated.
  */
  const [annual, setAnnual] = useState(false);

  if (price.kind === 'free') {
    return (
      <div className="mt-5">
        <p className="flex items-baseline gap-1.5">
          <span className="font-display text-navy text-[2.5rem] leading-none font-extrabold">
            $0
          </span>
          <span className="text-slate text-sm">forever</span>
        </p>
        <p className="text-slate mt-1.5 h-4 text-xs leading-4">No card needed</p>
      </div>
    );
  }

  const perMonth = annual ? price.annualTotal / 12 : price.monthly;
  const yearlySaving = price.monthly * 12 - price.annualTotal;
  const monthsFree = Math.round(yearlySaving / price.monthly);

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
        aria-label="Billing period for Pro"
      >
        {/* ⚠️ MONTHLY FIRST, MATCHING THE DEFAULT ABOVE. Reading order is the
            quieter half of "which one is the offer": a selected control sitting
            second reads as a correction to the first rather than as the plan on
            sale. Ordering is DOM order, so tab order follows for free — there is
            no tabIndex to keep in step. */}
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
        <button
          type="button"
          onClick={() => setAnnual(true)}
          aria-pressed={annual}
          className={`flex items-center gap-1.5 rounded-full py-1 pr-1.5 pl-3 text-xs transition-all duration-200 ${
            annual ? 'text-navy shadow-soft bg-white font-semibold' : 'text-slate hover:text-navy'
          }`}
        >
          Yearly
          {/* Stays on the unselected option, which is where it does its work:
              it is the reason to look at the other state, not a label for the
              one you are already on. */}
          <span className="bg-accent-soft text-navy rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold">
            {monthsFree} months free
          </span>
        </button>
      </div>

      {/*
        ⚠️ THE GUARANTEE IS ANNUAL-ONLY AND THIS LINE MUST NOT APPEAR ON MONTHLY.
        Monthly customers can cancel from the billing portal and lose at most one
        month; annual is the one asking for $390 up front, which is what the
        guarantee answers. Showing it on both would be promising a refund we do
        not offer, on the screen where the promise is made.

        The Refunds section of /terms carries the matching wording. The two
        change together — that page currently governs, so a guarantee here that
        the terms contradict is worse than no guarantee at all.
      */}
      <p className="text-slate mt-3 h-4 text-xs leading-4">
        {annual ? `${GUARANTEE_DAYS}-day money back, no questions asked` : ''}
      </p>
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
            Start free. Upgrade when you can see it working.
          </h2>
          <p className="text-slate mt-4 text-[1.0625rem] leading-relaxed">
            Find out where you stand for nothing. If you like what you see, Pro does the whole job
            — and keeps checking whether it worked.
          </p>
        </div>

        {/* Two cards, so they get a narrower grid than three did — a
            full-width pair on a large screen reads as two billboards. */}
        <div className="mx-auto mt-12 grid max-w-4xl items-start gap-5 md:grid-cols-2">
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
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* What free actually leaves you holding, said before anyone signs up
            rather than discovered on the day they cancel. Publishing is part of
            Pro now — under the old one-time product it was permanent, because
            you cannot revoke something somebody bought outright.

            ⚠️ IT USED TO PROMISE THE ANSWERS. "The answers you write stay yours
            — you can always copy them out as plain text" was true while free
            had a generator, and became a refund the moment the free report
            stopped having one. Free is a diagnosis; what it leaves you holding
            is the reading, which stays readable for good. */}
        <p className="text-slate mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed">
          Free is free forever, and the results you have already collected stay readable — the plan
          governs what may be run, never what may be read. Pro adds the answers, the ready-to-paste
          code, the full site check, and the weekly watching. Cancel whenever you like.
        </p>

        {/*
          ⚠️ THE DONE-FOR-YOU SERVICE IS DELIBERATELY NOT PITCHED HERE.

          A line used to sit under these cards offering it "on top of Get
          Cited". It was removed on purpose, and re-adding it would break
          /done-for-you rather than this page.

          That service is only offered to people who ALREADY subscribe, so its
          landing page opens by telling the reader they have Pro and never
          mentions the subscription price. The audience for this section is the
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

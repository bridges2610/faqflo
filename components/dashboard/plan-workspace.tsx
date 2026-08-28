'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check } from '@/components/ui/check';
import { GUARANTEE_DAYS, isPro, PRO_PRICE, TRACKING_PLANS } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { SectionTitle } from './section-title';

/*
  Choosing a plan, inside the product.

  ⚠️ THE ONLY PLACE MONTHLY-VS-YEARLY IS DECIDED. The old upgrade card posted
  `period: 'monthly'` as a literal and left a comment saying annual was "one
  click inside Stripe's portal afterwards, so it is deliberately not a decision
  made twice" — which meant the annual price existed in env, was quoted on the
  pricing page, and could not actually be bought from anywhere in the app. It
  can now, and this is where. Every locked feature in the dashboard links here
  rather than carrying its own checkout.

  ⚠️ The feature lists below are the same promises as
  components/marketing/pricing-teaser.tsx, in the same plain language. If a
  bullet changes there it changes here: a dashboard that describes more than the
  page sold is a support ticket, and less is a refund.
*/

const FREE = TRACKING_PLANS.free;
const PRO = TRACKING_PLANS.pro;

const FREE_FEATURES = [
  'Your AI-visibility score, out of 100',
  'Can AI read your site, or does it just see a blank page?',
  'Are the AI bots allowed in?',
  `${FREE.promptCap} real questions put to ChatGPT, Perplexity and Google’s Gemini`,
  'See which of them named you — and who got named instead',
  `Check again ${FREE.runsPerPeriod} times as you fix things`,
];

const PRO_FEATURES = [
  'Every page on your site checked, not just the home page',
  'All the questions people ask AI in your line of work',
  'The pages your industry expects, and which of yours are missing',
  'A complete set of answers, written to be quoted',
  'Ready-to-paste code for your website, whoever built it',
  'An llms.txt file — a plain-text summary written for AI to read',
  `${PRO.promptCap} questions watched — ${PRO.discoveredCap} we find, ${PRO.manualCap} you write`,
  'Checked automatically every week, and whenever you press the button',
  'Who gets quoted instead of you, ranked',
  'Which of your pages earn a mention, and what the AI actually said',
  'Unlimited re-checks and rewrites',
];

/** Whole dollars when exact, cents when not — $390/12 is $32.50, not $32. */
function money(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

export function PlanWorkspace() {
  const { user } = useDashboard();
  const pro = isPro(user);

  return (
    <div className="space-y-5">
      {pro ? <CurrentPlan /> : <Upgrade />}

      <div className="grid gap-5 md:grid-cols-2">
        <PlanCard
          name="Free"
          price="$0"
          suffix="forever"
          features={FREE_FEATURES}
          current={!pro}
        />
        <PlanCard
          name="Pro"
          price={`$${PRO_PRICE.monthly}`}
          suffix="per month"
          features={PRO_FEATURES}
          current={pro}
          highlight
          lead="Everything in Free, plus:"
        />
      </div>
    </div>
  );
}

/** For a subscriber: what they are on, and the door to Stripe's portal. */
function CurrentPlan() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setError(null);
    setBusy(true);

    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const payload = (await res.json()) as { url?: string; error?: string };

      if (!res.ok || !payload.url) {
        setError(payload.error ?? 'Could not open billing. Please try again.');
        setBusy(false);
        return;
      }

      // Stays busy: the browser is leaving for Stripe.
      window.location.href = payload.url;
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <Card tone="cloud" className="p-7">
      <SectionTitle as="h2">You’re on Pro</SectionTitle>
      <p className="text-slate mt-1.5 text-sm leading-relaxed">
        Your site is checked automatically every week, and you can run one whenever you like.
        Switch between monthly and yearly, update your card, or cancel — all in one place.
      </p>

      <Button size="sm" variant="ghost" className="mt-4" onClick={openPortal} disabled={busy}>
        {busy ? 'Opening…' : 'Manage billing'}
      </Button>

      {error && (
        <p role="alert" className="text-error-ink mt-3 text-sm">
          {error}
        </p>
      )}
    </Card>
  );
}

/** For a free account: pick a billing period and go. */
function Upgrade() {
  /*
    ⚠️ OPENS ON MONTHLY, matching the pricing page for the reason stated there:
    headlining a figure the first invoice will not match reads as a bait and
    switch even when nothing was hidden. Yearly sells itself from the toggle,
    where the saving and the guarantee are both stated.
  */
  const [annual, setAnnual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perMonth = annual ? PRO_PRICE.annualTotal / 12 : PRO_PRICE.monthly;
  const saving = PRO_PRICE.monthly * 12 - PRO_PRICE.annualTotal;

  async function buy() {
    setError(null);
    setBusy(true);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ⚠️ The period is the ONLY thing the body decides, and the server still
        // defaults anything that is not exactly 'annual' to monthly — see
        // parsePurchase(). Which account is being charged comes from the session.
        body: JSON.stringify({ product: 'pro', period: annual ? 'annual' : 'monthly' }),
      });

      const payload = (await res.json()) as { url?: string; error?: string };

      if (!res.ok || !payload.url) {
        setError(payload.error ?? 'Could not start checkout. Please try again.');
        setBusy(false);
        return;
      }

      // Stays busy: the browser is navigating to Stripe, and flipping the button
      // back to idle mid-navigation invites a second click and a second session.
      window.location.href = payload.url;
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <Card className="p-7">
      <SectionTitle as="h2">Upgrade to Pro</SectionTitle>
      <p className="text-slate mt-1.5 text-sm leading-relaxed">
        The full check of every page, answers ready to paste onto your site, and{' '}
        {PRO.promptCap} questions watched every week so you can see whether it worked.
      </p>

      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="font-display text-navy text-[2.5rem] leading-none font-extrabold">
          {money(perMonth)}
        </span>
        <span className="text-slate text-sm">per month</span>
      </p>
      <p className="text-slate mt-1.5 text-xs leading-4">
        {annual
          ? `${money(PRO_PRICE.annualTotal)} billed yearly · save ${money(saving)}`
          : 'Billed monthly · cancel any time'}
      </p>

      <div
        className="bg-cloud border-line mt-3 inline-flex items-center gap-1 rounded-full border p-1"
        role="group"
        aria-label="Billing period"
      >
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
          <span className="bg-accent-soft text-navy rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold">
            {Math.round(saving / PRO_PRICE.monthly)} months free
          </span>
        </button>
      </div>

      <Button size="md" className="mt-5" onClick={buy} disabled={busy}>
        {busy ? 'Taking you to checkout…' : `Continue — ${annual ? money(PRO_PRICE.annualTotal) + ' a year' : money(PRO_PRICE.monthly) + ' a month'}`}
      </Button>

      {error && (
        <p role="alert" className="text-error-ink mt-3 text-sm">
          {error}
        </p>
      )}

      {/* ⚠️ Annual only. Monthly customers can cancel from the portal and lose at
          most one month; the guarantee answers the $390-up-front objection, and
          showing it on monthly would be promising a refund we do not offer. The
          Refunds section of /terms carries the matching wording. */}
      <p className="text-slate mt-4 text-xs leading-relaxed">
        Payment is handled by Stripe — we never see your card details.
        {annual ? ` Not for you? Tell us within ${GUARANTEE_DAYS} days and we’ll refund the lot.` : ''}
      </p>
    </Card>
  );
}

function PlanCard({
  name,
  price,
  suffix,
  features,
  current,
  highlight = false,
  lead,
}: {
  name: string;
  price: string;
  suffix: string;
  features: string[];
  current: boolean;
  highlight?: boolean;
  lead?: string;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-6 ${
        highlight ? 'border-primary shadow-card' : 'border-line'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg">{name}</h3>
        {current && (
          <span className="bg-primary-soft text-primary rounded-full px-2.5 py-0.5 text-xs font-semibold">
            Your plan
          </span>
        )}
      </div>

      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="font-display text-navy text-2xl leading-none font-extrabold">{price}</span>
        <span className="text-slate text-xs">{suffix}</span>
      </p>

      {lead && <p className="text-slate mt-4 text-sm font-semibold">{lead}</p>}

      <ul className={`space-y-2.5 ${lead ? 'mt-2.5' : 'mt-4'}`}>
        {features.map((feature) => (
          <li key={feature} className="text-slate flex gap-2.5 text-sm">
            <Check className="text-primary mt-[0.35rem] shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

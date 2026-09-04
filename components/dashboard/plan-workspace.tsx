'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check } from '@/components/ui/check';
import { EngineMark } from '@/components/ui/ai-marks';
import { GUARANTEE_DAYS, isPro, PLAN_COPY, planProse, PRO_PRICE } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { ENGINES } from '@/lib/dashboard/types';

/*
  Choosing a plan, inside the product.

  ⚠️ IT IS A PRICING PAGE NOW, AND IT USED TO BE FIVE THINGS. Across several
  rounds this grew a gradient hero carrying the reader's own score, a proof
  block quoting a question they had lost, radio billing rows, a fifteen-row
  comparison matrix and a buy bar that followed you down the page. Every piece
  argued; together they argued too much. It is four sections now — a line of
  intro, the engines, a toggle, two cards — and anything added back has to earn
  its place against that.

  ⚠️ THE ONLY PLACE MONTHLY-VS-YEARLY IS DECIDED. The old upgrade card posted
  `period: 'monthly'` as a literal, which meant the annual price existed in env,
  was quoted on the pricing page, and could not actually be bought from anywhere
  in the app. It can now, and this is where. Every locked feature in the
  dashboard links here rather than carrying its own checkout.

  ⚠️ THE FEATURE LISTS ARE NOT IN THIS FILE. They come from PLAN_FEATURES via
  planProse(), which the public pricing page also renders. They used to be typed
  out in both places under comments promising the two would be edited together;
  they drifted anyway. Add a row in lib/dashboard/plans.ts, not here.

  ⚠️ WHAT THIS PAGE MAY CLAIM IS BOUNDED, and the bounds live elsewhere: no
  alerts (plans.ts, above PLAN_COPY — nothing emails anybody), no "AI Overviews"
  (types.ts, on ENGINES — it has no API, so naming it promises a measurement
  nobody can take), no figure that is not a constant in plans.ts, and the refund
  line on annual only.

  ⚠️ NO DONE-FOR-YOU PITCH. canOfferDoneForYou() is isPro() because
  /done-for-you opens by telling the reader "You've got Pro running" and quotes
  $497 without the subscription under it — false and expensive for every free
  reader of this page. No card, no price, no link.
*/

/** Whole dollars when exact, cents when not — $390/12 is $32.50, not $32. */
function money(value: number): string {
  return Number.isInteger(value) ? `$${value}` : `$${value.toFixed(2)}`;
}

export function PlanWorkspace() {
  const { user } = useDashboard();
  const pro = isPro(user);

  /*
    ⚠️ OPENS ON MONTHLY, and that is this line. Headlining a figure the first
    invoice will not match reads as a bait and switch even when nothing was
    hidden — the pricing page states the same rule and defaults the same way.
    Annual sells itself from the toggle, where the saving and the guarantee are
    both stated.
  */
  const [annual, setAnnual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saving = PRO_PRICE.monthly * 12 - PRO_PRICE.annualTotal;
  const perMonth = annual ? PRO_PRICE.annualTotal / 12 : PRO_PRICE.monthly;

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

      window.location.href = payload.url;
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <div>
      <Engines />

      <PeriodToggle annual={annual} onPeriod={setAnnual} saving={saving} />

      {/* items-start so the shorter card does not stretch to match the taller. */}
      <div className="mt-8 grid items-start gap-5 md:grid-cols-2">
        <PlanCard
          name={PLAN_COPY.free.label}
          tagline={PLAN_COPY.free.tagline}
          price="$0"
          suffix="forever"
          note="No card needed"
          features={planProse('free')}
          current={!pro}
          /* No button when they are on Pro: downgrading is not a flow here —
             it happens by cancelling in Stripe's portal. A dead control would
             be worse than none. */
          cta={
            !pro ? (
              <Button variant="ghost" className="w-full" disabled>
                Current plan
              </Button>
            ) : null
          }
        />

        <PlanCard
          name={PLAN_COPY.pro.label}
          tagline={PLAN_COPY.pro.tagline}
          price={money(perMonth)}
          suffix="per month"
          note={
            annual
              ? `${money(PRO_PRICE.annualTotal)} billed yearly · save ${money(saving)}`
              : 'Billed monthly · cancel any time'
          }
          lead="Everything in Free, plus:"
          features={planProse('pro')}
          current={pro}
          featured
          cta={
            pro ? (
              <Button variant="ghost" className="w-full" onClick={openPortal} disabled={busy}>
                {busy ? 'Opening…' : 'Manage billing'}
              </Button>
            ) : (
              <Button className="w-full" onClick={buy} disabled={busy} arrow={!busy}>
                {busy ? 'Taking you to checkout…' : 'Start Pro'}
              </Button>
            )
          }
        />
      </div>

      {error && (
        <p role="alert" className="text-error-ink mt-4 text-sm">
          {error}
        </p>
      )}

      {/* ⚠️ THE GUARANTEE IS ANNUAL-ONLY. Monthly customers can cancel from the
          portal and lose at most one month; the refund answers the $390-up-front
          objection, and showing it on monthly would promise something we do not
          offer. The Refunds section of /terms carries the matching wording, and
          the two change together.

          Centred and width-capped to match the header and the engine row —
          everything on this page sits on the centre line except the cards. */}
      {!pro && (
        <p className="text-slate mx-auto mt-6 max-w-md text-center text-xs leading-relaxed">
          Payment is handled by Stripe — we never see your card details.
          {annual ? ` Not for you? Tell us within ${GUARANTEE_DAYS} days and we’ll refund the lot.` : ''}
        </p>
      )}
    </div>
  );
}

/**
 * The three engines, named and shown.
 *
 * ⚠️ MAPPED FROM `ENGINES`, NEVER TYPED OUT. types.ts calls that constant "the
 * only ones the UI may name" — reading it here is what keeps "Google AI
 * Overviews" off this page permanently rather than by anybody remembering. It
 * has no API and cannot be queried, so naming it would promise a measurement
 * nobody can take.
 *
 * ⚠️ NO HEADING, AND IT HAD ONE. This block used to open with "Get cited where
 * your customers are asking" over "We put real questions to each of these…",
 * directly beneath a title and subtitle that were already selling the same
 * idea. Four lines, one argument, before the reader reached a price. The
 * selling belongs to the header; this row exists to say WHICH assistants, and
 * nothing else. Do not give it a headline again.
 *
 * ⚠️ THE LINE DOES NOT NAME THEM EITHER. The logos underneath do that, so
 * "We ask ChatGPT, Perplexity and Gemini" would print the three names twice in
 * forty pixels. "These three" is the whole trick.
 *
 * ⚠️ IT DESCRIBES THE ASKING, NEVER A RESULT. /about says plainly that anyone
 * guaranteeing citations is selling something, and /terms carries a No
 * Guarantee of Results section. "We ask" is safe; "you'll be cited" is not.
 */
function Engines() {
  return (
    <div className="text-center">
      <ul className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
        {ENGINES.map((engine) => (
          <li key={engine} className="text-navy flex items-center gap-2 text-sm font-medium">
            <EngineMark engine={engine} className="h-5 w-5" />
            {engine}
          </li>
        ))}
      </ul>

      <p className="text-slate mt-3 text-sm">We ask these three about your business.</p>
    </div>
  );
}

/**
 * Monthly or yearly, above the prices it changes.
 *
 * ⚠️ A PILL AGAIN, AND IT WAS RADIO ROWS. Those existed because the pill used
 * to sit inline against the buy button, where a segmented control reads as part
 * of the CTA. Centred above two cards there is nothing for it to collide with,
 * so the simpler control is the right one again.
 *
 * ⚠️ MONTHLY FIRST IN THE DOM, matching the default. Reading order is the
 * quieter half of "which one is the offer": a selected control sitting second
 * reads as a correction to the first rather than as the plan on sale. DOM order
 * is also tab order, so there is no tabIndex to keep in step.
 */
function PeriodToggle({
  annual,
  onPeriod,
  saving,
}: {
  annual: boolean;
  onPeriod: (annual: boolean) => void;
  saving: number;
}) {
  return (
    <div className="mt-8 flex justify-center">
      {/* ⚠️ COLOUR, AND THE SELECTED PAIR IS ONE OF TWO SANCTIONED ONES. It was
          a grey track with a white selected pill, which read as a settings
          control rather than as part of a pricing page. bg-primary with
          text-white is 5.17:1 — one of only two white-on-fill combinations this
          codebase allows (the other is navy). Do not reach for the gradient
          here: its cyan end takes navy type only, and white on it is 1.81:1. */}
      <div
        className="bg-primary-soft inline-flex items-center gap-1 rounded-full p-1"
        role="group"
        aria-label="Billing period"
      >
        <button
          type="button"
          onClick={() => onPeriod(false)}
          aria-pressed={!annual}
          className={`rounded-full px-4 py-1.5 text-sm transition-all duration-200 ${
            !annual
              ? 'bg-primary shadow-card font-semibold text-on-primary'
              : 'text-primary hover:text-primary-hover'
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => onPeriod(true)}
          aria-pressed={annual}
          className={`flex items-center gap-2 rounded-full py-1.5 pr-2 pl-4 text-sm transition-all duration-200 ${
            annual
              ? 'bg-primary shadow-card font-semibold text-on-primary'
              : 'text-primary hover:text-primary-hover'
          }`}
        >
          Yearly
          {/* The chip carries its own background, so it stays legible whether
              the pill under it is blue or not. Cyan fill with navy type: accent
              is a fill colour and never carries text — globals.css sets that. */}
          <span className="bg-accent-soft text-navy rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold">
            {Math.round(saving / PRO_PRICE.monthly)} months free
          </span>
        </button>
      </div>
    </div>
  );
}

function PlanCard({
  name,
  tagline,
  price,
  suffix,
  note,
  lead,
  features,
  current,
  featured = false,
  cta,
}: {
  name: string;
  /* ⚠️ From PLAN_COPY, never typed here. The public pricing card prints the
     same string, and these were two hand-kept literals until they moved. */
  tagline: string;
  price: string;
  suffix: string;
  note: string;
  lead?: string;
  features: string[];
  current: boolean;
  featured?: boolean;
  cta: React.ReactNode;
}) {
  return (
    <div
      className={`relative rounded-2xl border bg-surface p-6 sm:p-7 ${
        featured ? 'border-primary shadow-hero' : 'border-line shadow-card'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1.5rem]">{name}</h2>
        {current && (
          <span className="bg-primary-soft text-primary rounded-full px-2.5 py-0.5 text-xs font-semibold">
            Your plan
          </span>
        )}
      </div>

      {/* ⚠️ min-h-12 KEEPS THE TWO PRICES ON THE SAME LINE, AND THE VALUE IS
          MEASURED. The taglines are a sentence each and wrap to different line
          counts — one line for Free and two for Pro at 1280px — so without a
          floor the Free card's price sits higher and the pair stops reading as
          a pair. Two lines of text-sm at leading-relaxed is 45.5px, so the
          floor has to clear that: min-h-11 is 44px and left the prices 1px
          apart. Re-measure if a tagline grows to three lines. */}
      <p className="text-slate mt-2 min-h-12 text-sm leading-relaxed">{tagline}</p>

      <p className="mt-4 flex items-baseline gap-1.5">
        <span className="font-display text-navy text-[2.5rem] leading-none font-extrabold">
          {price}
        </span>
        <span className="text-slate text-sm">{suffix}</span>
      </p>
      {/* Fixed height so the two cards' buttons line up whichever note is
          longer — the annual line is a good deal longer than "No card needed". */}
      <p className="text-slate mt-1.5 min-h-8 text-xs leading-4">{note}</p>

      {cta && <div className="mt-4">{cta}</div>}

      <p className="text-navy mt-7 text-[0.9375rem] font-semibold">{lead ?? 'Features'}</p>

      {/* ⚠️ 15/16px, NOT text-sm, AND THE COPY WAS SHORTENED TO MATCH. These
          were 14px sentences long enough to wrap twice in a card this narrow,
          which is how a feature list stops being scannable — the reader is
          meant to take it in at a glance, not read it. Bigger type only works
          because the strings got shorter; lengthen one and this goes back to
          being a paragraph. */}
      <ul className="mt-3 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="text-slate flex gap-2.5 text-[0.9375rem] sm:text-base">
            <Check className="text-primary mt-[0.4rem] shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

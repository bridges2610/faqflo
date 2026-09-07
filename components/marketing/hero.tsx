import { Sparkle, Underline } from '@/components/ui/doodle';
import { StartForm } from './start-form';

/*
  The hero visual is a small story rather than a screenshot: someone asks an
  assistant a question, and the answer comes back citing the customer. That's
  the product promise in one glance, and it stays honest — it's an illustration
  of the outcome, not a fake product UI.

  The two cards tilt in opposite directions and overlap, so the pair reads as
  something arranged by hand rather than two divs in a stack.
*/
function AnswerCard() {
  // Vertical padding just clears the cards' tilt so rotated corners don't clip.
  return (
    <div className="relative mx-auto w-full max-w-md py-3">
      {/* The question */}
      <div className="border-line shadow-card tilt-b relative z-10 ml-auto w-fit max-w-[86%] rounded-2xl rounded-br-md border bg-white px-4 py-3">
        <p className="text-navy text-[0.9375rem]">
          &ldquo;Who can fix a leaking roof in Franklin this week?&rdquo;
        </p>
      </div>

      {/* The answer */}
      <div className="shadow-hero tilt-a relative mt-3 rounded-2xl rounded-bl-md bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <span
            className="bg-brand-gradient-bright text-navy flex h-6 w-6 items-center justify-center rounded-full text-[0.6875rem] font-bold"
            aria-hidden="true"
          >
            AI
          </span>
          <span className="text-slate text-xs font-medium">AI assistant</span>
        </div>

        <p className="text-navy text-[0.9375rem] leading-relaxed">
          Yes —{' '}
          <span className="relative inline-block font-semibold">
            Summit Roofing
            <Underline className="text-accent absolute -bottom-1 left-0 h-2 w-full" />
          </span>{' '}
          covers emergency roof repairs across Franklin, usually on site within 24 hours.
        </p>

        {/*
          The source chip is the whole point of the illustration — a citation
          with nothing cited isn't a citation — so it stays, but the domain is
          blurred rather than named. It reads as "your site goes here" instead
          of putting a specific business on the page.

          The blurred text is aria-hidden and unselectable, with a plain label
          for screen readers: nobody should have a fake domain read out to them
          as though it were real.
        */}
        <div className="border-line mt-4 flex items-center gap-2 border-t pt-3">
          <span className="text-slate text-xs">Source</span>
          <span className="bg-primary-soft text-primary rounded-md px-2 py-0.5 font-mono text-xs">
            <span className="sr-only">the cited website</span>
            <span
              className="inline-block blur-[3px] select-none"
              aria-hidden="true"
            >
              summitroofing.com
            </span>
          </span>
        </div>
      </div>

    </div>
  );
}

export function Hero() {
  return (
    <section className="bloom relative overflow-hidden px-5 pt-16 pb-20 sm:px-8 sm:pt-24">
      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div>
          <span className="border-line text-navy shadow-soft inline-flex items-center gap-2 rounded-full border bg-white/80 px-3 py-1 text-[0.8125rem] font-medium">
            <Sparkle className="text-accent h-3.5 w-3.5" />
            Can AI read your site?
          </span>

          <h1 className="mt-6 text-[2.75rem] leading-[1.05] text-balance sm:text-[3.5rem]">
            Get your business{' '}
            <span className="relative inline-block whitespace-nowrap">
              <span className="text-brand-gradient">found on AI</span>
              <Underline className="text-accent absolute -bottom-2 left-0 h-4 w-full sm:-bottom-3 sm:h-5" />
            </span>
          </h1>

          {/* ⚠️ max-w-xl SO THIS SETS IN TWO LINES, NOT THREE. At max-w-lg the
              measure was 512px and the sentence broke onto a third line on
              every desktop width. The grid column is 557px at 1280 and 1440, so
              xl is really "take the column" — measured, it and max-w-none give
              the identical 557px and the same two lines. Kept as a cap rather
              than removed: if that column ever widens, a 700px measure of 18px
              text is past what anybody reads comfortably.

              Below lg the column is 459px and this is three lines whatever the
              cap says. That is the column, not this class — shortening the
              sentence is the only lever there. */}
          <p className="text-slate mt-8 max-w-xl text-lg leading-relaxed">
            See whether ChatGPT, Perplexity and Google&rsquo;s AI can read your site — then turn what
            you know into answers they can quote.
          </p>

          {/* ⚠️ THE FORM IS SHARED WITH /free-report NOW — see
              components/marketing/start-form.tsx, which carries the reasoning
              that used to live here: why it is a plain GET, why there is no
              client-side validation, and why the field is white on this
              gradient. Both pages start a check the same way, so there is one
              form rather than two that agree today. */}
          <StartForm id="hero-domain" className="mt-9" />

          {/* ⚠️ HERE RATHER THAN INSIDE StartForm, WHICH IS SHARED WITH
              /free-report. That page is already headed by an explanation of
              what the check costs, so the same line there would be the second
              time a reader is told in one screen. The form stays about the
              form.

              It is a claim, not decoration: free really does need no card, and
              PLAN_COPY.free in lib/dashboard/plans.ts is what it has to keep
              agreeing with. */}
          {/*
            ⚠️ THIS SITS BELOW THE AA CONTRAST BAR, DELIBERATELY AND ON REQUEST.
            Measured on the hero's own ground: 3.5:1 in light, 4.3:1 in dark,
            against the 4.5:1 that WCAG AA asks for text under 18.66px. It was
            /85 (4.9:1, passing) and was asked to go lighter twice.

            ⚠️ SO IT MUST STAY A REASSURANCE AND NEVER CARRY A FACT NOBODY ELSE
            STATES. Nothing here is load-bearing: the price is on the pricing
            card, the plan table and /dashboard/plan, all at full contrast. If
            this line ever becomes the only place something is said, it needs to
            go back to /85 first.

            The AA-passing route to a lighter LOOK, if it is ever wanted back:
            18.66px or larger drops the bar to 3:1, at which point this passes
            as written.
          */}
          <p className="text-slate/70 mt-3 text-sm">Completely free to start.</p>
        </div>

        <AnswerCard />
      </div>
    </section>
  );
}

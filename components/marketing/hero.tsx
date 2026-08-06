import { ButtonLink } from '@/components/ui/button';
import { Sparkle, Underline } from '@/components/ui/doodle';

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
            <span className="sr-only">your website</span>
            <span
              className="inline-block blur-[3px] select-none"
              aria-hidden="true"
            >
              yourbusiness.com
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
            Your customers are asking AI
          </span>

          <h1 className="mt-6 text-[2.75rem] leading-[1.05] text-balance sm:text-[3.5rem]">
            Get your business{' '}
            <span className="relative inline-block whitespace-nowrap">
              <span className="text-brand-gradient">cited by AI</span>
              <Underline className="text-accent absolute -bottom-2 left-0 h-4 w-full sm:-bottom-3 sm:h-5" />
            </span>
          </h1>

          <p className="text-slate mt-8 max-w-lg text-lg leading-relaxed">
            Find out whether ChatGPT, Perplexity and Google&rsquo;s AI answers can even read your
            site — then turn what you know into answers they can quote, published on your own
            domain.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink href="/#audit" size="lg" arrow>
              Check my site free
            </ButtonLink>
            <ButtonLink href="/#how" size="lg" variant="ghost">
              See how it works
            </ButtonLink>
          </div>

          <p className="text-slate mt-5 text-sm">
            No signup for the check. Your content stays on your domain.
          </p>
        </div>

        <AnswerCard />
      </div>
    </section>
  );
}

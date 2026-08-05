import { ButtonLink } from '@/components/ui/button';
import { Sparkle } from '@/components/ui/doodle';

/*
  Full-bleed band — edge to edge, no rounded container, no side margins.

  Bright cyan with navy type. Counter-intuitively this is both more vibrant AND
  more readable than white type on a darker gradient: navy holds 7.96:1 across
  the sweep, where white managed 5.17:1 only because the cyan had been dulled to
  teal. Dark text is what lets the colour stay bright.

  The grain overlay keeps the gradient from reading as flat digital fill.
*/
export function FinalCta() {
  return (
    <section className="bg-brand-gradient-bright grain relative isolate overflow-hidden">
      {/* Soft highlights so the band has depth across its full width. */}
      <span
        className="pointer-events-none absolute -top-40 left-[8%] h-96 w-96 rounded-full bg-white/25 blur-3xl"
        aria-hidden="true"
      />
      <span
        className="pointer-events-none absolute -bottom-40 right-[6%] h-96 w-96 rounded-full bg-white/20 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-8 px-5 py-20 text-center sm:px-8 sm:py-24 lg:flex-row lg:justify-between lg:text-left">
        <div>
          {/* Full navy, not navy/70 — at 70% it composites to 4.22:1 on the
              band, just under the 4.5 bar for small text. */}
          <span className="text-navy inline-flex items-center gap-2 text-[0.8125rem] font-semibold tracking-wide uppercase">
            <Sparkle className="h-3.5 w-3.5" />
            Two minutes, start to finish
          </span>

          <h2 className="text-navy mt-4 text-[2.25rem] text-balance sm:text-[3rem]">
            Paste one line. You&rsquo;re live.
          </h2>
          <p className="text-navy/75 mt-4 max-w-lg text-[1.0625rem] leading-relaxed">
            Try the generator now — no account, no card, no catch.
          </p>
        </div>

        <ButtonLink href="/#try" size="lg" arrow variant="dark" className="shrink-0">
          Write my FAQs
        </ButtonLink>
      </div>
    </section>
  );
}

import { Underline } from '@/components/ui/doodle';

/*
  What this is, and who it is for — said once, briefly.

  It fills the slot the audit band left when that moved to /free-report. Before
  it, someone landing on the page went from a headline and a domain field
  straight into "Who is actually reading your site", having never been told what
  FaqFlo actually is or that it was built for them.

  ⚠️ THE HEADING IS NOT "not marketers" ANY MORE, AND THAT IS NOT A TRIM.
  It said "Built for business owners, not marketers" until the body gained the
  line about handing the work to whoever does your marketing — at which point
  the heading was arguing with the paragraph under it. Naming the audience is
  the job here; ruling anyone out was never part of it. If "not marketers" gets
  put back, the hand-off line has to go with it.

  ⚠️ IT DELIBERATELY DOES NOT DESCRIBE WHAT THE PRODUCT DOES TO YOUR SITE. That
  is the trap here, and it is easy to fall back into. The hero sits directly
  above and already says "turn what you know into answers they can quote,
  published on your own domain" — so a paragraph about finding questions,
  writing answers and tracking citations would be the hero again in different
  words, one screen later. What this adds instead is the SHAPE of the thing: a
  snapshot you are handed, and two honest things to do with it.

  ⚠️ NO FEATURE LIST, EVER. who-and-features.tsx and pricing-teaser.tsx already
  hold the same six Pro features twice, under a warning that says they drifted
  apart once already. A third copy is a third thing to keep in step.

  ⚠️ NO ENGINE NAMES EITHER. The hero names ChatGPT, Perplexity and Gemini in
  the paragraph above; Stats names the four crawlers in the band below. A third
  listing wedged between them is noise — and skipping it sidesteps the
  "Gemini, never AI Overviews" rule entirely rather than having to obey it.

  ⚠️ THE YEAR IS STAMPED AT BUILD TIME, NOT AT REQUEST TIME. This page is
  statically prerendered, so `new Date().getFullYear()` runs once during
  `next build` and is then frozen into the HTML. It follows site-footer.tsx,
  which does the same thing — but a stale copyright line in January is a
  shrug, and "more customers in 2026" still on screen in February 2027 is not.
  It self-corrects on the first deploy of the new year, so this is only safe
  while the site ships regularly. If deploys ever get sparse, the fix is
  `export const revalidate = 86400` on app/(marketing)/page.tsx — not a client
  component, which would leave the year out of the HTML crawlers read.
*/
export function BuiltForOwners() {
  return (
    <section className="bg-white px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-3xl text-center">
        {/* Not "Plain English" — what-is-aeo.tsx already uses that kicker
            further down this same page — and not "Fit & features", which is
            the #who section's. */}
        <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">What FaqFlo is</p>

        <h2 className="mt-4 text-[2rem] text-balance sm:text-[2.5rem]">
          Built for business{' '}
          <span className="relative inline-block">
            owners
            <Underline className="text-accent absolute -bottom-2 left-0 h-3.5 w-full" />
          </span>
        </h2>

        <p className="text-slate mt-6 text-[1.0625rem] leading-relaxed">
          A plain-English snapshot of where your site stands with AI today — what&rsquo;s working,
          what isn&rsquo;t, and what to fix. Act on it yourself, or hand it to whoever does your
          marketing.
        </p>

        {/* The payoff, on its own line. Navy rather than slate: bold slate on
            white reads as muddy rather than emphatic, and navy is what the rest
            of the site uses to lift a line out of body copy. Same size as the
            paragraph above, so it reads as that paragraph's conclusion rather
            than a second heading. */}
        <p className="text-navy mt-6 text-[1.0625rem] font-semibold">
          The goal is simple: more customers in {new Date().getFullYear()}.
        </p>

        <p className="text-slate mt-6 text-sm">No plugin. No agency. No new vocabulary.</p>
      </div>
    </section>
  );
}

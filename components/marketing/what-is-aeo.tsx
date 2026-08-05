import { CurvedArrow, Underline } from '@/components/ui/doodle';

/*
  The definition section.

  Played as a dictionary entry, with a straight definition and an honest one
  underneath it. That framing does two jobs: it explains an unfamiliar acronym
  without sounding like a whitepaper, and the "informal" line is where the real
  benefit lands in words someone would actually say out loud.

  The old-way/new-way pair below is the payoff — SEO gets you into the list,
  AEO means there isn't one.
*/
export function WhatIsAeo() {
  return (
    <section id="aeo" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="max-w-xl">
          <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">
            Plain English
          </p>
          <h2 className="mt-4 text-[2rem] text-balance sm:text-[2.5rem]">
            What the heck is{' '}
            <span className="relative inline-block">
              AEO
              <Underline className="text-accent absolute -bottom-2 left-0 h-3.5 w-full" />
            </span>
            ?
          </h2>
        </div>

        {/* Dictionary entry */}
        <div className="border-line shadow-card tilt-a mt-12 rounded-2xl border bg-white p-7 sm:p-10">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-display text-navy text-[2.5rem] leading-none font-extrabold sm:text-[3rem]">
              AEO
            </span>
            <span className="text-slate font-mono text-sm">/eɪ·iː·ˈəʊ/</span>
            <span className="text-slate text-sm italic">noun</span>
          </div>

          <ol className="mt-7 space-y-6">
            <li className="flex gap-4">
              <span className="text-slate w-4 shrink-0 font-mono text-sm">1.</span>
              <p className="text-navy text-[1.0625rem] leading-relaxed">
                <span className="font-semibold">Answer Engine Optimisation.</span>{' '}
                <span className="text-slate">
                  Shaping your content so AI assistants can find it, understand it, and quote it
                  back to whoever asked.
                </span>
              </p>
            </li>
            <li className="flex gap-4">
              <span className="text-slate w-4 shrink-0 font-mono text-sm">2.</span>
              <p className="text-navy text-[1.0625rem] leading-relaxed">
                <span className="text-slate italic">informal —</span>{' '}
                <span className="font-semibold">
                  making sure that when someone asks a robot about your line of work, your name is
                  in the answer.
                </span>
              </p>
            </li>
          </ol>

          <p className="border-line text-slate mt-8 border-t pt-5 text-sm">
            <span className="font-mono text-xs tracking-wide uppercase">see also</span> · getting
            picked, being the source, that thing your competitor hasn&rsquo;t done yet
          </p>
        </div>

        {/* The payoff: what actually changed */}
        <div className="relative mt-8 grid gap-5 sm:grid-cols-2">
          <div className="border-line bg-cloud tilt-b rounded-2xl border p-7">
            <p className="text-slate font-mono text-xs tracking-wide uppercase">The old way</p>
            <h3 className="text-slate mt-3 text-xl">SEO</h3>
            <p className="text-slate mt-2.5 text-[0.9375rem] leading-relaxed">
              Climb a list of ten blue links and hope someone scrolls to you, then clicks.
            </p>
          </div>

          <div className="bg-brand-gradient-bright grain tilt-a relative overflow-hidden rounded-2xl p-7">
            <p className="text-navy relative font-mono text-xs tracking-wide uppercase">
              The new way
            </p>
            <h3 className="text-navy relative mt-3 text-xl">AEO</h3>
            <p className="text-navy/80 relative mt-2.5 text-[0.9375rem] leading-relaxed">
              Be the answer itself — so there&rsquo;s no list to climb and nothing to scroll past.
            </p>
          </div>

          {/* Hand-drawn arrow between the two panels. */}
          <CurvedArrow
            className="text-slate/45 absolute top-1/2 left-1/2 hidden h-10 w-10 -translate-x-1/2 -translate-y-1/2 -rotate-12 sm:block"
            aria-hidden="true"
          />
        </div>

        <p className="text-slate mx-auto mt-10 max-w-xl text-center text-[1.0625rem] leading-relaxed">
          FAQs happen to be the format answer engines read best. That&rsquo;s the whole idea behind
          FaqFlo.
        </p>
      </div>
    </section>
  );
}

import { Card } from '@/components/ui/card';

/*
  The loop, which is the product.

  Five steps rather than three, because the last one is the whole argument:
  anyone can generate FAQs, but knowing whether an AI engine actually started
  quoting you is the part nobody else does. Track feeds back into Discover —
  the questions you aren't cited for become the next thing you answer.

  The code block below shows what the customer receives: plain HTML they paste
  into their own site. It is deliberately not a script tag. AI crawlers don't
  run JavaScript, so anything a script would draw is invisible to exactly the
  audience this product exists to reach.
*/
const STEPS = [
  {
    n: '01',
    title: 'Audit',
    body: 'We fetch your site the way a crawler does and check whether your content is even readable — and whether robots.txt lets the AI engines in.',
  },
  {
    n: '02',
    title: 'Discover',
    body: 'The questions people actually put to AI about your category and your area, rather than the ones you assume they ask.',
  },
  {
    n: '03',
    title: 'Generate',
    body: 'Answer-first, factual, specific. Written to be lifted whole into an answer, with your name attached to it. Or turn any question into a full article in one click.',
  },
  {
    n: '04',
    title: 'Publish',
    body: 'You get clean HTML to paste into your own site. It lives on your domain, so the citation and the click go to you.',
  },
  {
    n: '05',
    title: 'Track',
    // ⚠️ Gemini, not AI Overviews — Overviews has no API and cannot be asked by
    // anyone. See the warning on ENGINES in lib/dashboard/types.ts.
    body: 'See what ChatGPT, Perplexity and Gemini say when asked your questions — who they cite, and who takes the click instead. What you are missed on goes back to step two.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="bg-tint-cyan scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">
              How it works
            </p>
            <h2 className="mt-4 max-w-md text-[2rem] text-balance sm:text-[2.5rem]">
              A loop, not a one-off
            </h2>
          </div>
          <p className="text-slate max-w-sm text-[1.0625rem] leading-relaxed lg:pb-2 lg:text-right">
            Five steps, and the last one starts the first one again.
          </p>
        </div>

        {/* Five across is too many at this size, so it wraps to a 2/3 grid and
            reads in rows — the numbers carry the order. */}
        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <Card as="li" key={step.n} className={`p-7 ${i % 2 === 0 ? 'tilt-a' : 'tilt-b'}`}>
              <span className="bg-brand-gradient-bright font-display text-navy shadow-soft flex h-11 w-11 items-center justify-center rounded-full text-sm font-extrabold">
                {step.n}
              </span>
              <h3 className="mt-5 text-xl">{step.title}</h3>
              <p className="text-slate mt-2.5 text-[0.9375rem] leading-relaxed">{step.body}</p>
            </Card>
          ))}

          <Card tone="cloud" as="li" className="flex flex-col justify-center p-7">
            <p className="text-slate font-mono text-xs tracking-wide uppercase">And then</p>
            <p className="text-navy mt-3 text-[0.9375rem] leading-relaxed">
              Step five hands you the questions you aren&rsquo;t being cited for. Those go straight
              back into step two, and around it goes.
            </p>
          </Card>
        </ol>

        <div className="mt-16">
          <p className="text-slate mx-auto mb-4 max-w-2xl text-center text-sm">
            What you paste into your site — plain HTML, no script, nothing to install:
          </p>
          <div className="flex justify-center">
            <div className="bg-navy shadow-hero grain relative w-full max-w-2xl overflow-hidden rounded-2xl p-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex gap-1.5" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                </span>
                <span className="ml-1 font-mono text-xs text-white/60">your-page.html</span>
              </div>
              <code className="block overflow-x-auto font-mono text-[0.8125rem] leading-relaxed whitespace-pre text-white">
                <span className="text-white/50">&lt;section</span>{' '}
                <span className="text-accent">class</span>
                <span className="text-white/50">=</span>
                <span className="text-white">&quot;faq&quot;</span>
                <span className="text-white/50">&gt;</span>
                {'\n  '}
                <span className="text-white/50">&lt;h2&gt;</span>
                <span className="text-white">Do you handle emergency repairs?</span>
                <span className="text-white/50">&lt;/h2&gt;</span>
                {'\n  '}
                <span className="text-white/50">&lt;p&gt;</span>
                <span className="text-white">Yes — two crews on call, on site within 24 hours…</span>
                <span className="text-white/50">&lt;/p&gt;</span>
                {'\n'}
                <span className="text-white/50">&lt;/section&gt;</span>
              </code>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

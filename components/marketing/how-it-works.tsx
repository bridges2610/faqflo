import { Card } from '@/components/ui/card';

const STEPS = [
  {
    n: '01',
    title: 'Add your FAQs',
    body: 'Write them yourself or let FaqFlo draft them from a page you already have. Edit anything you like.',
    tilt: 'tilt-a',
    offset: 'lg:mt-0',
  },
  {
    n: '02',
    title: 'Paste one line',
    body: 'Drop a single script tag into your site. No plugins, no developer, no redesign.',
    tilt: 'tilt-b',
    offset: 'lg:mt-8',
  },
  {
    n: '03',
    title: 'Get found',
    body: 'Your answers go out in the format search engines and AI assistants read best — so they can quote you.',
    tilt: 'tilt-a',
    offset: 'lg:mt-2',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="bg-tint-cyan scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        {/* Heading sits left with the intro beside it, rather than another
            centred stack — the page already uses that shape elsewhere. */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">
              How it works
            </p>
            <h2 className="mt-4 max-w-md text-[2rem] text-balance sm:text-[2.5rem]">
              Live in about two minutes
            </h2>
          </div>
          <p className="text-slate max-w-sm text-[1.0625rem] leading-relaxed lg:pb-2 lg:text-right">
            Three steps, and none of them involve a developer.
          </p>
        </div>

        {/* Cards sit at slightly different heights and angles — arranged, not
            snapped to a grid. */}
        <ol className="mt-14 grid gap-5 md:grid-cols-3">
          {STEPS.map((step) => (
            <Card as="li" key={step.n} className={`p-7 ${step.tilt} ${step.offset}`}>
              <span className="bg-brand-gradient-bright font-display text-navy shadow-soft flex h-11 w-11 items-center justify-center rounded-full text-sm font-extrabold">
                {step.n}
              </span>
              <h3 className="mt-5 text-xl">{step.title}</h3>
              <p className="text-slate mt-2.5 text-[0.9375rem] leading-relaxed">{step.body}</p>
            </Card>
          ))}
        </ol>

        <div className="mt-16 flex justify-center">
          <div className="bg-navy shadow-hero grain relative w-full max-w-2xl overflow-hidden rounded-2xl p-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
              </span>
              <span className="ml-1 font-mono text-xs text-white/60">the whole install</span>
            </div>
            <code className="block overflow-x-auto font-mono text-[0.8125rem] leading-relaxed whitespace-pre text-white">
              <span className="text-white/50">&lt;script</span>{' '}
              <span className="text-accent">src</span>
              <span className="text-white/50">=</span>
              <span className="text-white">&quot;https://faqflo.com/embed.js&quot;</span>{' '}
              <span className="text-accent">data-site</span>
              <span className="text-white/50">=</span>
              <span className="text-white">&quot;your-site-id&quot;</span>
              <span className="text-white/50">&gt;&lt;/script&gt;</span>
            </code>
          </div>
        </div>
      </div>
    </section>
  );
}

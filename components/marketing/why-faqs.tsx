import { Card } from '@/components/ui/card';
import { Underline } from '@/components/ui/doodle';

/*
  The case for the format itself, told as a chain.

  A chain rather than three parallel cards because the argument is causal —
  each step causes the next, and the last one is money. (It's also, conveniently,
  the brand name.)

  Step 01 uses a bracketed [service]/[city] template rather than the hero's
  roofing scenario, so any visitor can drop their own trade into it.
*/
const STEPS = [
  {
    n: '01',
    title: 'They ask an assistant, not a search box',
    body: '"Who does [service] in [city]?" There is no list of ten links to work through any more — there is one answer, and either you are in it or you are not.',
  },
  {
    n: '02',
    title: 'The assistant needs something quotable',
    body: 'It is looking for a specific question with a short, factual answer attached. Marketing prose spread across a page gives it nothing it can lift.',
  },
  {
    n: '03',
    title: 'A Q&A block is exactly that shape',
    body: 'Question, answer, on your own domain, in plain HTML a crawler can read on the first request. That is why FAQs are the vehicle — not because FAQs are the point.',
  },
];

/** Connector between beats — vertical when stacked, horizontal when in a row. */
function Connector() {
  return (
    <div className="flex items-center justify-center md:h-full" aria-hidden="true">
      {/* stacked */}
      <svg className="text-rule-strong h-8 w-5 md:hidden" viewBox="0 0 20 32" fill="none">
        <path
          d="M10 1v22"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="3 5"
        />
        <path
          d="M5 20l5 6 5-6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/* side by side */}
      <svg className="text-rule-strong hidden h-5 w-8 md:block" viewBox="0 0 32 20" fill="none">
        <path
          d="M1 10h22"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="3 5"
        />
        <path
          d="M20 5l6 5-6 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function WhyFaqs() {
  return (
    <section id="why-faqs" className="scroll-mt-24 bg-white px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">
            Why Q&amp;A
          </p>
          <h2 className="mt-4 text-[2rem] text-balance sm:text-[2.5rem]">
            Why answers, and not more{' '}
            <span className="relative inline-block">
              content
              <Underline className="text-accent absolute -bottom-2 left-0 h-3.5 w-full" />
            </span>
            ?
          </h2>
          <p className="text-slate mt-6 text-[1.0625rem] leading-relaxed">
            Because your customers aren&rsquo;t browsing. They&rsquo;re asking a machine — and that
            machine is looking for something short enough to quote and clear enough to trust.
          </p>
        </div>

        {/* The chain */}
        <div className="mt-14 flex flex-col md:flex-row md:items-stretch">
          {STEPS.map((step, i) => (
            <div key={step.n} className="contents">
              {i > 0 && <Connector />}
              <Card className={`flex-1 p-7 ${i % 2 === 0 ? 'tilt-a' : 'tilt-b'}`}>
                <span className="bg-brand-gradient-bright font-display text-navy shadow-soft flex h-10 w-10 items-center justify-center rounded-full text-[0.8125rem] font-extrabold">
                  {step.n}
                </span>
                <h3 className="mt-5 text-lg leading-snug">{step.title}</h3>
                <p className="text-slate mt-2.5 text-[0.9375rem] leading-relaxed">{step.body}</p>
              </Card>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

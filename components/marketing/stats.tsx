/*
  The outcome numbers, as a compact list.

  Two things worth knowing:

  1. The ranges are framed as industry-typical, not a FaqFlo promise, and the
     qualifier line says so plainly. They're unsourced, and the brand voice rule
     is "never overpromise". If real sources turn up, each stat gains a `source`
     field and a cited footnote.

  2. The ranges are set in solid primary rather than the brand gradient. At this
     size they're no longer "large text" under WCAG, so they need 4.5:1 instead
     of 3:1 — the gradient's #0891B2 end only manages 3.38:1 on the blue tint,
     where solid #2563EB clears 4.75:1.
*/
const STATS = [
  {
    range: '2–10%',
    title: 'More conversions',
    body: 'Objections get answered before they stall the sale.',
  },
  {
    range: '10–30%',
    title: 'Better-qualified leads',
    body: 'They arrive ready to buy, needing less convincing.',
  },
  {
    range: '15–40%',
    title: 'Fewer repeat questions',
    body: 'The same five questions stop reaching your inbox.',
  },
  {
    range: '10–30%',
    title: 'More engagement',
    body: 'Visitors stay to read instead of bouncing.',
  },
  {
    range: '10–40%',
    title: 'More ways to be found',
    body: 'Every question is another search you can win.',
  },
];

export function Stats() {
  return (
    <section className="bg-tint-blue px-5 py-14 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="text-[1.5rem] sm:text-[1.75rem]">What FAQs do for your business</h2>
          <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">
            By the numbers
          </p>
        </div>

        <ul className="divide-line border-line mt-7 divide-y border-t">
          {STATS.map((stat) => (
            <li
              key={stat.title}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-3.5 sm:flex-nowrap"
            >
              {/* whitespace-nowrap matters: at this weight "10–30%" breaks
                  after the en dash and the row grows to two lines. */}
              <span className="font-display text-primary w-28 shrink-0 text-xl leading-none font-extrabold whitespace-nowrap tabular-nums">
                {stat.range}
              </span>
              <span className="text-navy w-full font-semibold sm:w-56 sm:shrink-0">
                {stat.title}
              </span>
              <span className="text-slate text-[0.9375rem] leading-snug">{stat.body}</span>
            </li>
          ))}
        </ul>

        <p className="text-slate mt-5 text-xs leading-relaxed">
          Typical ranges reported by businesses that publish and maintain FAQs — not a guarantee of
          your results.
        </p>
      </div>
    </section>
  );
}

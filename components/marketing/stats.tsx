/*
  The crawlers, named.

  This band used to carry conversion and engagement percentages. They were
  unsourced, and under the new positioning they were also answering a question
  nobody on this page is asking — the product is AI visibility, not conversion
  rate.

  What replaces them is checkable rather than estimated: these are the actual
  user-agent tokens that fetch pages on behalf of the AI engines, and the row
  says what each one feeds. No invented numbers, nothing to caveat.
*/
const CRAWLERS = [
  {
    agent: 'GPTBot',
    owner: 'OpenAI',
    body: 'Fetches pages for ChatGPT. Blocked in robots.txt on more sites than their owners realise.',
  },
  {
    agent: 'ClaudeBot',
    owner: 'Anthropic',
    body: 'Fetches pages for Claude. Same rules, separate token — allowing one does not allow the other.',
  },
  {
    agent: 'Google-Extended',
    owner: 'Google',
    body: 'Controls whether your content can be used in Gemini and AI Overviews, separately from normal search.',
  },
  {
    agent: 'PerplexityBot',
    owner: 'Perplexity',
    body: 'Perplexity leans hard on citations, which makes it the fastest place to see whether this is working.',
  },
];

export function Stats() {
  return (
    <section className="bg-tint-blue px-5 py-14 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="text-[1.5rem] sm:text-[1.75rem]">Who is actually reading your site</h2>
          <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">
            The four crawlers
          </p>
        </div>

        <ul className="divide-line border-line mt-7 divide-y border-t">
          {CRAWLERS.map((crawler) => (
            <li
              key={crawler.agent}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-3.5 sm:flex-nowrap"
            >
              <span className="font-display text-primary w-40 shrink-0 text-[0.9375rem] leading-none font-extrabold whitespace-nowrap">
                {crawler.agent}
              </span>
              <span className="text-navy w-full font-semibold sm:w-28 sm:shrink-0">
                {crawler.owner}
              </span>
              <span className="text-slate text-[0.9375rem] leading-snug">{crawler.body}</span>
            </li>
          ))}
        </ul>

        <p className="text-slate mt-5 text-xs leading-relaxed">
          None of them run JavaScript. If your answers only appear after a script runs, every one of
          these sees an empty page.
        </p>
      </div>
    </section>
  );
}

import { AnthropicMark, GoogleMark, OpenAiMark, PerplexityMark } from '@/components/ui/ai-marks';

/*
  The crawlers, named.

  This band used to carry conversion and engagement percentages. They were
  unsourced, and under the new positioning they were also answering a question
  nobody on this page is asking — the product is AI visibility, not conversion
  rate.

  What replaces them is checkable rather than estimated: these are the actual
  user-agent tokens that fetch pages on behalf of the AI engines, and the row
  says what each one feeds. No invented numbers, nothing to caveat.

  ⚠️ THE MARK IS THE OWNER'S, NOT THE TOKEN'S. Each row carries the logo of the
  company that operates the crawler, beside a user-agent string that has no logo
  of its own. That is nominative use and nothing more — see the header of
  components/ui/ai-marks.tsx. This band names four companies as the parties
  reading your site, which is a claim about them rather than about us, and it is
  the only place on the marketing site where these marks appear.
*/
const CRAWLERS = [
  {
    agent: 'GPTBot',
    owner: 'OpenAI',
    Mark: OpenAiMark,
    body: 'Fetches pages for ChatGPT. Blocked in robots.txt on more sites than their owners realise.',
  },
  {
    agent: 'ClaudeBot',
    owner: 'Anthropic',
    Mark: AnthropicMark,
    body: 'Fetches pages for Claude. Same rules, separate token — allowing one does not allow the other.',
  },
  {
    agent: 'Google-Extended',
    owner: 'Google',
    // Google's "G", not Gemini's spark. This row is the crawler token that
    // gates both Gemini and AI Overviews; the spark belongs to the engine we
    // actually put questions to, which only exists in the dashboard.
    Mark: GoogleMark,
    body: 'Controls whether your content can be used in Gemini and AI Overviews, separately from normal search.',
  },
  {
    agent: 'PerplexityBot',
    owner: 'Perplexity',
    Mark: PerplexityMark,
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
              {/* The mark and the token are one cell, not two.

                  The row aligns on the baseline so the owner and the body sit
                  level with the token — and a logo has no baseline to align on.
                  Pairing them inside their own `items-center` box centres the
                  mark against the word it belongs to, while the box itself
                  still hands that word's baseline up to the row. The width
                  moved here from the text span so the owner column starts where
                  it always did; w-44 rather than w-40 because the mark and its
                  gap have to come out of the same ten rems. */}
              <span className="flex w-44 shrink-0 items-center gap-2">
                <crawler.Mark className="h-4.5 w-4.5 shrink-0" />
                <span className="font-display text-primary text-[0.9375rem] leading-none font-extrabold whitespace-nowrap">
                  {crawler.agent}
                </span>
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

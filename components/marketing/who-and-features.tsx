import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Check } from '@/components/ui/check';
import { Sparkle, Underline } from '@/components/ui/doodle';

/*
  The fit section: "is this for me, and what do I actually get?"

  It sits immediately before pricing because that's the question a visitor has
  to answer before a price means anything. Everything above it argues the case
  for FAQs in general; this is the first place the product is matched to a
  person.

  The audiences are deliberately broad. The rest of the page leans on one
  worked example (a roofer), which is vivid but narrow — anyone who isn't a
  local trade has been left to infer whether they belong here. Six general
  buckets cover most of who lands on the page without naming a single trade.

  Features are split shipped/coming rather than blended, and the coming ones
  are tagged. The roadmap is worth showing — it's most of why someone would pay
  later — but an untagged list would be a promise the app doesn't currently
  keep, and it would contradict the caveat under the pricing cards.
*/

type Audience = { who: string; line: string };

const AUDIENCES: Audience[] = [
  {
    who: 'Service businesses',
    line: 'Trades, clinics, contractors — anyone answering “do you do X in Y?” all day.',
  },
  {
    who: 'E-commerce',
    line: 'Product pages where sizing, shipping and returns decide the sale.',
  },
  {
    who: 'Agencies',
    line: 'Ship FAQs across every client site without writing them from scratch.',
  },
  {
    who: 'Freelancers',
    line: 'One-person shops that need to look like they’ve thought of everything.',
  },
  {
    who: 'SaaS',
    line: 'Turn docs and onboarding questions into answers assistants can quote.',
  },
  {
    who: 'Bloggers & creators',
    line: 'Give every post a Q&A block an answer engine can lift.',
  },
];

/* Paid features only — the free generator sells itself two sections up, and
   repeating it here would bury the reason to upgrade. Every line matches a
   bullet on a paid plan in pricing-teaser.tsx, so the two sections can't drift.
   None of these have shipped yet, which is why the column is tagged once at the
   top rather than on all six rows. */
const FEATURES = [
  'Premium FAQ generator (unlimited)',
  'Embed widget — one line of code',
  'Style controls to match your site',
  'FAQ schema published for you',
  'Analytics on what people actually ask',
  'AEO opportunities — questions you aren’t answering yet',
];

/** Small caps kicker above each column heading, as used on the AEO panels. */
function Kicker({ children }: { children: string }) {
  return <p className="text-slate font-mono text-xs tracking-wide uppercase">{children}</p>;
}

export function WhoAndFeatures() {
  return (
    <section id="who" className="scroll-mt-24 bg-white px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">
            Fit &amp; features
          </p>
          <h2 className="mt-4 text-[2rem] text-balance sm:text-[2.5rem]">
            Built for anyone with customers who{' '}
            <span className="relative inline-block">
              ask
              <Underline className="text-accent absolute -bottom-2 left-0 h-3.5 w-full" />
            </span>
          </h2>
          <p className="text-slate mt-6 text-[1.0625rem] leading-relaxed">
            If people ask questions about what you do, they&rsquo;re asking somewhere — a search
            box, a chat window, your inbox. FaqFlo turns those questions into answers that live on
            your page.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2">
          <Card tone="cloud" className="p-7 sm:p-8">
            <Kicker>Who it&rsquo;s for</Kicker>
            <h3 className="mt-3 text-xl">Pretty much any site that explains something</h3>

            <ul className="mt-6 space-y-4">
              {AUDIENCES.map((a) => (
                <li key={a.who} className="flex gap-3">
                  <Sparkle className="text-accent mt-1.5 h-3.5 w-3.5 shrink-0" />
                  <p className="text-slate text-[0.9375rem] leading-relaxed">
                    <span className="text-navy font-semibold">{a.who}</span> — {a.line}
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-7 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Kicker>Features</Kicker>
              <Badge tone="neutral">Coming soon</Badge>
            </div>
            <h3 className="mt-3 text-xl">What a paid plan adds</h3>

            <ul className="mt-6 space-y-3">
              {FEATURES.map((feature) => (
                <li key={feature} className="text-slate flex gap-2.5 text-sm">
                  <Check className="text-primary mt-[0.35rem] shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            <p className="border-line text-navy mt-7 border-t pt-5 text-[0.9375rem] leading-relaxed font-semibold">
              <Link
                href="/#pricing"
                className="text-primary hover:text-primary-hover underline decoration-2 underline-offset-4 transition-colors duration-150"
              >
                Get started today
              </Link>{' '}
              and grow your visibility from there — every answer you publish is one more question
              you get found for.
            </p>
          </Card>
        </div>
      </div>
    </section>
  );
}

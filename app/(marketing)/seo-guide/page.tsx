import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'AI SEO basics & how FAQs help your rankings',
  description:
    "A beginner's guide to getting found on Google — and why FAQs are your secret weapon.",
  alternates: { canonical: '/seo-guide' },
};

const GOOGLE_CHECKS = [
  'Does your page answer the question clearly?',
  'Is your content structured and easy to scan?',
  'Do other sites link to you as a trusted source?',
  'How fast does your page load?',
];

const BENEFITS = [
  {
    title: 'They match how people actually search',
    body: 'Most Google searches are questions — "how do I…", "what is…", "why does…". FAQs mirror that natural language perfectly.',
  },
  {
    title: 'They can win featured snippets',
    body: 'Google often pulls FAQ answers directly into search results as featured snippets — the answer box at the top of the page. That means visibility even without being #1.',
  },
  {
    title: 'They support voice search',
    body: 'With more people using Siri, Alexa, and Google Assistant, voice search is growing fast. Voice queries are almost always questions — and FAQs answer them directly.',
  },
  {
    title: 'They keep visitors on your page longer',
    body: 'When users find answers on your page, they stay longer. Google reads that as a signal that your content is valuable, which helps your rankings.',
  },
  {
    title: 'They’re easy to add to any page',
    body: 'Blog posts, product pages, landing pages, service pages — FAQs improve all of them. They add depth without making your page feel bloated.',
  },
];

const COUNTS: [string, string][] = [
  ['Blog posts', '3–5 FAQs'],
  ['Product pages', '5–7 FAQs'],
  ['Landing pages', '5–7 FAQs'],
  ['Help / support pages', '8–12 FAQs'],
];

const QUICK_WINS = [
  'Add FAQs to your five most visited pages',
  'Use natural question phrasing (how, what, why, when)',
  'Keep answers concise — two or three sentences is ideal',
  'Add FAQ schema markup to your pages',
  'Refresh your FAQs regularly to keep them current',
];

export default function SeoGuide() {
  return (
    <div className="px-5 pt-14 pb-24 sm:px-8 sm:pt-20">
      <article className="mx-auto max-w-184">
        <Badge tone="cyan">Guide</Badge>
        <h1 className="mt-5 text-[2.25rem] text-balance sm:text-[2.75rem]">
          AI SEO basics &amp; how FAQs help your rankings
        </h1>
        <p className="text-slate mt-5 text-lg leading-relaxed">
          A beginner&rsquo;s guide to getting found on Google — and why FAQs are your secret weapon.
        </p>

        <Section label="The basics" title="What is SEO, and why does it matter?">
          <P>
            SEO (search engine optimisation) is the process of making your website show up when
            people search on Google, Bing, or other search engines. The higher you rank, the more
            free traffic you get — without paying for ads.
          </P>
          <P>
            Good SEO used to mean stuffing keywords into your content. Today it means answering real
            questions that real people are searching for. That&rsquo;s where FAQs come in.
          </P>
        </Section>

        <Section label="How it works" title="How Google actually works today">
          <P>
            Google&rsquo;s goal is simple: find the best answer to every search query. Its
            AI-powered algorithm looks for content that is clear, relevant, trustworthy, and easy to
            read.
          </P>
          <Checklist items={GOOGLE_CHECKS} />
        </Section>

        <Section label="AI SEO" title="What is AI SEO?">
          <P>
            AI SEO means using artificial intelligence to research, write, and optimise your content
            faster. Instead of spending hours writing FAQs by hand, tools like FaqFlo turn any page
            into a polished set in seconds.
          </P>
          <P>AI SEO doesn&rsquo;t replace good strategy — it speeds it up.</P>
        </Section>

        <Section label="Why it works" title="Why FAQs are an SEO goldmine">
          <P>FAQs are one of the most powerful and most underused SEO tools available.</P>
          <ol className="mt-7 space-y-6">
            {BENEFITS.map((b, i) => (
              <li key={b.title} className="flex gap-4">
                <span className="bg-primary-soft text-primary font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold tabular-nums">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-lg">{b.title}</h3>
                  <p className="text-slate mt-1.5 text-[0.9375rem] leading-[1.75]">{b.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section label="Technical edge" title="Schema markup, and what it actually does now">
          <P>
            Schema — a small block of structured data — tells a machine which text is a question,
            which is the answer, and which business they belong to. It removes the guesswork for
            anything reading your page programmatically.
          </P>
          <P>
            One correction worth making, because plenty of advice hasn&rsquo;t caught up:{' '}
            <strong>Google retired FAQ rich results</strong>. Schema will not put a dropdown of your
            questions under your search listing any more. It is worth adding for machine clarity —
            which is what answer engines lean on — not for a listing that no longer exists.
          </P>
          <P>
            You don&rsquo;t need a plugin for it. It&rsquo;s a block of markup you paste into your
            page alongside the answers themselves, and FaqFlo generates both for you.
          </P>
        </Section>

        <Section label="Best practice" title="How many FAQs should a page have?">
          <P>
            Quality matters more than quantity. Each FAQ should answer a real question your audience
            is asking.
          </P>
          <Card className="mt-6 overflow-hidden">
            <table className="w-full text-[0.9375rem]">
              <tbody>
                {COUNTS.map(([page, count], i) => (
                  <tr key={page} className={i > 0 ? 'border-line border-t' : ''}>
                    <td className="text-slate px-5 py-3.5">{page}</td>
                    <td className="text-navy px-5 py-3.5 text-right font-semibold tabular-nums">
                      {count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>

        <Section label="Action plan" title="Quick SEO wins you can do today">
          <Checklist items={QUICK_WINS} />
        </Section>

        <Card className="mt-16 p-8 text-center sm:p-10">
          <h2 className="text-2xl">Ready to write your FAQs?</h2>
          <p className="text-slate mx-auto mt-3 max-w-md text-[0.9375rem] leading-relaxed">
            FaqFlo turns any article, blog post, or product page into a polished FAQ set in
            seconds — free, no account needed.
          </p>
          <ButtonLink href="/#try" size="lg" arrow className="mt-7">
            Try FaqFlo free
          </ButtonLink>
        </Card>
      </article>
    </div>
  );
}

function Section({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-line mt-14 border-t pt-10">
      <p className="text-primary mb-3 text-xs font-semibold tracking-[0.12em] uppercase">{label}</p>
      <h2 className="mb-5 text-[1.625rem] leading-snug">{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-slate mt-4 text-[1.0625rem] leading-[1.8] first:mt-0">{children}</p>;
}

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {items.map((item) => (
        <li key={item} className="text-slate flex gap-3 text-[1.0625rem] leading-relaxed">
          <span
            className="bg-success/12 text-success-ink mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
            aria-hidden="true"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1.5 6.5 4.5 9.5 10.5 2.5" />
            </svg>
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

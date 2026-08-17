import type { Metadata } from 'next';
import { FinalCta } from '@/components/marketing/final-cta';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Check } from '@/components/ui/check';
import { FaqItem } from '@/components/ui/faq-item';
import { Sparkle, Underline } from '@/components/ui/doodle';
import { jsonLd } from '@/lib/site';

/*
  The About page.

  Written as an article, not a landing page. The copy is a genuine argument —
  search changed, most FAQ tools are invisible to it, here is the loop that
  fixes it — and an argument wants to be read in order, so it gets one narrow
  column and hairline rules between sections, the same shape as /seo-guide.

  Three things break out of the prose, and only three: the line the whole page
  turns on, the JavaScript contrast that is the actual differentiator, and the
  audience chips. Everything else that was a card is now paragraphs. A card per
  idea turns a case into a brochure — the reader skims six boxes and takes away
  none of the reasoning.

  The TL;DR and the contents list exist for the reader who won't do that at all.
  Neither runs any JavaScript, including the contents list, which highlights
  nothing as you scroll. That is a deliberate limit: this page's whole argument
  is that content behind JavaScript may as well not exist, and a scroll-spy
  would be the one part of it a crawler couldn't read.
*/

export const metadata: Metadata = {
  title: 'About',
  description:
    'Why we built FaqFlo — and how it gets your business cited by AI using the FAQs you already have.',
  alternates: { canonical: '/about' },
};

/*
  Single source for both the contents list and the sections themselves, so the
  two cannot drift. `nav` is the short label for the sidebar; `title` is the
  heading on the page — they differ because a sidebar has about two words of
  room and a heading has a sentence.
*/
const SECTIONS = [
  {
    id: 'the-shift',
    nav: 'What changed',
    label: 'The shift',
    title: 'Search quietly changed the locks on your front door',
  },
  {
    id: 'what-it-is',
    nav: 'What FaqFlo is',
    label: 'What it is',
    title: 'So, what actually is FaqFlo?',
  },
  {
    id: 'straight-talk',
    nav: 'The honest bit',
    label: 'Straight talk',
    title: 'The thing nobody else will tell you',
  },
  {
    id: 'who-its-for',
    nav: 'Who it’s for',
    label: 'Fit',
    title: 'Who this is for',
  },
  {
    id: 'promises',
    nav: 'How we work',
    label: 'Our promises',
    title: 'How we like to do things',
  },
  {
    id: 'whats-next',
    nav: 'Where we’re headed',
    label: 'What’s next',
    title: 'Where we’re headed',
  },
  {
    id: 'faq',
    nav: 'Questions',
    label: 'Before you go',
    title: 'Questions about us',
  },
] as const;

/** Typed against the ids above, so a typo in a lookup fails to compile. */
type SectionId = (typeof SECTIONS)[number]['id'];
const meta = (id: SectionId) => SECTIONS.find((s) => s.id === id)!;

/* One line each. A summary that runs to five sentences per bullet is just the
   article again, and the reader who wanted the short version has already
   scrolled past it. */
const TLDR = [
  'People ask AI now instead of clicking through search results.',
  'If the answer doesn’t quote you, you’re invisible — and nothing tells you.',
  'Your FAQs are the fix. Same questions, and you already have them.',
  'We write answers built to be quoted; you paste them on your own domain.',
  'Then we check whether the engines actually name you. Free to start.',
];

const STEPS = [
  {
    title: 'We check if you’re even visible',
    body: 'Free, thirty seconds, just pop in your website. We’ll tell you whether AI can currently “see” your site at all — a lot of sites are accidentally invisible to it, and their owners have no idea — and whether you’re getting cited today.',
  },
  {
    title: 'We find the real questions',
    body: 'Not the ones you think people ask — the ones they’re actually asking AI about businesses like yours, in your area, right now.',
  },
  {
    title: 'We write answers built to be quoted',
    body: 'Clear, factual, and phrased the way AI likes to lift them. No fluff, no keyword-stuffing, no robot-speak.',
  },
  {
    title: 'We hand you clean code to paste on your own site',
    body: 'Copy, paste into your website, done. It lives on your domain, under your name — so when the AI quotes it, you get the credit and the customer.',
  },
  {
    title: 'We track whether it’s working',
    body: 'We keep checking ChatGPT, Perplexity, and Google’s AI answers to see if you’re showing up — and nudge you when there’s a new question worth answering.',
  },
];

/*
  Deliberately specific rather than "small businesses". The section only works
  if a reader spots themselves in the list, so it names trades rather than
  categories, and grouped ones ("plumber, electrician, or HVAC tech") cover a
  whole neighbouring set without running to forty lines.

  Ordered roughly local-trade → professional → retail → online, so the two
  columns read as a progression rather than a jumble.
*/
const AUDIENCES = [
  'The local plumber, electrician, or HVAC tech',
  'The roofer, landscaper, or general contractor',
  'The accountant or bookkeeper',
  'The solo attorney or two-partner law firm',
  'The dentist, chiropractor, or clinic',
  'The real estate agent or mortgage broker',
  'The auto shop and the mobile mechanic',
  'The gym, yoga studio, or personal trainer',
  'The restaurant, café, or coffee roaster',
  'The Etsy shop and the e-commerce store',
  'The blogger or newsletter writer',
  'The course creator, coach, or consultant',
  'The photographer, designer, or freelancer',
  'The two-person SaaS',
  'The agency juggling ten clients',
  'The nonprofit and the community group',
];

const NOT_NEEDED = [
  'An SEO agency',
  'A six-month contract',
  'A vocabulary full of acronyms',
  'Any technical skill beyond copy and paste',
];

const PROMISES = [
  {
    title: 'We talk like humans',
    body: 'If we ever say “leverage our structured-data synergies,” you have our full permission to close the tab.',
  },
  {
    title: 'We won’t overpromise',
    body: 'Nobody can guarantee you’ll be the #1 answer everywhere — anyone who says otherwise is selling something. What we can do is give you the best possible shot, and show you, honestly, whether it’s working.',
  },
  {
    title: 'We start you free',
    body: 'Run the visibility check and try the generator without paying a cent. If it’s useful, you’ll know before we ever ask for money.',
  },
  {
    title: 'We keep it simple on purpose',
    body: 'The AI-search world is genuinely confusing right now. Our whole job is to make it feel easy — bright, fast, and maybe even a little fun.',
  },
];

/*
  This page's own FAQs — the argument above, applied to the page it's on.

  Deliberately not a copy of the homepage set (components/marketing/site-faq.tsx).
  Two pages carrying the same six questions would be duplicate content marked up
  as canonical answers in two places, which is the sloppiness this product
  exists to fix. These are the questions someone reads an About page to answer:
  who are you, why this approach, and what happens if it doesn't work.

  They render through FaqItem, which is <details>-based, so both question and
  answer are in the server HTML whether or not the item is open — the same
  standard the JavaScript section holds everyone else to.
*/
const FAQS = [
  {
    q: 'Who’s behind FaqFlo?',
    a: 'A small, focused team — FaqFlo is made by Tenichi. We’ve worked with countless clients helping with their AEO and SEO. We’ve built something we use… every day.',
  },
  {
    q: 'Why build the whole product around FAQs?',
    a: 'Because a question with a direct answer under it is the format answer engines read best, and because you already have the raw material. The questions your customers email you are the questions people are typing into ChatGPT. Most businesses are sitting on the input and have never turned it into something an assistant can quote.',
  },
  {
    q: 'Is this just SEO with a new name?',
    a: 'No. SEO is about climbing a list of links so someone clicks you. This is about being the answer itself, where there is no list to climb and often no click at all. The work looks different too: less chasing backlinks, more making sure a machine can read your page and attribute it to you.',
  },
  {
    q: 'Didn’t Google get rid of FAQ schema?',
    a: 'Google retired FAQ rich results — the dropdown of questions that used to appear under a search listing. The schema itself still does a useful job: it tells any machine reading your page which text is a question, which is the answer, and whose business they belong to. We add it for that clarity, not for a listing that no longer exists. Anyone still selling you FAQ schema for rich results is working from old information.',
  },
  {
    q: 'Can you guarantee I’ll be the answer AI gives?',
    a: 'No, and be careful with anyone who says they can. Nobody controls what ChatGPT or Google’s AI decides to quote. What we can do is make sure you’re readable, quotable, and actually saying something on the questions that matter — and then show you honestly whether it’s working. We set you up for business success.',
  },
  {
    q: 'How would I know if any of this is working?',
    a: 'That’s the part most tools skip. We keep checking ChatGPT, Perplexity, and Google’s AI answers for the questions that matter in your category, and tell you whether you’re getting named. Publishing without checking is just hoping.',
  },
  {
    q: 'What does it cost to find out if it’s worth it?',
    a: 'Nothing. The visibility check and the FAQ generator are free, with no account and no card — the full audit, the publish-ready export, and citation tracking are the paid parts. Run the check first. If it turns out AI can already see and cite you, we’ll tell you that instead of selling you something.',
  },
];

export default function About() {
  return (
    <>
      <div className="px-5 pt-14 pb-24 sm:px-8 sm:pt-20">
        {/* Article column plus a contents rail. The rail only appears once
            there is room beside the text — below lg it would either squeeze
            the prose or stack as a wall of links above it, so the collapsed
            version inside the article takes over instead. */}
        <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_13rem] lg:gap-14">
          <article className="mx-auto max-w-184 lg:mx-0">
            <Badge tone="cyan">About</Badge>
            <h1 className="mt-5 text-[2.25rem] text-balance sm:text-[2.75rem]">About FaqFlo</h1>

            {/* The one-sentence version, given the weight of a lede rather
                than a section of its own. */}
            <p className="text-navy mt-6 text-xl leading-relaxed font-medium text-balance sm:text-[1.375rem]">
              Somewhere out there, a future customer just asked AI about a business like{' '}
              <span className="relative inline-block">
                yours
                <Underline className="text-accent absolute -bottom-1.5 left-0 h-3 w-full" />
              </span>
              . FaqFlo makes sure yours is the one it talks about.
            </p>

            {/* Kept deliberately compact: it sits between the lede and the
                article, so anything taller starts pushing the actual opening
                below the fold. */}
            <section id="tldr" className="scroll-mt-24">
              <Card className="mt-8 px-5 py-4 sm:px-6 sm:py-5">
                <Badge tone="blue" className="text-xs">
                  TL;DR
                </Badge>
                <ul className="mt-3 space-y-2">
                  {TLDR.map((point) => (
                    <li key={point} className="flex gap-3">
                      {/* Cyan as fill, never as text — it is far too light to
                          carry type on a white card. */}
                      <span
                        className="bg-accent mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                        aria-hidden="true"
                      />
                      <p className="text-slate text-sm leading-[1.6]">{point}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>

            {/* Contents for narrow screens: collapsed by default so it costs a
                line rather than a screenful before the article starts. */}
            <details className="border-line group mt-8 rounded-xl border bg-white lg:hidden">
              {/* list-none alone leaves Safari's own disclosure triangle in
                  place — the marker pseudo-element has to go too. */}
              <summary className="font-display text-navy flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm font-bold [&::-webkit-details-marker]:hidden">
                On this page
                <span
                  className="text-slate transition-transform duration-200 group-open:rotate-180"
                  aria-hidden="true"
                >
                  ▾
                </span>
              </summary>
              <ol className="border-line space-y-2.5 border-t px-5 py-4">
                {SECTIONS.map((s, i) => (
                  <li key={s.id} className="flex gap-3">
                    <span className="text-slate/60 font-mono text-xs tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <a
                      href={`#${s.id}`}
                      className="text-slate hover:text-primary text-sm transition-colors duration-150"
                    >
                      {s.nav}
                    </a>
                  </li>
                ))}
              </ol>
            </details>

            <Section {...meta('the-shift')}>
              <P>
                For about twenty years, &ldquo;getting found online&rdquo; meant one thing: rank on
                Google, earn the click, win the customer. Simple enough that a whole industry grew
                up around it.
              </P>
              <P>Then, almost overnight, people stopped clicking.</P>
              <P>
                They started asking. &ldquo;What&rsquo;s the best bookkeeper near me?&rdquo;
                &ldquo;Is this company legit?&rdquo; &ldquo;Which one should I actually go
                with?&rdquo; And instead of ten blue links, they get one confident little paragraph
                from ChatGPT, Perplexity, or Google&rsquo;s AI — an answer, with a couple of sources
                quoted underneath.
              </P>
              <P>
                Here&rsquo;s the part that keeps small business owners up at night once they hear
                it:
              </P>

              {/* The line the whole page turns on, lifted out of the prose so
                  it lands even for someone who reads nothing else. */}
              <Card tone="cloud" className="mt-6 p-7 sm:p-8">
                <p className="text-navy font-display text-[1.375rem] leading-snug font-extrabold text-balance sm:text-[1.5rem]">
                  If the AI isn&rsquo;t quoting you, you&rsquo;re not in the conversation at all.
                </p>
                <p className="text-slate mt-4 text-[0.9375rem] leading-relaxed">
                  No link. No mention. No second chance.
                </p>
              </Card>

              <P>
                And the really sneaky bit? You&rsquo;d never know it was happening. There&rsquo;s no
                &ldquo;you lost this customer&rdquo; notification, no drop in a report, nothing to
                investigate. They just quietly went with whoever the AI recommended instead.
              </P>
              <P>That&rsquo;s the problem we built FaqFlo to fix.</P>
            </Section>

            <Section {...meta('what-it-is')}>
              <P>
                FaqFlo is the friendly little engine that gets your business cited by AI — using
                something you already have lying around: your FAQs.
              </P>
              <P>
                Turns out the questions your customers ask are the exact same questions
                they&rsquo;re now typing into AI. So we take those questions, answer them in a way
                AI loves to quote, and put those answers where the AI can actually find them — right
                on your own website. Then we keep an eye on whether it&rsquo;s working.
              </P>
              <P>In plain English, here&rsquo;s the whole thing.</P>

              <ol className="mt-8 space-y-7">
                {STEPS.map((step, i) => (
                  <li key={step.title} className="flex gap-4">
                    <span className="bg-primary-soft text-primary font-display flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold tabular-nums">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="text-lg">{step.title}</h3>
                      <p className="text-slate mt-1.5 text-[1.0625rem] leading-[1.8]">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <P>
                That loop — <strong className="text-navy">check, answer, publish, track</strong> —
                is the whole game. It&rsquo;s the difference between hoping you show up and actually
                watching it happen.
              </P>
            </Section>

            <Section {...meta('straight-talk')}>
              <P>
                Most &ldquo;FAQ tools&rdquo; and pop-up widgets have a dirty little secret: they
                load their answers with JavaScript. Sounds technical, and it is — but here&rsquo;s
                what it means for you. AI crawlers don&rsquo;t run JavaScript. So all those pretty
                accordion FAQs? The AI literally can&rsquo;t read a word of them. You paid for
                content that&rsquo;s invisible to the exact thing you&rsquo;re trying to reach.
              </P>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="border-line bg-cloud tilt-b rounded-2xl border p-6">
                  <p className="text-slate font-mono text-xs tracking-wide uppercase">
                    What most tools ship
                  </p>
                  <h3 className="text-slate mt-2.5 text-lg">Answers behind JavaScript</h3>
                  <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">
                    A slick accordion the crawler never renders — so the content you paid for may as
                    well not exist.
                  </p>
                </div>

                {/* Navy on the bright band, never white — the cyan is far too
                    light to carry white text at 4.5:1. */}
                <div className="bg-brand-gradient-bright grain tilt-a relative overflow-hidden rounded-2xl p-6">
                  <p className="text-navy relative font-mono text-xs tracking-wide uppercase">
                    What we ship
                  </p>
                  <h3 className="text-navy relative mt-2.5 text-lg">Plain, readable text</h3>
                  <p className="text-navy/80 relative mt-2 text-[0.9375rem] leading-relaxed">
                    Real content that lands as actual text on your own site — the way AI can
                    genuinely read it.
                  </p>
                </div>
              </div>

              <P>
                On top of that, Google quietly retired the old FAQ &ldquo;rich results&rdquo;
                everyone was chasing. So a lot of what the internet still tells you to do
                simply&hellip; doesn&rsquo;t work anymore.
              </P>
              <P>
                We went the unglamorous-but-correct route instead: real, readable content that lands
                as actual text on your own website, the way AI can genuinely read it. Less flashy.
                Massively more effective. We&rsquo;d rather be the tool that quietly works than the
                one that looks slick and does nothing.
              </P>
            </Section>

            <Section {...meta('who-its-for')}>
              <P>
                FaqFlo is for the people who <strong className="text-navy">are</strong> the
                business.
              </P>

              <P>In practice, that looks like:</P>

              {/* columns-2, not a two-column grid: multi-column fills top to
                  bottom then across, so the list reads down one column and
                  down the next. A grid fills across, which turns a scan-list
                  into a zig-zag. */}
              <ul className="mt-5 gap-x-10 sm:columns-2">
                {AUDIENCES.map((who) => (
                  <li key={who} className="mb-3 flex break-inside-avoid gap-3">
                    <Sparkle className="text-accent mt-1.5 h-3.5 w-3.5 shrink-0" />
                    <span className="text-slate text-[0.9375rem] leading-relaxed">{who}</span>
                  </li>
                ))}
              </ul>

              <P>
                The list isn&rsquo;t the point, though. If you&rsquo;ve got a website and customers
                who ask questions, you qualify. That is genuinely the whole bar.
              </P>
              <P>
                You do not need to be technical. If you can copy something and paste it into your
                website, you can do this. And if that already sounds like a lot — that&rsquo;s fine
                too. We&rsquo;ll walk you through it step by step, or do it for you.
              </P>
              <P>You also don&rsquo;t need:</P>

              <ul className="mt-5 space-y-3">
                {NOT_NEEDED.map((item) => (
                  <li key={item} className="text-slate flex gap-3 text-[1.0625rem] leading-relaxed">
                    <Check className="text-primary mt-[0.45rem] shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>

              <P>
                We handle the nerdy parts so you can stay focused on the thing you&rsquo;re actually
                good at.
              </P>
            </Section>

            <Section {...meta('promises')}>
              <P>A few promises, since a company is really just its habits.</P>

              <div className="mt-8 space-y-7">
                {PROMISES.map((promise) => (
                  <div key={promise.title} className="border-primary/25 border-l-2 pl-5">
                    <h3 className="text-lg">{promise.title}</h3>
                    <p className="text-slate mt-1.5 text-[1.0625rem] leading-[1.8]">
                      {promise.body}
                    </p>
                  </div>
                ))}
              </div>
            </Section>

            <Section {...meta('whats-next')}>
              <P>
                Search isn&rsquo;t going back to the way it was. Being the answer an AI quotes is
                quickly becoming the new &ldquo;showing up on page one&rdquo; — and the businesses
                that figure it out early are going to have a very nice head start.
              </P>
              <P>
                We&rsquo;re a small, focused team building FaqFlo out in the open, one honest
                feature at a time, because we think the little guys deserve to win this one too.
              </P>
            </Section>

            <Section {...meta('faq')}>
              {/* The page arguing for FAQ schema carries FAQ schema. Emitted
                  here rather than in the head so it sits with the questions it
                  describes — and it describes these real ones, not examples. */}
              <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                  __html: jsonLd({
                    '@context': 'https://schema.org',
                    '@type': 'FAQPage',
                    mainEntity: FAQS.map((f) => ({
                      '@type': 'Question',
                      name: f.q,
                      acceptedAnswer: { '@type': 'Answer', text: f.a },
                    })),
                  }),
                }}
              />

              <P>
                Written by hand, answered in plain text, and marked up with FAQ schema — the same
                thing FaqFlo does for you. Open the page source if you like; every answer below is
                in the HTML, not painted in afterwards by a script.
              </P>

              <div className="divide-line border-line mt-8 divide-y border-t">
                {FAQS.map((faq, i) => (
                  <FaqItem key={faq.q} question={faq.q} answer={faq.a} defaultOpen={i === 0} />
                ))}
              </div>
            </Section>
          </article>

          {/* The rail. `top-24` clears the sticky nav; `max-h`/`overflow` keep
              it usable if the list ever outgrows a short viewport. */}
          <aside className="hidden lg:block">
            <nav
              aria-labelledby="toc-heading"
              className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto"
            >
              <h2
                id="toc-heading"
                className="text-slate font-mono text-xs tracking-wide uppercase"
              >
                On this page
              </h2>
              <ol className="border-line mt-4 space-y-3 border-l pl-4">
                <li>
                  <a
                    href="#tldr"
                    className="text-slate hover:text-primary text-sm leading-snug transition-colors duration-150"
                  >
                    TL;DR
                  </a>
                </li>
                {SECTIONS.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="text-slate hover:text-primary block text-sm leading-snug transition-colors duration-150"
                    >
                      {s.nav}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>
        </div>
      </div>

      {/* The closing ask — "ready to find out if AI is talking about you?" — is
          exactly what this band already says, so it is reused rather than
          rewritten. Same CTA, same destination, one implementation. */}
      <FinalCta />
    </>
  );
}

/** Article section: eyebrow, heading, body, separated by a hairline rule. */
function Section({
  id,
  label,
  title,
  children,
}: {
  id: string;
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-line mt-14 scroll-mt-24 border-t pt-10">
      <p className="text-primary mb-3 text-xs font-semibold tracking-[0.12em] uppercase">{label}</p>
      <h2 className="mb-5 text-[1.625rem] leading-snug text-balance sm:text-[1.875rem]">{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-slate mt-4 text-[1.0625rem] leading-[1.8] first:mt-0">{children}</p>;
}

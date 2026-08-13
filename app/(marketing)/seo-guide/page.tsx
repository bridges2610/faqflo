import type { Metadata } from 'next';
import Link from 'next/link';
import { FinalCta } from '@/components/marketing/final-cta';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Check } from '@/components/ui/check';
import { Underline } from '@/components/ui/doodle';
import { FaqItem } from '@/components/ui/faq-item';

/*
  The SEO guide.

  This page used to be a Google-rankings primer — featured snippets, voice
  search, "FAQs help your rankings" — written before the product repositioned
  around citations. The rewrite keeps the subject and changes the spine: SEO is
  still important, AEO is the shift, and almost everything that makes you rank
  is the same groundwork that makes you quotable.

  So it teaches the fundamentals honestly and earns the bridge each time rather
  than asserting it once in an intro. Seven fundamentals, each closing with the
  same left-rule "AEO bridge" callout, so a reader who only skims still leaves
  with the argument. The one section that isn't a fundamental — "where they
  split" — is the only place the two genuinely diverge, and it gets the contrast
  panels rather than prose because a divergence is a comparison.

  Deliberately not an AEO explainer. /blog/what-is-aeo is already that, in full;
  this owns the SEO half and links out. Two posts also deep-link here as the
  authority on schema and on Google retiring FAQ rich results, so both claims
  have to keep a home — they live in the `schema` section.

  Shape is borrowed wholesale from /about: one narrow column, hairline rules,
  a contents rail. As there, nothing runs JavaScript, including the contents
  list, which highlights nothing as you scroll. A page whose second section
  argues that JS-rendered content is invisible cannot itself depend on JS.
*/

export const metadata: Metadata = {
  title: 'SEO in the age of AI answers',
  description:
    'A plain-English guide to the SEO fundamentals that still matter — and how each one is the groundwork for getting cited by AI. SEO is still important. AEO is the shift.',
  alternates: { canonical: '/seo-guide' },
};

/*
  Single source for both the contents list and the sections themselves, so the
  two cannot drift. `nav` is the short label for the sidebar; `title` is the
  heading on the page — a sidebar has about two words of room, a heading has a
  sentence.
*/
const SECTIONS = [
  {
    id: 'still-matters',
    nav: 'Why SEO still matters',
    label: 'The premise',
    title: 'SEO didn’t die. It got a second job.',
  },
  {
    id: 'crawlable',
    nav: 'Can it be read',
    label: 'Fundamental 01',
    title: 'Can a machine actually read your page?',
  },
  {
    id: 'intent',
    nav: 'What people ask',
    label: 'Fundamental 02',
    title: 'People search in questions — and always did',
  },
  {
    id: 'content',
    nav: 'Being specific',
    label: 'Fundamental 03',
    title: 'Be specific, or be skipped',
  },
  {
    id: 'structure',
    nav: 'Page structure',
    label: 'Fundamental 04',
    title: 'Answer first, then explain',
  },
  {
    id: 'authority',
    nav: 'Trust & links',
    label: 'Fundamental 05',
    title: 'Why other sites vouching for you still counts',
  },
  {
    id: 'schema',
    nav: 'Schema markup',
    label: 'Fundamental 06',
    title: 'Schema markup, and what it actually does now',
  },
  {
    id: 'measuring',
    nav: 'Measuring it',
    label: 'Fundamental 07',
    title: 'Rankings, traffic, and the number nobody’s watching',
  },
  {
    id: 'the-shift',
    nav: 'Where they split',
    label: 'The shift',
    title: 'Where SEO stops and AEO starts',
  },
  {
    id: 'action-plan',
    nav: 'Do this today',
    label: 'Action plan',
    title: 'A one-afternoon checklist',
  },
  {
    id: 'faq',
    nav: 'Questions',
    label: 'Before you go',
    title: 'Questions about SEO and AEO',
  },
] as const;

/** Typed against the ids above, so a typo in a lookup fails to compile. */
type SectionId = (typeof SECTIONS)[number]['id'];
const meta = (id: SectionId) => SECTIONS.find((s) => s.id === id)!;

/* One line each. A summary that runs to five sentences per bullet is just the
   article again, and the reader who wanted the short version has already
   scrolled past it. */
const TLDR = [
  'SEO isn’t dead — answer engines read the same web search crawlers do.',
  'Crawlable pages, clear answers and specific facts serve both.',
  'The bar is higher in one place: AI crawlers don’t run JavaScript.',
  'Schema still matters for machine clarity, not for rich results.',
  'What changed is the payoff — a citation instead of a click.',
];

/* The things that quietly stop a page being indexed at all. Ordered by how
   often they turn out to be the culprit, not by severity. */
const BLOCKERS = [
  'A robots.txt rule that disallows more than whoever wrote it intended',
  'A stray noindex tag left over from a staging site',
  'Pages no other page links to, so nothing ever finds them',
  'Content behind a login, a form, or an “accept cookies” wall',
  'Pages so slow that crawlers visit them less and less often',
  'A layout that breaks on a phone, which is how most crawling happens now',
];

const COUNTS: [string, string][] = [
  ['Blog posts', '3–5 FAQs'],
  ['Product pages', '5–7 FAQs'],
  ['Landing pages', '5–7 FAQs'],
  ['Help / support pages', '8–12 FAQs'],
];

const SEARCH_CONSOLE_CHECKS = [
  'Queries with plenty of impressions but almost no clicks — usually a title problem, not a ranking one',
  'Pages sitting between positions eight and twenty, which are the closest thing to a free win',
  'Pages that used to rank and quietly stopped',
  'Anything flagged under Indexing that you didn’t mean to exclude',
];

/* The two columns of the divergence. Written as matched pairs — each SEO line
   has an AEO line directly opposite it — so the panels read across as well as
   down. */
const SEO_SIDE = [
  'Ranking a page inside a list of links',
  'Earning the click',
  'Whole pages, covered comprehensively',
  'Backlinks and domain authority',
  'Traffic, rankings, and average position',
];

const AEO_SIDE = [
  'Being the answer itself',
  'Earning the citation',
  'Passages that stand on their own',
  'The same facts corroborated in several places',
  'Mentions, and whose name comes back',
];

const QUICK_WINS = [
  'View source on your busiest page — right-click, View Page Source, not Inspect — and search it for your own answer text. If it isn’t there, no answer engine can read it.',
  'Rewrite the top of that page so the first two sentences answer its main question outright.',
  'Add three questions customers genuinely email you, each with a straight answer underneath.',
  'Swap every vague claim for a specific one: a name, a place, a price, a timeframe.',
  'Give the page one h1, and h2s that describe what’s actually under them.',
  'Add Organization or LocalBusiness schema. One block, once, sitewide.',
  'Check your business name, address and phone match across your site, Google Business Profile, and every directory listing you can find.',
  'Ask ChatGPT the question your best customer would ask, and see whose name comes back.',
];

/* Deliberately no overlap with the seven on /blog/what-is-aeo, which cover what
   AEO is, AEO vs GEO, and getting started. These are the SEO-side objections. */
const FAQS = [
  {
    q: 'Is SEO dead now that AI answers everything?',
    a: 'No. Answer engines read the same open web that search crawlers do, and several of them run a live web search behind the scenes before writing an answer. A site a search crawler can’t read is a site an answer engine can’t read either. What has changed is the payoff: less about earning a click from a ranking, more about being the source the answer quotes.',
  },
  {
    q: 'Do I have to choose between SEO and AEO?',
    a: 'No, and it would be an odd choice to make — most of the work is the same work. Crawlable pages, clear answers, specific facts and sensible structure serve both. AEO adds a few habits on top: answering in the first sentence rather than the fifth paragraph, publishing in real HTML rather than JavaScript, and measuring mentions instead of only traffic.',
  },
  {
    q: 'Does AI use Google’s rankings to decide who to quote?',
    a: 'Not directly, and nobody outside those companies knows the full recipe. But several answer engines run a live search behind the scenes and summarise what comes back, so pages that rank well are often in the pool being chosen from. Good SEO doesn’t guarantee a citation. It gets you considered.',
  },
  {
    q: 'How long does SEO take to work?',
    a: 'Months, usually, and be wary of anyone who promises weeks. It splits in two, though: the technical fixes — making a page crawlable, answering in the first sentence, adding schema — take effect as soon as the page is re-crawled. Building the reputation and links that move a competitive ranking is the slow half.',
  },
  {
    q: 'Do I still need backlinks?',
    a: 'Yes, though they’re no longer the whole game. A link from a genuinely relevant site — the local paper, a supplier, an industry body — still counts for far more than fifty directory listings. What has grown in importance alongside them is being mentioned consistently: the same business name, address and phone, stated the same way everywhere a machine might look.',
  },
  {
    q: 'Does FAQ schema still do anything?',
    a: 'Yes, just not what it used to. Google retired FAQ rich results, so schema will not put a dropdown of your questions under your search listing any more. It still tells any machine reading your page which text is a question, which is the answer, and whose business they belong to — and that clarity is exactly what answer engines lean on. Add it for the machines, not for the listing.',
  },
  {
    q: 'Do I need an SEO agency for this?',
    a: 'For the fundamentals in this guide, no. Making your answers crawlable, writing specifically, structuring a page sensibly and adding a block of schema are things a non-technical owner can do in an afternoon. An agency earns its fee on the competitive, slow half — the content programme and the link building. Do the free part first and see how far it gets you.',
  },
];

export default function SeoGuide() {
  return (
    <>
      <div className="px-5 pt-14 pb-24 sm:px-8 sm:pt-20">
        {/* Article column plus a contents rail. The rail only appears once
            there is room beside the text — below lg it would either squeeze
            the prose or stack as a wall of links above it, so the collapsed
            version inside the article takes over instead. */}
        <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_13rem] lg:gap-14">
          <article className="mx-auto max-w-184 lg:mx-0">
            <Badge tone="cyan">Guide</Badge>
            <h1 className="mt-5 text-[2.25rem] text-balance sm:text-[2.75rem]">
              SEO in the age of AI answers
            </h1>

            <p className="text-navy mt-6 text-xl leading-relaxed font-medium text-balance sm:text-[1.375rem]">
              SEO didn&rsquo;t die when AI started answering questions. It got a second job — and
              nearly everything that makes Google rank you is the same thing that makes ChatGPT{' '}
              <span className="relative inline-block">
                quote
                <Underline className="text-accent absolute -bottom-1.5 left-0 h-3 w-full" />
              </span>{' '}
              you.
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
                      {/* Cyan as fill, never as text — far too light to carry
                          type on a white card. */}
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

            <Section {...meta('still-matters')}>
              <P>
                For about twenty years, SEO meant one thing: get Google to rank you, earn the click,
                win the customer. Then AI started answering questions outright, and roughly half the
                internet declared search engine optimisation dead.
              </P>
              <P>
                It isn&rsquo;t. Answer engines — ChatGPT, Perplexity, Google&rsquo;s AI Overviews —
                are reading the same open web that Google crawls. Several of them run a live search
                behind the scenes and summarise what comes back. If your page is invisible to a
                search crawler, it is invisible to them too.
              </P>

              {/* The line the whole page turns on, lifted out of the prose so
                  it lands even for someone who reads nothing else. */}
              <Card tone="cloud" className="mt-6 p-7 sm:p-8">
                <p className="text-navy font-display text-[1.375rem] leading-snug font-extrabold text-balance sm:text-[1.5rem]">
                  Everything that makes you rank makes you quotable.
                </p>
                <p className="text-slate mt-4 text-[0.9375rem] leading-relaxed">
                  That&rsquo;s not a coincidence. It&rsquo;s the same job description — clear
                  answers, readable pages, a site a machine can parse. SEO has been asking for this
                  the whole time.
                </p>
              </Card>

              <P>
                What has changed is the payoff. SEO optimises for a click: get into the list, get
                picked, get the visit. Answer engines often hand over the answer without anyone
                visiting anything, so the thing worth optimising for is the{' '}
                <strong className="text-navy">citation</strong> — being the source the answer names.
                That&rsquo;s the shift. It&rsquo;s a real one, and it changes what you emphasise at
                the margins. It does not throw out the fundamentals.
              </P>
              <P>
                So this guide does both. Seven SEO fundamentals that still earn their keep, and after
                each one, exactly what it buys you with answer engines. If you want the AEO half in
                full, we wrote that separately:{' '}
                <A href="/blog/what-is-aeo">what AEO is and how it works</A>.
              </P>
            </Section>

            <Section {...meta('crawlable')}>
              <P>
                Before ranking, before keywords, before any of it: a bot has to fetch your page, read
                the HTML it gets back, follow the links it finds, and file away what it saw. Crawling,
                then indexing. If either step fails, nothing else on this page matters — you
                aren&rsquo;t competing badly, you aren&rsquo;t competing at all.
              </P>
              <P>The usual culprits are unglamorous:</P>
              <Checklist items={BLOCKERS} />
              <P>
                Speed and mobile belong here rather than in a section of their own. Neither is a
                magic ranking lever, but a page that takes eight seconds on a phone gets crawled less
                often, gets read less patiently, and loses people before it ever gets judged.
              </P>
              <P>
                Now the part that trips almost everyone up. Google can run JavaScript. It takes a
                second pass at the page, executes the scripts, and eventually sees what a visitor
                sees. Most of the modern web is built on that assumption.
              </P>
              <P>
                AI crawlers generally don&rsquo;t. GPTBot, PerplexityBot and the rest fetch your HTML
                and read what&rsquo;s in it. Whatever a script paints in afterwards was never there
                as far as they&rsquo;re concerned.
              </P>

              <Bridge>
                This is the one fundamental where the AEO bar sits{' '}
                <strong className="text-navy">higher</strong> than the SEO bar. A FAQ accordion can
                score perfectly in a speed test, look flawless to a visitor, pass every SEO checklist
                you throw at it, and still be entirely absent from what an answer engine sees. The
                test takes ten seconds: view the page source — the raw HTML, not the inspector — and
                search it for your own answer text. If it isn&rsquo;t in there, it doesn&rsquo;t
                exist. That failure is common enough that we{' '}
                <A href="/blog/why-faq-plugins-arent-a-good-idea">wrote a whole post about it</A>.
              </Bridge>
            </Section>

            <Section {...meta('intent')}>
              <P>
                Keyword stuffing has been dead for over a decade. What replaced it is intent: not
                which words someone typed, but what they were actually trying to find out.
              </P>
              <P>
                Take a roofer in Franklin. Almost nobody searches &ldquo;roofer Franklin.&rdquo; They
                search &ldquo;how much does it cost to replace a roof in Franklin,&rdquo; or
                &ldquo;does home insurance cover hail damage to a roof,&rdquo; or &ldquo;how long
                should a shingle roof last.&rdquo; Longer queries, fewer people searching each one —
                and far likelier to turn into a job, because someone asking that is already halfway
                to hiring.
              </P>
              <P>
                You already know what these are. They&rsquo;re the questions you answer on the phone
                every week. The research part is mostly just writing them down: your inbox, your
                quotes, the &ldquo;people also ask&rdquo; box, the questions competitors bothered to
                answer.
              </P>

              <Bridge>
                An AI prompt <em>is</em> that long-tail question, phrased even more naturally and
                often at greater length — people talk to an assistant the way they&rsquo;d talk to a
                person. So the question research you&rsquo;d do for SEO is the question research for
                AEO. Same input, one difference in what you do with it: you answer in the first
                sentence rather than burying it two thousand words into a post.
              </Bridge>
            </Section>

            <Section {...meta('content')}>
              <P>
                Google talks about experience, expertise, authoritativeness and trust. Strip the
                jargon off and it&rsquo;s one question: does this page sound like it was written by
                someone who has actually done the thing?
              </P>
              <P>In practice that comes down to specificity. Compare these two sentences:</P>

              <div className="mt-6 space-y-4">
                <div className="border-line rounded-xl border border-dashed p-5">
                  <p className="text-slate/70 font-mono text-xs tracking-wide uppercase">
                    Says nothing
                  </p>
                  <p className="text-slate mt-2 text-[1.0625rem] leading-relaxed">
                    &ldquo;We&rsquo;re passionate about quality and committed to customer
                    satisfaction.&rdquo;
                  </p>
                </div>
                <div className="border-primary/30 bg-primary-soft/40 rounded-xl border p-5">
                  <p className="text-primary font-mono text-xs tracking-wide uppercase">
                    Says something
                  </p>
                  <p className="text-navy mt-2 text-[1.0625rem] leading-relaxed">
                    &ldquo;We hand-decorate custom cakes with 48 hours&rsquo; notice, and
                    we&rsquo;ve been doing it in Asheville since 2011.&rdquo;
                  </p>
                </div>
              </div>

              <P>
                Names, places, prices, timeframes, materials, guarantees, qualifications. Facts a
                competitor couldn&rsquo;t paste onto their own site without lying. That&rsquo;s the
                whole trick, and it&rsquo;s the one most small business websites are missing.
              </P>

              <Bridge>
                A machine can quote the second sentence. It can do nothing whatsoever with the first.
                In SEO, vagueness costs you a few positions; in AEO it costs you the citation
                outright, because there is nothing there to lift. Answer engines are looking for a
                specific, checkable claim to attribute to somebody. Give them one.
              </Bridge>
            </Section>

            <Section {...meta('structure')}>
              <P>
                Structure is how a page tells a machine what it&rsquo;s looking at. One h1 per page.
                h2s and h3s that describe what&rsquo;s under them — &ldquo;How much a roof
                replacement costs&rdquo; rather than &ldquo;Our Process.&rdquo; Short paragraphs.
                Lists and tables for anything comparable. Link text that describes where it goes
                instead of saying &ldquo;click here.&rdquo; Alt text on images that carry meaning.
              </P>
              <P>
                The habit that matters most is the inverted pyramid, borrowed from newsrooms: answer
                the question in the first thirty to sixty words, then explain, then add the caveats
                and the detail. Most business pages do the exact opposite — three paragraphs of
                warm-up before the number anyone came for.
              </P>
              <P>
                Question-and-answer format is just the shortest route to that shape. The question is
                the heading; the answer sits directly underneath it. Nothing to warm up, nowhere to
                bury the point. If you&rsquo;d rather not reshape a page by hand, our{' '}
                <A href="/#try">free generator</A> will turn one into that format for you.
              </P>
              <P>
                On quantity: each question should be one a real customer actually asks. Ten sharp
                questions beat forty invented ones. As a rough guide —
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

              <Bridge>
                Answer engines don&rsquo;t quote pages. They quote passages. The unit that gets
                lifted into an answer is a paragraph that still makes sense with everything around it
                removed — which is exactly what an answer-first paragraph under a descriptive heading
                is. Headings do double duty here: they tell a machine where one answer ends and the
                next begins, so it can take yours cleanly instead of grabbing half of two.
              </Bridge>
            </Section>

            <Section {...meta('authority')}>
              <P>
                Backlinks — other sites linking to yours — are still real, and still hard. One link
                from a genuinely relevant source, the local paper or a supplier or an industry body,
                counts for more than fifty directory submissions. There is no shortcut worth taking
                here; the ones being sold to you will eventually cost more than they returned.
              </P>
              <P>
                What has grown in importance alongside links is consistency. Your business name,
                address and phone number, stated identically everywhere a machine might look: your
                own site, your Google Business Profile, the directories, the review sites. Three
                slightly different phone numbers across the web is three reasons to doubt all of
                them.
              </P>

              <div className="border-primary/25 mt-6 border-l-2 pl-5">
                <h3 className="text-lg">You&rsquo;re not optimising a page. You&rsquo;re teaching machines who you are.</h3>
                <p className="text-slate mt-1.5 text-[1.0625rem] leading-[1.8]">
                  Search engines and answer engines both build a picture of your business as a thing
                  in the world — a name, a place, a category, a reputation — separate from any one
                  page. Everything above is you filling that picture in, or leaving it blurry.
                </p>
              </div>

              <Bridge>
                Answer engines corroborate. Before naming a business in an answer, it helps
                enormously if the same facts turn up in several independent places rather than only
                on the site making the claim. That makes link building and corroboration building
                close to the same activity: reviews, directories, local press, a Business Profile
                that matches your own site. Do it for SEO and you&rsquo;ve done most of it for AEO.
              </Bridge>
            </Section>

            <Section {...meta('schema')}>
              <P>
                Schema — a small block of structured data, usually JSON-LD inside a script tag —
                tells a machine which text is a question, which is the answer, and which business
                they belong to. It removes the guesswork for anything reading your page
                programmatically, which is now quite a lot of things.
              </P>
              <P>
                One correction worth making, because plenty of advice hasn&rsquo;t caught up:{' '}
                <strong className="text-navy">Google retired FAQ rich results.</strong> Schema will
                not put a dropdown of your questions under your search listing any more. It is worth
                adding for machine clarity — which is what answer engines lean on — not for a listing
                that no longer exists. Anyone still selling you FAQ schema for rich results is
                working from old information.
              </P>
              <P>
                Plenty of schema types do still drive real search features, and all of them still buy
                you clarity. Organization or LocalBusiness says who you are, where, and when
                you&rsquo;re open. Product carries price and availability. Article carries the author
                and the date. Most sites need one sitewide block and one per page type — it is far
                less work than it sounds, and you don&rsquo;t need a plugin for it. An{' '}
                <code className="bg-cloud text-navy rounded px-1.5 py-0.5 font-mono text-[0.875em]">
                  llms.txt
                </code>{' '}
                file is a newer, similar idea: a plain-text summary of what your site covers, left
                where AI crawlers can find it.
              </P>

              <Bridge>
                Schema is the one place where SEO best practice and AEO best practice are literally
                the same file. One caveat matters more than all the rest, though: schema is a{' '}
                <strong className="text-navy">label on text, never a replacement for it</strong>.
                Markup describing answers that no crawler can see is a very precise description of
                something that isn&rsquo;t there — which is exactly the trap a JavaScript FAQ widget
                with &ldquo;built-in SEO schema&rdquo; sets for you. The markup and the readable
                answer have to ship together. That&rsquo;s <A href="/about">the whole reason we
                built this thing</A>.
              </Bridge>
            </Section>

            <Section {...meta('measuring')}>
              <P>
                Google Search Console is free, takes ten minutes to verify, and is the only tool most
                small businesses need. It shows what people searched, how often you appeared, how
                often you were clicked, and roughly where you sat.
              </P>
              <P>Four things are worth actually looking at:</P>
              <Checklist items={SEARCH_CONSOLE_CHECKS} />
              <P>
                That baseline still matters, and you should have it. But there&rsquo;s a hole in it
                now, and it&rsquo;s a big one: nothing in Search Console or Google Analytics will
                ever tell you that ChatGPT recommended you to someone on Tuesday.
              </P>
              <P>
                That&rsquo;s what zero-click means in practice. The person asked, got a confident
                paragraph naming three businesses, picked one, and never visited a website. If you
                were named, you won — and not one of your dashboards moved.
              </P>

              <Bridge>
                So you can be getting steadily better at AEO while every SEO metric you own stays
                perfectly flat. That&rsquo;s not an argument for ignoring the dashboards; it&rsquo;s
                the reason citations have to be measured separately. The only honest way to know is
                to ask the engines the questions your customers ask and see whose name comes back —
                which you can do by hand, for free, starting with the question in the checklist
                below. <A href="/#audit">We&rsquo;ll also just run it for you.</A>
              </Bridge>
            </Section>

            <Section {...meta('the-shift')}>
              <P>
                Everything so far has been overlap, and the overlap really is most of the work. But
                it isn&rsquo;t all of it. There are a handful of places where optimising for a
                ranking and optimising for a citation genuinely pull in different directions, and
                being clear about them is the difference between adapting and just working harder.
              </P>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="border-line bg-cloud tilt-b rounded-2xl border p-6">
                  <p className="text-slate font-mono text-xs tracking-wide uppercase">
                    What SEO optimises for
                  </p>
                  <ul className="mt-4 space-y-2.5">
                    {SEO_SIDE.map((item) => (
                      <li key={item} className="text-slate text-[0.9375rem] leading-relaxed">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Navy on the bright band, never white — the cyan is far too
                    light to carry white text at 4.5:1. */}
                <div className="bg-brand-gradient-bright grain tilt-a relative overflow-hidden rounded-2xl p-6">
                  <p className="text-navy relative font-mono text-xs tracking-wide uppercase">
                    What AEO optimises for
                  </p>
                  <ul className="relative mt-4 space-y-2.5">
                    {AEO_SIDE.map((item) => (
                      <li key={item} className="text-navy/85 text-[0.9375rem] leading-relaxed">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <P>
                Read across and the pattern is clear enough. SEO wants a page to win a list. AEO
                wants an answer to be the answer. The habits that change are narrow — lead with the
                conclusion, keep passages self-contained, ship real HTML, count mentions — and they
                sit on top of the fundamentals rather than replacing any of them.
              </P>
              <P>
                <strong className="text-navy">
                  SEO gets you into the room. AEO decides whether you&rsquo;re the one quoted.
                </strong>{' '}
                Neither replaces the other, and doing the second badly while ignoring the first
                doesn&rsquo;t work either. If you want the AEO side in proper detail, it has{' '}
                <A href="/blog/what-is-aeo">a guide of its own</A>.
              </P>
            </Section>

            <Section {...meta('action-plan')}>
              <P>
                None of this needs an agency, a budget, or a developer. Genuinely an afternoon, in
                this order:
              </P>
              <Checklist items={QUICK_WINS} />
              <P>
                If that last one comes back with a competitor&rsquo;s name — or with nothing at all —
                that&rsquo;s the gap this entire guide is about, and it&rsquo;s worth knowing about
                before it costs you anything else.
              </P>
            </Section>

            <Section {...meta('faq')}>
              {/* The page arguing for schema carries schema. Emitted here rather
                  than in the head so it sits with the questions it describes —
                  and built from the same array that renders them, so the markup
                  cannot describe questions that aren't on the page. That is the
                  exact failure the schema section above warns about.

                  Hand-rolled rather than PostFaq because this page needs the
                  section's eyebrow, id and heading like its other ten — PostFaq
                  carries a fixed "Frequently asked questions" h2 and no id. */}
              <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                  __html: JSON.stringify({
                    '@context': 'https://schema.org',
                    '@type': 'FAQPage',
                    mainEntity: FAQS.map((f) => ({
                      '@type': 'Question',
                      name: f.q,
                      acceptedAnswer: { '@type': 'Answer', text: f.a },
                    })),
                  }).replace(/</g, '\\u003c'),
                }}
              />

              <P>
                Marked up with FAQ schema, and answered in plain text — the same thing this guide
                just told you to do. View the page source if you like: every answer below is in the
                HTML, not painted in afterwards by a script.
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
              <h2 id="toc-heading" className="text-slate font-mono text-xs tracking-wide uppercase">
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

      {/* The closing ask — "find out what AI sees" — is exactly what this band
          already says, and it's the honest next step after a page about whether
          machines can read your site. Reused rather than rewritten. */}
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

/*
  The bridge from an SEO fundamental to what it earns you with answer engines.
  It closes seven sections, and it's the argument of the whole page, so it gets
  one consistent shape — a reader who only skims should be able to spot the same
  block seven times and take the point from that alone.
*/
function Bridge({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-primary/25 mt-7 border-l-2 pl-5">
      <p className="text-primary mb-1.5 text-xs font-semibold tracking-[0.12em] uppercase">
        The AEO bridge
      </p>
      <p className="text-slate text-[1.0625rem] leading-[1.8]">{children}</p>
    </div>
  );
}

/** Inline prose link. There's no shared prose `A` outside MDX, so pages carry
    their own — Link rather than <a> to keep client-side navigation. */
function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-primary hover:underline">
      {children}
    </Link>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {items.map((item) => (
        <li key={item} className="text-slate flex gap-3 text-[1.0625rem] leading-relaxed">
          <Check className="text-primary mt-[0.45rem] shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}

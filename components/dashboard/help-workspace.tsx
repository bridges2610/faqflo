import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { AUDIT_TIME_BUDGET_MS } from '@/lib/audit/limits';
import { scoreBand } from '@/lib/audit/score';
import { PILLARS } from '@/lib/audit/types';
import { EMBED_GUIDES } from '@/lib/dashboard/export';
import {
  FREE_FAQ_CAP,
  FREE_QUESTION_SAMPLE,
  GUARANTEE_DAYS,
  PAGE_BUDGET,
  PLAN_COPY,
  PRO_PRICE,
  SITE_CAP,
  TRACKING_PLANS,
} from '@/lib/dashboard/plans';

const FREE = TRACKING_PLANS.free;
const PRO = TRACKING_PLANS.pro;
// Read from the source rather than typed as prose: the engine list is a product
// decision that has already changed once, and a hardcoded copy here would be
// the thing that still said "Google AI Overviews" afterwards.
import { ENGINES } from '@/lib/dashboard/types';
import { SUPPORT_EMAIL } from '@/lib/support';
import { ContactForm } from './contact-form';
import { DoneForYouCard } from './done-for-you-card';
import { EmbedStepList } from './embed-steps';
import { MicroLabel } from './micro-label';
import { PageHeader } from './page-header';
import { SectionTitle } from './section-title';

/*
  Help.

  ⚠️ A SERVER COMPONENT — the only workspace that is one, and deliberately.

  Every other *-workspace.tsx needs the store, so it must be `'use client'`.
  This one renders prose. Hydrating a page of static text buys nothing and
  costs bundle. It works because app/(app)/layout.tsx is an async server
  component passing {children} into AppShell: children stay server components
  even though AppShell itself is a client component. <ContactForm /> is the one
  client island, and it still sees the dashboard context because the provider
  sits above AppShell.

  ⚠️ EVERY NUMBER ON THIS PAGE IS IMPORTED, NOT TYPED OUT.

  Pillars and their weights, the score bands, the page budget, the plan prices,
  the free answer cap, the platform notes — all read from the modules that
  define them. A help page that quietly disagrees with the product is worse
  than no help page, and copying a constant here is how that starts. The one
  thing deliberately NOT stated is the "44 checks" figure from the pricing
  page: it is hardcoded marketing copy in two places and derives from nothing,
  so repeating it here would make a third.
*/

/*
  Single source for the contents rail and the headings, so the two cannot
  drift — the same shape /seo-guide and /about use. `nav` is the short label a
  sidebar has room for; `title` is the heading on the page.
*/
const SECTIONS = [
  { id: 'start-here', nav: 'Start here', title: 'Getting set up' },
  { id: 'how-it-works', nav: 'How it works', title: 'How FaqFlo works' },
  { id: 'your-site', nav: 'Your site', title: 'Your site: what the check measures' },
  { id: 'answers', nav: 'Answers', title: 'Answers, and what a group is' },
  { id: 'publishing', nav: 'Publishing', title: 'Publishing: the technical bit' },
  { id: 'opportunities', nav: 'Opportunities', title: 'Opportunities: questions and pages' },
  { id: 'results', nav: 'Results', title: 'Results: who the engines actually cite' },
  { id: 'plans', nav: 'Plans', title: 'What each plan covers' },
  { id: 'faq', nav: 'Common questions', title: 'Common questions' },
  { id: 'contact', nav: 'Still stuck', title: 'Still stuck?' },
] as const;

/** Typed against the ids above, so a typo in a lookup fails to compile. */
type SectionId = (typeof SECTIONS)[number]['id'];
const meta = (id: SectionId) => SECTIONS.find((s) => s.id === id)!;

/*
  The four setup steps, worded to match setupSteps() in lib/dashboard/worklist.ts.

  ⚠️ FOUR, NOT FIVE, AND THE REASON CHANGED. It used to be that nothing in this
  product queried an answer engine, so a "watch for citations" box was one nobody
  could ever tick. Tracking runs now — but it still is not a step here, because
  these are SETUP: done once, ticked, gone. Tracking is ongoing and has no
  completed state, so a box for it would either never tick or tick once and
  misrepresent a thing you are meant to keep doing.

  ⚠️ setupSteps() in lib/dashboard/worklist.ts still carries the old reasoning in
  its own comment. Same correction wanted there.
*/
const STEPS = [
  {
    label: 'Add your website',
    href: '/dashboard/sites',
    body: 'It takes about thirty seconds, and everything else starts from it. The domain you enter is the one we read, so use the address people actually visit.',
  },
  {
    label: 'See what AI can read',
    href: '/dashboard/audit',
    body: 'We fetch your site the way an assistant would and tell you what it found. This is where most surprises live — plenty of sites are accidentally unreadable and nothing tells their owners.',
  },
  {
    label: 'Write your answers',
    href: '/dashboard/faqs',
    body: 'The questions your customers ask, answered in a way an assistant can quote. Draft them here, edit them in your own words, then publish.',
  },
  {
    label: 'Put them on your site',
    href: '/dashboard/publish',
    body: 'Nothing can be quoted until it is on your own domain. Copy the block, paste it onto the page, done.',
  },
];

/*
  The vocabulary map. The marketing site teaches a five-step loop (Audit,
  Discover, Generate, Publish, Track) and the sidebar has five destinations
  with different names. Someone who read one and then signed in cannot map them
  onto each other, which is a large share of "where do I click".
*/
const NAV_MAP = [
  {
    nav: 'Home',
    href: '/dashboard',
    loop: 'Everything',
    body: 'What needs you next, in order. Start here when you don’t know what to do.',
  },
  {
    nav: 'Your site',
    href: '/dashboard/audit',
    loop: 'Audit',
    body: 'The check: what an AI crawler can and can’t read on your pages, scored, with the fixes ranked by what each is worth.',
  },
  {
    nav: 'Opportunities',
    href: '/dashboard/questions',
    loop: 'Discover',
    body: 'Questions people put to assistants about a business like yours, plus the pages your industry is expected to have.',
  },
  {
    nav: 'Answers',
    href: '/dashboard/faqs',
    loop: 'Generate + Publish',
    body: 'Writing the answers, and the copy-paste export that puts them on your site. Two tabs, one job.',
  },
  {
    nav: 'Results',
    href: '/dashboard/tracking',
    loop: 'Track',
    body: 'What the assistants say when asked your questions — who they cite, who they name, and who takes the click instead.',
  },
];

/* Representative scores, only so each band prints its real label and summary. */
const BAND_EXAMPLES = [92, 72, 45, 15];

const TROUBLESHOOTING = [
  {
    q: 'I pasted the block but my site still says “out of date”',
    a: (
      <>
        <P>
          That badge tracks your answers, not your page — we can’t see what you pasted. It turns
          amber when an answer changed <em>here</em> after the last time you told us you’d pasted
          it, so the live copy is behind.
        </P>
        <P>
          Paste the current block again and press <strong>I’ve pasted it</strong>. If you already
          did, press it again — that’s the button that clears the state.
        </P>
      </>
    ),
  },
  {
    q: 'The check says my site turned us away',
    a: (
      <>
        <P>
          That’s a firewall or bot protection at your host, not a problem with your address. We
          identify honestly as <code className="text-navy font-mono text-xs">FaqFlo-Audit</code>{' '}
          rather than pretending to be a browser, which some hosts block by default.
        </P>
        <P>
          Whoever manages your hosting can allow it. It’s the same class of rule that would block
          any crawler — worth fixing regardless, because the AI crawlers are hitting the same wall.
        </P>
      </>
    ),
  },
  {
    q: 'Another tool reports more citations than you do. Why?',
    a: (
      <P>
        Almost always sample size rather than detection. We ask the {PRO.promptCap}{' '}
        questions on your watch list, and each result is one answer we saw with our own eyes on the
        day we asked. Tools that report bigger numbers are usually watching far more prompts and
        adding up weeks of them. Watching more questions and running more often closes the gap —
        every figure here stays a count of checks we actually ran, so it will never be inflated to
        match.
      </P>
    ),
  },
  {
    q: 'Does a check keep running if I click to another page?',
    a: (
      <P>
        Yes — it carries on while you use the rest of FaqFlo, and a progress bar follows you. It
        runs from your browser though, so reloading or closing the tab does stop it. Nothing is
        lost when that happens: the answers already collected are saved, and starting again asks
        only for the ones still missing rather than paying twice for the same answers.
      </P>
    ),
  },
  {
    q: 'Why does my score go up when I haven’t changed anything?',
    a: (
      <P>
        Checks that we couldn’t measure don’t count against you, so a page that becomes reachable
        adds its checks to the total. The score always says how many checks it’s based on — if that
        number moved, the score moved with it.
      </P>
    ),
  },
  {
    q: 'Can I edit the answers you wrote?',
    a: (
      <P>
        Please do. They’re a first draft in your voice’s general direction, not a finished product —
        you know your prices, your area and your caveats, and an answer with a real number in it
        gets quoted more often than one without. Edit, then publish.
      </P>
    ),
  },
  {
    q: 'Do I need a developer, or a plugin?',
    a: (
      <P>
        Neither. You paste a block of HTML into your page the same way you’d paste a paragraph.
        There is no plugin to install and nothing to keep updated — see{' '}
        <A href="#publishing">Publishing</A> for where it goes on each platform.
      </P>
    ),
  },
  {
    q: 'What happens to my work if I stop paying?',
    a: (
      <P>
        You keep it. The audit you ran, the answers you wrote and the export all stay available —
        that’s deliberate, and it’s why publishing isn’t on a timer. What stops is making{' '}
        <em>new</em> work: new audits, newly generated answers. See <A href="#plans">Plans</A>.
      </P>
    ),
  },
  {
    q: 'Can I check more than one website?',
    a: (
      <P>
        {SITE_CAP === 1
          ? 'One website per account, on both plans. If you need to check a different one, remove the current site on the Sites page and add the new one — though anything written for the old site goes with it.'
          : `Up to ${SITE_CAP} websites per account, on both plans.`}
      </P>
    ),
  },
];

/**
 * First name only — "Hey, Beau" reads like a person, "Hey, Beau Bridges" doesn't.
 *
 * Returns null rather than a placeholder when there is nothing usable, so the
 * caller can drop the name from the sentence instead of greeting a stand-in.
 * An address is treated as unknown: some people type their email into the name
 * field at sign-up, and "Hey, beau@example.com" is worse than no name at all.
 */
function firstName(name: string | null): string | null {
  const trimmed = (name ?? '').trim();
  if (!trimmed || trimmed.includes('@')) return null;
  return trimmed.split(/\s+/)[0] || null;
}

export function HelpWorkspace({ name }: { name: string | null }) {
  const who = firstName(name);

  return (
    <>
      <PageHeader
        title="Help"
        description={`${
          who ? `👋 Hey ${who}` : '👋 Hey there'
        }, here’s how FaqFlo works, what each screen does, and how to get your answers onto your own site. If it isn’t covered, ask us at the bottom and we’ll answer.`}
      />

      {/* Mobile contents. A <details> rather than a rail, collapsed by default,
          because a ten-item list above the content pushes the content off a
          phone screen entirely. */}
      <details className="border-line group mb-6 rounded-xl border bg-white p-4 lg:hidden">
        <summary className="text-navy flex cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">
          On this page
          <span
            className="text-slate/60 transition-transform duration-200 group-open:rotate-90"
            aria-hidden="true"
          >
            ▸
          </span>
        </summary>
        <ol className="text-slate mt-3 space-y-2 text-sm">
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="hover:text-primary transition-colors duration-150">
                <span className="text-slate/50 font-mono text-xs">
                  {String(i + 1).padStart(2, '0')}
                </span>{' '}
                {s.nav}
              </a>
            </li>
          ))}
        </ol>
      </details>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start lg:gap-8">
        <div className="min-w-0">
          {/* ---------------------------------------------------- start here */}
          <Section id="start-here">
            <P>
              Four steps, and you can stop after any of them — nothing here expires halfway
              through. Most people do the first two in an evening and come back to the writing.
            </P>

            <ol className="mt-6 space-y-4">
              {STEPS.map((step, i) => (
                <li key={step.href}>
                  <Card className="flex gap-4 p-5">
                    <span
                      className="bg-primary-soft text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={step.href}
                        className="text-navy hover:text-primary text-[0.9375rem] font-bold transition-colors duration-150"
                      >
                        {step.label} →
                      </Link>
                      <p className="text-slate mt-1 text-[0.9375rem] leading-relaxed">
                        {step.body}
                      </p>
                    </div>
                  </Card>
                </li>
              ))}
            </ol>

            <P className="mt-6">
              Your dashboard home tracks these four for you and shows whichever is next, so you
              don’t have to hold the order in your head.
            </P>
          </Section>

          {/* -------------------------------------------------- how it works */}
          <Section id="how-it-works">
            <P>
              The idea in one line: <strong>people ask assistants instead of searching</strong>, and
              an assistant can only quote text it can actually read on your own domain. So the job
              is to put clear answers, in plain HTML, on pages you own — and then check whether
              they get quoted.
            </P>
            <P>
              Two things follow from that, and they explain most of how this product is shaped.
              First, <strong>no JavaScript</strong>: AI crawlers don’t run scripts, so anything a
              widget draws after the page loads is invisible to exactly the audience this is for.
              That’s why you get a block to paste rather than a plugin to install. Second,{' '}
              <strong>your domain, not ours</strong> — hosting your answers on a FaqFlo subdomain
              would send the citation and the click to us.
            </P>

            <SectionTitle as="h3" className="mt-8">
              Where things are
            </SectionTitle>
            <P className="mt-2">
              The sidebar has five destinations. If you read the marketing site first, its five-step
              loop maps onto them like this:
            </P>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-136 text-left text-sm">
                <thead>
                  <tr className="border-line border-b">
                    <th className="text-slate py-2 pr-4 font-mono text-[0.6875rem] tracking-wide uppercase">
                      In the app
                    </th>
                    <th className="text-slate py-2 pr-4 font-mono text-[0.6875rem] tracking-wide uppercase">
                      Called this elsewhere
                    </th>
                    <th className="text-slate py-2 font-mono text-[0.6875rem] tracking-wide uppercase">
                      What it does
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-line divide-y">
                  {NAV_MAP.map((row) => (
                    <tr key={row.href}>
                      <td className="py-3 pr-4 align-top">
                        <Link
                          href={row.href}
                          className="text-navy hover:text-primary font-semibold transition-colors duration-150"
                        >
                          {row.nav}
                        </Link>
                      </td>
                      <td className="text-slate py-3 pr-4 align-top">{row.loop}</td>
                      <td className="text-slate py-3 align-top leading-relaxed">{row.body}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <P className="mt-4">
              Your sites live in the account menu, top right — you go there once to add a site and
              rarely again, so it isn’t one of the five.
            </P>
          </Section>

          {/* -------------------------------------------------- the audit */}
          <Section id="your-site">
            <P>
              We fetch your pages the way a crawler does — no JavaScript, no logging in — and run a
              list of checks against what comes back. A paid check reads up to{' '}
              <strong>{PAGE_BUDGET.pro} pages</strong>, chosen by how likely each is to matter
              rather than the order we trip over them, and stops after{' '}
              {Math.round(AUDIT_TIME_BUDGET_MS / 1000)} seconds if your host is slow. The free check
              reads {PAGE_BUDGET.free === 1 ? 'one page' : `${PAGE_BUDGET.free} pages`}. When it
              stops early, the report says so rather than pretending it saw everything.
            </P>

            <SectionTitle as="h3" className="mt-8">
              The six pillars
            </SectionTitle>
            <P className="mt-2">
              Findings are grouped into six areas, weighted by how much each one actually affects
              whether you get quoted:
            </P>

            <ul className="divide-line mt-4 divide-y">
              {PILLARS.map((pillar) => (
                <li key={pillar.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                  <span className="text-navy text-[0.9375rem] font-semibold">{pillar.label}</span>
                  <Badge tone="neutral">{pillar.weight}%</Badge>
                  <p className="text-slate w-full text-sm leading-relaxed">{pillar.blurb}</p>
                </li>
              ))}
            </ul>

            <SectionTitle as="h3" className="mt-8">
              How the score is worked out
            </SectionTitle>
            <P className="mt-2">
              A check that passes counts in full, a warning counts as half, a failure counts as
              nothing. The score is the weighted average across the pillars that produced one.
            </P>
            <Callout>
              <strong>A check we couldn’t run doesn’t count against you.</strong> It leaves the sum
              entirely rather than scoring zero. Marking something we didn’t measure as a failure
              would drag every result down and make the paid tier look more necessary than it is —
              a sales tactic wearing a diagnostic’s clothes. It’s also why your score can move when
              you haven’t touched the site: the report always states how many checks the number is
              based on.
            </Callout>

            <SectionTitle as="h3" className="mt-8">
              What the bands mean
            </SectionTitle>
            <ul className="divide-line mt-3 divide-y">
              {BAND_EXAMPLES.map((score) => {
                const band = scoreBand(score);
                return (
                  <li key={band.label} className="py-3">
                    <span className="text-navy text-[0.9375rem] font-semibold">{band.label}</span>
                    <p className="text-slate mt-0.5 text-sm leading-relaxed">{band.summary}</p>
                  </li>
                );
              })}
            </ul>

            <P className="mt-6">
              Each fix is labelled with what it’s worth in points. That isn’t a guess — we flip that
              one check to a pass in a copy of your report and re-run the same arithmetic.
            </P>
          </Section>

          {/* -------------------------------------------------- answers */}
          <Section id="answers">
            <P>
              An <strong>answer</strong> is one question and its reply. A <strong>group</strong> is
              a set of answers that belong on one page of your site — your service page, your
              pricing page — and it stores that page’s address.
            </P>
            <P>
              Groups exist because the export is per page. Merging everything into one block would
              put your pricing answers on your service page and claim, in the machine-readable
              part, that both belong at one address. So: one group per page you intend to paste
              onto.
            </P>
            <P>
              Answers are <strong>drafts</strong> until you publish them. Only published answers
              with text in them appear in the export — a half-written draft can’t leak onto your
              live site. Publishing here doesn’t touch your website; it means “this one is ready to
              be pasted”.
            </P>
            <Callout>
              On Free you can keep up to <strong>{FREE_FAQ_CAP} answers</strong>. Pro removes the
              limit. Either way the words are yours — the Answers page has a plain-text copy button
              that never locks, so you can take them with you whatever happens to your plan.
            </Callout>
          </Section>

          {/* -------------------------------------------------- publishing */}
          <Section id="publishing">
            <P>
              This is the part that actually earns citations, and the part worth reading twice.
            </P>

            <SectionTitle as="h3" className="mt-6">
              What you’re pasting
            </SectionTitle>
            <P className="mt-2">
              One block, containing two things. The first is plain semantic HTML — a heading per
              question, a paragraph per answer, no styling of its own, so it takes on your site’s
              fonts and spacing. The second is a small script tag of{' '}
              <strong>structured data</strong> that names your business and marks which text is a
              question and which is the answer.
            </P>
            <Callout>
              <strong>Paste both together.</strong> They’re one block on purpose. We detect changes
              by hashing your question and answer text, so if you pasted the HTML and skipped the
              structured data we’d tell you that page was up to date when half of it was missing.
            </Callout>
            <P className="mt-4">
              The structured data is <em>not</em> there to win FAQ rich results in Google — those
              were retired. It’s there so a machine reading the page can tell a question from an
              answer, and can tell whose answer it is.
            </P>
            <P>
              There is also an <strong>llms.txt</strong>, one plain-text file for the whole site
              listing everything you’ve published. It’s a convention rather than a standard, and it
              costs one file to follow.
            </P>

            <SectionTitle as="h3" className="mt-8">
              Where it goes on your platform
            </SectionTitle>
            {/*
              All six, expanded, with no picker — and no <details> either.

              ⚠️ THIS PAGE IS A SERVER COMPONENT (see the block at the top of
              this file), so there is no selection to hold. That constraint
              happens to agree with what the page is for: it is the long-form
              reference somebody opens when they are already stuck, and the
              first thing a stuck person does is Ctrl-F. Collapsed content is
              not findable that way.

              The picker lives on /dashboard/publish, where the reader has one
              builder in front of them and wants one answer. Same EMBED_GUIDES
              data either way.
            */}
            <div className="divide-line mt-3 divide-y">
              {EMBED_GUIDES.map((guide) => (
                <div key={guide.id} className="py-4 first:pt-0 last:pb-0">
                  <EmbedStepList guide={guide} headingAs="h4" />
                </div>
              ))}
            </div>
            <P className="mt-4">
              Not sure whether yours wraps embeds in an iframe? Load the published page, view
              source, and search for one of your questions. If the text isn’t there, a crawler
              can’t see it either.
            </P>

            <SectionTitle as="h3" className="mt-8">
              The four states a page can be in
            </SectionTitle>
            <dl className="divide-line mt-3 divide-y text-sm">
              <State term="Not pasted yet">
                There’s something to publish, and you haven’t told us it’s live. Nothing reaches an
                engine until it’s on your domain.
              </State>
              <State term="Up to date">
                What’s here matches what you last pasted. Nothing to do.
              </State>
              <State term="Out of date">
                You changed an answer after pasting, so the live page is behind. Copy the block
                again and re-paste it.
              </State>
              <State term="Nothing to publish">
                No published answers in this group yet — write and publish one and the code appears.
              </State>
            </dl>
            <P className="mt-4">
              Re-pasting is manual, and that’s the trade for not needing a plugin: we never touch
              your site, so we can’t update it for you either. Nothing on your site breaks if you
              ignore it — it just quietly says something older than what’s here.
            </P>
          </Section>

          {/* -------------------------------------------------- opportunities */}
          <Section id="opportunities">
            <P>
              Two halves of the same question — what haven’t you answered, and what haven’t you
              written.
            </P>
            <P>
              <strong>Questions</strong> are the things people put to assistants about a business
              like yours. We read your own pages to work out your trade and your area, then skip
              anything you already answer. Draft one and it lands in your answers as a blank,
              waiting for you to fill in.
            </P>
            <P>
              <strong>Pages &amp; topics</strong> is the other direction: the pages a business in
              your industry is expected to have, which of yours are missing, and things worth
              writing about. It needs a full check first, because a list of “missing pages” derived
              from your home page alone would report everything as missing.
            </P>
            <Callout>
              <strong>You won’t find search volumes here.</strong> No number on this page claims how
              many people ask something a month, because nothing in this product measures that and
              no model can know it. What each question carries instead is why answering it would
              help your business — a judgement we can actually make.
            </Callout>
            <P className="mt-4">
              Both halves work better once your industry and service area are set. We read them from
              your site’s own markup when it’s there; you can correct them any time from your sites
              page, and once you do, nothing overwrites them.
            </P>
          </Section>

          {/* -------------------------------------------------- results */}
          <Section id="results">
            <P>
              Everything else in FaqFlo is preparation. This is the measurement: we put the
              questions on your watch list to {ENGINES.join(', ')} and record what came back.
            </P>
            <P>
              Each answer gets one of three verdicts. <strong>Cited</strong> means the assistant
              used your site as a source and linked to it. <strong>Named</strong> means it said
              your business name but sent the click somewhere else — it knows who you are, and that
              is a different problem from being invisible. <strong>Absent</strong> means neither,
              and we record who was cited instead.
            </P>

            {/* Moved here from "What isn't built yet", where it sat while
                tracking was unbuilt. These are caveats about what the numbers
                MEAN — permanent ones — so they belong beside the numbers, not
                on a list of things that are coming. */}
            <Callout>
              <strong>What we ask, and what we can’t.</strong> ChatGPT here is the OpenAI API with
              its web search, and Gemini is the Gemini API with Google Search grounding — very
              close to what the assistants tell people, but not a recording of anyone’s real chat.{' '}
              <strong>Google AI Overviews is absent because it has no API at all.</strong> Listing
              it and reporting a permanent zero would read as <em>you are never cited there</em>{' '}
              when the truth is <em>we never looked</em>.
            </Callout>

            {/* ⚠️ The exclusion is the point of this callout, not a footnote to
                it. A customer who sets a country and sees three engines listed
                would reasonably assume all three were asked from there. */}
            <Callout>
              <strong>Where we ask from.</strong> Set your market on the Sites page and ChatGPT and
              Perplexity are asked as someone searching from there, which changes what they find —
              asked from the UK, ChatGPT returns British directories instead of American ones.{' '}
              <strong>Gemini can’t be given a location</strong>, so its answers are never
              country-specific and are never labelled as though they were. Leave the country unset
              and nothing changes: every engine answers from wherever it defaults to.
            </Callout>

            <SectionTitle as="h3" className="mt-8">
              The numbers along the top
            </SectionTitle>
            <P className="mt-2">
              The <strong>score out of 100</strong> is not a summary sitting on top of a hidden
              calculation — the three findings printed underneath it <em>are</em> the score. It is
              the same AI-visibility pillar your site check uses, which is why running tracking
              moves that score too.
            </P>
            <P>
              Before your first run that pillar reads <em>Not checked</em> and doesn’t drag your
              site score down. That’s deliberate: “0 citations” would say <em>nobody is quoting
              you</em>, which we wouldn’t have measured. Run a check and it starts scoring off what
              the engines actually said.
            </P>
            <Callout>
              <strong>Mentions include citations.</strong> A citation is a link; a mention is being
              named at all, linked or not. So mentions is always the larger number, and the two are
              not rivals — if you are comparing us with another tool, check which of the two it is
              showing you.
            </Callout>
            <P className="mt-4">
              <strong>Share of voice</strong> is your slice of every source the assistants drew on,
              not your slice of the questions. One answer citing six sites offers six slots and you
              either hold one or you don’t, so this is the figure that compares you to a rival
              rather than to yourself. The counts are printed beside it, always.
            </P>

            <SectionTitle as="h3" className="mt-8">
              What to actually do with it
            </SectionTitle>
            <P className="mt-2">
              <strong>Who gets cited</strong> ranks every domain the assistants used, you included.{' '}
              <strong>Pages earning citations</strong> is the useful half of a good result — not
              “you were cited five times” but which page did it, so you know what to write more of.{' '}
              <strong>By engine</strong> matters because being cited on one and invisible on
              another is a specific, fixable problem rather than a general one.
            </P>
            <P>
              Below those, every question you watch, one row each. Open one and you get all three
              assistants side by side — what each actually said, and every link it used. That is
              the point of asking three: “Perplexity cites you, ChatGPT doesn’t” is one finding, and
              you can only see it with both in front of you. Filter to <em>cited</em>,{' '}
              <em>named</em> or <em>absent</em> to find the rows worth reading, and draft an answer
              straight from any question that isn’t landing.
            </P>

            <SectionTitle as="h3" className="mt-8">
              Your watch list
            </SectionTitle>
            <P className="mt-2">
              Free watches <strong>{FREE.promptCap} questions</strong>, checked once when you sign
              up. <strong>Pro</strong> widens that to <strong>{PRO.promptCap}</strong> —{' '}
              {PRO.discoveredCap} we find for you and {PRO.manualCap} you write yourself — and
              checks them every week. Use <strong>Find more questions</strong> for the first and{' '}
              <strong>Add your own question</strong> for the second; the second is for the ones you
              already know matter, like a comparison against a rival you keep losing to. Your own
              questions survive a re-run of the finder; the found ones are replaced by it.
            </P>

            {/* The two absences a tracking product is assumed to have, stated
                beside the feature rather than in a section of their own. This
                is the only place either is mentioned anywhere in the product,
                so it is not a summary of something documented elsewhere. */}
            <P>
              On Free the check runs itself, once, as part of setting your site up — there is
              nothing to press because there is nothing left to spend. Pro checks every week on its
              own, and adds a button for running one whenever you want, which is usually right
              after you have published something.
            </P>

            {/* The absence that is LEFT. A schedule shipped; alerting did not,
                and this is still the only place in the product that says so. */}
            <P>
              Nothing emails you when a citation appears or disappears — you find out by looking.
              That is the next thing being built.
            </P>

            <Callout>
              <strong>Keep the tab open while a check runs.</strong> It carries on while you move
              around FaqFlo — there’s a progress bar on every page — but it runs from your browser,
              so reloading or closing the tab ends it. Nothing is wasted if that happens: every
              answer already collected is saved, and running again asks only for what’s still
              missing rather than paying for the same answers twice.
            </Callout>
          </Section>

          {/* -------------------------------------------------- plans */}
          <Section id="plans">
            <P>
              Two plans, and the difference is how much of your site we look at and how often we
              keep looking.
            </P>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Card className="p-5">
                <MicroLabel>Free forever</MicroLabel>
                <SectionTitle as="h3" className="mt-3">
                  {PLAN_COPY.free.label} — {PLAN_COPY.free.price}
                </SectionTitle>
                <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">
                  {PLAN_COPY.free.blurb}
                </p>
              </Card>
              <Card className="p-5">
                <MicroLabel tone="primary">Subscription</MicroLabel>
                <SectionTitle as="h3" className="mt-3">
                  {PLAN_COPY.pro.label} — {PLAN_COPY.pro.price}
                </SectionTitle>
                <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">
                  {PLAN_COPY.pro.blurb}
                </p>
              </Card>
            </div>

            <SectionTitle as="h3" className="mt-8">
              What happens if you cancel
            </SectionTitle>
            <P className="mt-2">
              This is the part worth being precise about, because it’s the one most people skim.
            </P>
            <ul className="divide-line mt-3 divide-y text-sm">
              <State term="Yours whatever happens">
                Every answer you wrote, and every result we collected. The Answers page has a
                plain-text copy button that never locks, and the Results page keeps showing the
                readings your account paid for. We do not hide measurements to sell them back.
              </State>
              <State term="Stops when the subscription does">
                The ready-to-paste HTML and schema code, new site checks, finding new questions,
                writing new answers, and the weekly watching. That is what the subscription buys, so
                that is what it stops buying.
              </State>
            </ul>
            <P className="mt-4">
              Yearly costs ${PRO_PRICE.annualTotal} instead of ${PRO_PRICE.monthly * 12} — about{' '}
              {Math.round((PRO_PRICE.monthly * 12 - PRO_PRICE.annualTotal) / PRO_PRICE.monthly)}{' '}
              months free — and if it isn’t for you, tell us within {GUARANTEE_DAYS} days and we
              refund the lot. Monthly you can cancel whenever you like from Manage billing; there is
              no refund on a month already started, because you can stop before the next one.
            </P>
          </Section>

          {/* -------------------------------------------------- not built */}
          {/* -------------------------------------------------- faq */}
          <Section id="faq">
            <div className="divide-line border-line mt-2 divide-y border-t">
              {TROUBLESHOOTING.map((item) => (
                <Disclosure key={item.q} question={item.q}>
                  {item.a}
                </Disclosure>
              ))}
            </div>
          </Section>

          {/* -------------------------------------------------- contact */}
          <Section id="contact">
            <P>
              Send us the question and we’ll answer it. If it turns out this page should have
              covered it, we’ll add it here too.
            </P>

            {/*
              Above the form, not below it.

              Somebody who has read to the bottom of this page and is reaching
              for a support form is, more often than not, telling us the work
              is more than they bargained for. Offering to do it after they
              have already typed the message reads as an afterthought; offering
              it here means they get to choose. It does not replace the form —
              plenty of people scrolling past this genuinely just have a
              question.
            */}
            <div className="mt-5">
              <DoneForYouCard
                title="Or don’t do any of it"
                body="Don’t fancy working an audit and pasting HTML into your CMS? Completely fair. I’ll do the whole thing by hand instead."
              />
            </div>

            <div className="mt-5">
              <ContactForm />
            </div>
            <P className="mt-4 text-sm">
              Prefer your own email client? Write to{' '}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-primary hover:text-primary-hover font-semibold"
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </P>
          </Section>
        </div>

        {/* Sticky contents. No scroll-spy — the same deliberate limit /about and
            /seo-guide set, and a plain anchor list needs no JavaScript at all. */}
        <aside className="hidden lg:block">
          {/* Capped and scrollable for the same reason the sidebar is: ten items
              fit any realistic viewport, but a list that outgrows the screen
              with no way to reach the end is the failure this guards. */}
          <nav
            aria-labelledby="toc-heading"
            className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto"
          >
            <p
              id="toc-heading"
              className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase"
            >
              On this page
            </p>
            <ol className="mt-3 space-y-2">
              {SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="text-slate hover:text-primary flex gap-2 text-sm transition-colors duration-150"
                  >
                    <span className="text-slate/50 font-mono text-xs">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {s.nav}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
      </div>
    </>
  );
}

/* ------------------------------------------------------------ primitives --- */

/** One section, its heading taken from SECTIONS so the two can't disagree. */
function Section({ id, children }: { id: SectionId; children: React.ReactNode }) {
  return (
    <section id={id} className="border-line scroll-mt-24 border-t pt-8 pb-10 first:border-t-0 first:pt-0">
      <h2 className="text-navy text-[1.375rem] font-extrabold tracking-tight">{meta(id).title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Body copy. One size everywhere, so the page reads as prose and not as UI. */
function P({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-slate text-[0.9375rem] leading-relaxed [&+&]:mt-3 ${className}`}>
      {children}
    </p>
  );
}

/** The asides worth stopping on — a claim that would otherwise be skimmed. */
function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-primary bg-primary-soft/40 mt-4 rounded-r-xl border-l-2 py-3 pr-4 pl-4">
      <p className="text-navy text-[0.9375rem] leading-relaxed">{children}</p>
    </div>
  );
}

/** A term and its meaning, for the state and entitlement lists. */
function State({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <dt className="text-navy font-semibold">{term}</dt>
      <dd className="text-slate mt-0.5 leading-relaxed">{children}</dd>
    </div>
  );
}

/*
  Troubleshooting disclosure.

  Not `components/ui/faq-item.tsx`, deliberately: its `answer` is a string
  rendered into a single <p>, because components/marketing/site-faq.tsx builds
  FAQPage JSON-LD out of those same strings. These answers need links, code and
  more than one paragraph, so this takes children instead. Still a native
  <details>, so it works with JavaScript off like everything else here.
*/
function Disclosure({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="group py-4">
      <summary className="text-navy flex cursor-pointer list-none items-start justify-between gap-4 text-[0.9375rem] font-semibold [&::-webkit-details-marker]:hidden">
        {question}
        <span
          className="text-slate/60 mt-1 shrink-0 transition-transform duration-200 group-open:rotate-90"
          aria-hidden="true"
        >
          ▸
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/** Inline link, for cross-references within the page. */
function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="text-primary hover:text-primary-hover font-medium underline">
      {children}
    </a>
  );
}

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { AUDIT_TIME_BUDGET_MS } from '@/lib/audit/limits';
import { scoreBand } from '@/lib/audit/score';
import { PILLARS } from '@/lib/audit/types';
import { PLACEMENT_NOTES } from '@/lib/dashboard/export';
import {
  ENTITLEMENTS,
  FREE_FAQ_CAP,
  GET_CITED_WINDOW_DAYS,
  PAGE_BUDGET,
} from '@/lib/dashboard/plans';
import { SUPPORT_EMAIL } from '@/lib/support';
import { ContactForm } from './contact-form';
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
  { id: 'plans', nav: 'Plans', title: 'What each plan covers' },
  { id: 'not-yet', nav: 'Not built yet', title: 'What isn’t built yet' },
  { id: 'faq', nav: 'Common questions', title: 'Common questions' },
  { id: 'contact', nav: 'Still stuck', title: 'Still stuck?' },
] as const;

/** Typed against the ids above, so a typo in a lookup fails to compile. */
type SectionId = (typeof SECTIONS)[number]['id'];
const meta = (id: SectionId) => SECTIONS.find((s) => s.id === id)!;

/*
  The four setup steps, worded to match setupSteps() in lib/dashboard/worklist.ts.

  ⚠️ FOUR, NOT FIVE. The worklist has the same count for the same reason: there
  is no "watch for citations" step, because nothing in this product queries an
  answer engine. A fifth box would be one nobody can ever tick.
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
    body: 'Where citation tracking will live. Not running yet — see below.',
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
    q: 'I added a second site — do I pay again?',
    a: (
      <P>
        Get Cited is per site, so yes for a one-off setup. Stay Cited is per account, so one
        subscription covers every site you own. Adding sites is always free.
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
              <table className="w-full min-w-[34rem] text-left text-sm">
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
              <strong>{PAGE_BUDGET.paid} pages</strong>, chosen by how likely each is to matter
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
              Without Get Cited a site keeps up to <strong>{FREE_FAQ_CAP} answers</strong>. Once
              it’s bought, that cap is gone for good — including after the {GET_CITED_WINDOW_DAYS}
              -day window closes. We don’t delete work you paid to have written.
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
            <ul className="divide-line mt-3 divide-y">
              {PLACEMENT_NOTES.map((note) => (
                <li key={note.platform} className="py-3.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-navy text-[0.9375rem] font-semibold">{note.platform}</span>
                    {note.warning && <Badge tone="neutral">Read this one</Badge>}
                  </div>
                  <p
                    className={`mt-1 text-sm leading-relaxed ${
                      note.warning ? 'text-error-ink' : 'text-slate'
                    }`}
                  >
                    {note.note}
                  </p>
                </li>
              ))}
            </ul>
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

          {/* -------------------------------------------------- plans */}
          <Section id="plans">
            <P>
              Two things, bought at different levels, and the difference matters more than the
              price does.
            </P>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Card className="p-5">
                <MicroLabel tone="primary">Per site · one-off</MicroLabel>
                <SectionTitle as="h3" className="mt-3">
                  {ENTITLEMENTS.get_cited.label} — {ENTITLEMENTS.get_cited.price}
                </SectionTitle>
                <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">
                  {ENTITLEMENTS.get_cited.blurb}
                </p>
              </Card>
              <Card className="p-5">
                <MicroLabel>Per account · subscription</MicroLabel>
                <SectionTitle as="h3" className="mt-3">
                  {ENTITLEMENTS.stay_cited.label} — {ENTITLEMENTS.stay_cited.price}
                </SectionTitle>
                <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">
                  {ENTITLEMENTS.stay_cited.blurb}
                </p>
              </Card>
            </div>

            <SectionTitle as="h3" className="mt-8">
              What the {GET_CITED_WINDOW_DAYS} days actually cover
            </SectionTitle>
            <P className="mt-2">
              This is the part worth being precise about, because it’s the one most people skim.
              Get Cited buys two different things: a deliverable, and a period of work.
            </P>
            <ul className="divide-line mt-3 divide-y text-sm">
              <State term="Yours permanently">
                The audit you ran, every answer written, the copy-paste export, the structured data
                and the llms.txt. Publishing never stops working — you can come back in a year and
                copy your block again.
              </State>
              <State term={`Runs for ${GET_CITED_WINDOW_DAYS} days`}>
                Making <em>new</em> work: running fresh checks, discovering new questions, building
                a content plan, generating more answers. That’s what Stay Cited keeps open.
              </State>
            </ul>
            <P className="mt-4">
              Stay Cited is per account, so one subscription re-opens every site you own — including
              ones whose {GET_CITED_WINDOW_DAYS} days already ran out. Adding sites is always free;
              the money is per site set up, so we’ve no reason to cap them.
            </P>
          </Section>

          {/* -------------------------------------------------- not built */}
          <Section id="not-yet">
            <Card tone="cloud" className="p-5 sm:p-7">
              <SectionTitle>Citation tracking runs, but you have to press the button</SectionTitle>
              <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">
                Tracking is live on <strong>Stay Cited</strong>: it puts your questions to ChatGPT,
                Perplexity and Gemini and records, for each one, whether they cited you, named you
                without a link, or pointed somewhere else. What doesn’t exist yet is the{' '}
                <em>schedule</em> — nothing runs on its own, so a run happens when you start one
                from the Results page.
              </p>
              <p className="text-slate mt-3 text-[0.9375rem] leading-relaxed">
                Two things we ask and one we can’t. ChatGPT here is the OpenAI API with web search,
                and Gemini is the Gemini API with Google Search grounding — close to what the
                assistants say, but not a recording of a real chat. <strong>Google AI Overviews is
                absent because it has no API at all</strong>; naming it and reporting a permanent
                zero would read as <em>you are never cited there</em> rather than{' '}
                <em>we never looked</em>.
              </p>
              <p className="text-slate mt-3 text-[0.9375rem] leading-relaxed">
                Until you’ve run a check, the <strong>AI visibility</strong> pillar shows as{' '}
                <em>Not checked</em> and doesn’t drag your score down. That’s deliberate: a “0
                citations” figure would read as <em>nobody is quoting you</em>, which we wouldn’t
                have measured. Run tracking and the pillar starts scoring off what the engines
                actually said.
              </p>
            </Card>
            <P className="mt-4">
              Three smaller things that don’t exist, so you don’t go looking: a schedule that runs
              tracking for you, alerts when a citation appears or disappears, and any figure
              claiming how often a question is asked.
            </P>
          </Section>

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

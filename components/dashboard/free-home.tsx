'use client';

import { ScoreDial } from '@/components/ui/score-dial';
import { scoreBand } from '@/lib/audit/score';
import { PRO_PRICE } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { groupByQuestion, namedIn } from '@/lib/dashboard/questions';
import { formatPlainDate } from '@/lib/dashboard/format';
import { pickProof } from '@/lib/dashboard/proof';
import { NextSteps, nextStepsFor } from './next-steps';
import { PageHeader } from './page-header';
import { PromptRanking } from './prompt-ranking';
import { ProofCard } from './proof-card';
import { ReadabilityChecklist, readabilityRows } from './readability-checklist';
import { SiteForm } from './site-form';
import { UpgradeCard } from './upgrade-card';

/*
  Home, for an account on the free plan.

  ⚠️ A SEPARATE COMPOSITION, NOT A GATED OverviewWorkspace, AND THE TWO PAGES
  HAVE DIFFERENT JOBS. Pro's Home is where a weekly email lands — somebody who
  already pays, arriving to see what moved. This is a conversion page: somebody
  who has had one check so far, can run three, and is deciding whether any of
  this is real.
  Gating one screen into serving both would have meant every block carrying a
  branch, and the honest version of each is a different block.

  The blocks themselves are shared, which is what makes two compositions cheap:
  every one of them takes its data as props and none reads the store.

  ⚠️ THE ROUTE CHOOSES, NOT THIS FILE. app/(app)/dashboard/page.tsx reads the
  plan server-side and renders one of the two. Deciding here would mean reading
  it from the provider, which resolves the plan a frame late — and a paying
  customer would see this page flash before Pro's replaced it.

  Order is one argument, in sequence: here is the verdict, here is whether AI
  can read you at all, here is one answer in full as proof, here is who ranks
  for your prompts, here is what to do about it.

  ⚠️ IT USED TO END IN AN ANSWER WRITER, AND THAT WAS THE WRONG LAST STEP. The
  page finished with a generator — write some FAQs, copy them out — which put
  the work before the reason for it. Somebody who has not yet seen an assistant
  name a directory instead of them has no reason to write anything. Free is a
  diagnosis now; writing the answers is part of what Pro buys, and the pricing
  page was changed in the same commit to say so.

  ⚠️ TWO SECTIONS BECAME ONE. "Every question we asked" listed ratios and
  "Who's getting named instead" listed domains — the same run, split across two
  places, neither of which showed the comparison. PromptRanking is one grid: a
  row reads "no engine names me", a column reads "Perplexity never does".
*/
export function FreeHome() {
  const { site, tracking, data } = useDashboard();

  const report = site?.lastAudit ?? null;

  /*
    Nothing to report on yet.

    ⚠️ NOT SetupChecklist, WHICH IS NOW A LIST OF FOUR DEAD ENDS. Its steps
    point at /dashboard/sites, /audit, /faqs and /publish — every one of which
    redirects a free account straight back here. A checklist whose only button
    returns you to the checklist is worse than no checklist.

    The form goes inline for the same reason answer-writing did: free is one
    page, so "go and do it over there" has nowhere to point. SiteForm creates
    the row, starts the first check and sends them to /dashboard/start to watch
    it, which is the whole of a free account's setup in one step rather than
    four.
  */
  if (!site || !data) {
    return (
      <>
        <PageHeader
          title="Welcome to FaqFlo"
          description="Add your website and we’ll read it the way ChatGPT and Perplexity would, then tell you plainly what they can and can’t see."
        />
        <SiteForm />
      </>
    );
  }

  const band = report ? scoreBand(report.score) : null;

  /*
    The citation half.

    ⚠️ `checked > 0`, NOT `tracking == null`. The provider falls back to
    emptyTracking() — all zeros — whenever the read has not landed, so a null
    check would render "0 of 5" both in the in-flight window and forever on an
    account whose scan has not reached its tracking stage. Asking whether any
    engine actually answered is the only honest test.
  */
  const byEngine = tracking?.byEngine ?? [];
  const asked = byEngine.some((e) => e.checked > 0);

  const groupsByQuestion = groupByQuestion(tracking?.latest ?? []);
  const namedCount = groupsByQuestion.filter((g) => namedIn(g) > 0).length;
  const questionCount = groupsByQuestion.length;

  const proof = asked ? pickProof(tracking?.latest ?? []) : null;

  /* Questions no engine named this business on. Spelled out at one, because
     "The other 1 went to somebody else" reads as a placeholder. */
  const missed = questionCount - namedCount;

  /* Both derived here rather than inside their components, so the sections that
     wrap them can be gated on whether there is anything to show. */
  const readability = report ? readabilityRows(report) : [];
  const steps = report ? nextStepsFor(report) : [];

  const firstName = data.user.name.split(' ')[0] ?? '';

  return (
    <article>
      {/*
        A lighter page, for this route only.

        ⚠️ NOT A CHANGE TO --color-cloud, AND THAT IS THE WHOLE POINT. The token
        does two unrelated jobs: it is the page canvas, and it is "a surface
        slightly recessed from white". Around thirty of its sixty-odd uses want
        the second — segmented-control tracks whose active tab is signalled only
        by bg-white sitting on them, unfilled Meter tracks with no border, the
        sixteen <Card tone="cloud"> that exist precisely so as not to be white
        beside a white card. Lighten the token and every one of those collapses.

        ⚠️ NOT A WRAPPER AROUND THIS ARTICLE EITHER. AppShell's <main> carries
        its own px/py, so an opaque wrapper here would render as an inset slab
        with the old background still showing in the gutters — and the body wash
        is background-attachment: fixed, which globals.css warns "would
        otherwise cut off as a hard colour band".

        Fixed matches that attachment exactly, so there is no seam at any scroll
        position. It is behind everything (-z-10) and cannot be clicked. The
        sidebar paints its own white and the header its own tint, so both sit on
        top of this untouched.

        ⚠️ WHITE RATHER THAN A THIRD TINT. The print block already forces
        `html, body { background: #fff }`, so this narrows the gap between how
        the report looks on screen and on paper instead of inventing a surface
        that exists in neither.
      */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-white" aria-hidden="true" />

      {/*
        The masthead, and a welcome above it.

        ⚠️ THERE IS A GREETING NOW, AND THE OLD NOTE HERE SAID THERE MUST NOT
        BE. It argued this is "a document about a website" rather than "a place
        you work", so it should open with its subject the way a report handed to
        somebody would. That is still what the masthead does — the greeting sits
        above it as a line of welcome, not in place of it.

        ⚠️ NOT A TIME-OF-DAY GREETING, WHICH IS THE PART WORTH KEEPING OUT. Pro's
        Home says "Good morning, Beau" from the client clock, and the shots page
        carries a comment complaining that regenerating in the afternoon changes
        that file. A plain welcome reads the same at any hour and renders
        identically on the server and the client.

        ⚠️ AND NO YEAR IN THE GOAL LINE, UNLIKE THE HOME PAGE'S. Marketing says
        "more customers in {year}" and built-for-owners.tsx spends a paragraph on
        what that costs: the year is stamped at build time on a prerendered page
        and goes stale if deploys get sparse. This page is dynamic, so the date
        would be right — but it is rendered on the server and again on the
        client, which is a hydration mismatch waiting for New Year's Eve, in
        exchange for a word nobody needs. The goal is the same goal without it.
      */}
      <p className="text-slate text-[0.9375rem] leading-relaxed">
        Welcome{firstName ? `, ${firstName}` : ''} 👋 — here&rsquo;s what AI can see about your
        business today.{' '}
        <span className="text-navy font-semibold">
          Our goal is simple: get you more customers.
        </span>
      </p>

      {/*
        The masthead: identity, title, date, score and verdict in one block.

        ⚠️ IT IS A FULL-WIDTH FILLED BLOCK, WHICH THE Section NOTE BELOW SAYS TO
        BE CAREFUL OF. That note sets three tests for a filled surface in the app
        shell — inline rather than full-width, on a page read once, and replacing
        structure rather than decorating it — and this passes two. The argument
        for the third:

        overview-workspace.tsx's banner verdict is about REPETITION. It objects
        to "six identical full-width rectangles stacked down the page" — a
        rhythm, not a block. This is one masthead with nothing like it below, and
        the tests it does pass govern headings INSIDE the flow. A masthead sits
        above the flow and is the document's title block; a report cover being a
        solid field is the oldest convention in the form.

        And it does replace structure: a border-b-2 rule and a separate score row
        collapsed into this. Nothing was added on top of something that worked.

        ⚠️ NAVY, NOT THE GRADIENT, AND THE CHIPS BELOW STAY bg-primary. The
        gradient's cyan end takes navy text only — final-cta.tsx has the numbers
        — so a gradient masthead could not carry white type. Navy is the one dark
        surface this codebase already knows: bg-navy + shadow-hero + grain +
        rounded-2xl is how-it-works.tsx's panel, verbatim.

        ⚠️ EVERY CHILD NEEDS `relative`. .grain is an absolute ::after at inset-0
        and paints over anything that is not in its own stacking context.

        ⚠️ print: OVERRIDES ARE NOT OPTIONAL. globals.css forces the page white
        for print but does not strip bg-navy, and the white children keep their
        colour — so without these the whole header prints white on white. This
        page has no print button, but Cmd+P is always there.
      */}
      <header className="bg-navy shadow-hero grain relative mt-4 overflow-hidden rounded-2xl p-6 sm:p-7 print:bg-white print:shadow-none">
        {/*
          ⚠️ THE WHOLE IDENTITY IS ONE SMALL LINE, AND THE h1 IS IT. "AI
          visibility report" was the biggest thing on the page and the least
          interesting thing on it — a document title where the news is the
          verdict. It keeps the h1 because a page still owes a screen reader a
          title, and a heading reading "Hard to quote" with no subject is worse
          than a quiet one; it just stops being 32px.

          font-normal and tracking-wide are overrides, not tidying: globals.css
          sets every h1 to weight 800 at -0.02em, which at 11px reads as a
          smudge. Same reason section-title.tsx exists.
        */}
        <h1 className="text-accent relative font-mono text-[0.6875rem] font-normal tracking-wide uppercase print:text-slate">
          {site.domain}
          {/* ⚠️ formatPlainDate, not toLocaleDateString. The helper pins
              timeZone: 'UTC' because "a date rendered in the browser's zone can
              land on the previous day". Rendered only when there IS a report:
              falling back to today would date a reading that does not exist. */}
          <span className="text-white/60 print:text-slate">
            {' · '}AI visibility report
            {report?.checkedAt ? ` · ${formatPlainDate(report.checkedAt)}` : ''}
          </span>
        </h1>

        {/*
          ⚠️ THE RING SITS WITH THE VERDICT BECAUSE THEY ARE ONE IDEA. It was
          pinned to the far edge by justify-between, which put the number and
          the words that explain it at opposite ends of the card. Beside the
          text it also cannot collide with the right edge at any width, which
          is what the old arrangement did first as the viewport narrowed.

          ⚠️ THE NUMBER IS SUPPORTING, NOT STRUCTURAL. Small ring, words leading
          — so retiring the score from this surface later is deleting one
          element rather than redesigning the header around its absence.
        */}
        {report && band && (
          <div className="relative mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
            {/* `reverse` because the figure is text-navy in its own template
                literal — a text-white here would lose to it. */}
            <ScoreDial score={report.score} size="sm" reverse />

            <div className="min-w-0">
              <p className="text-[1.5rem] font-extrabold tracking-tight text-white print:text-navy">
                {band.label}
              </p>
              <p className="mt-1.5 max-w-xl text-[0.9375rem] leading-relaxed text-white/80 print:text-slate">
                {band.summary}
              </p>
              {/* ⚠️ /70, NOT /50. The same measured ratio reads dimmer on a dark
                  surface than on a light one — 5.11:1 passed and still looked
                  muddy here. Muted on navy starts higher than muted on white. */}
              <p className="mt-2 text-xs text-white/70 print:text-slate">
                We checked {report.scoredCount} things on your home page.
              </p>
            </div>
          </div>
        )}
      </header>

      {/*
        ⚠️ THE VERDICT IS FIRST AND STAYS FIRST. It is the sentence the whole
        page exists to earn, and it must never be hardcoded: "Right now, AI
        doesn't recommend your business" is right for an account nobody named
        and false for one named on two prompts out of three.
      */}
      {asked && (
        <section className="pt-8 pb-2">
          {/*
            The page's headline finding. It used to sit as an h3 INSIDE a
            section whose own h2 was 15px — the outline said the heading was the
            small uppercase label and the conclusion was subordinate to it,
            which is backwards.

            ⚠️ IT MATCHES THE MASTHEAD'S VERDICT AT sm+, RATHER THAN BEATING IT.
            At 1.75rem it was the loudest thing on the page by a clear step.
            These are two findings of the same kind — whether AI can read you,
            and whether AI names you — so they read as peers at 1.5rem, with the
            section chips a step below at 1.25rem. Three sizes, one scale.
          */}
          <h2 className="text-navy text-[1.375rem] font-extrabold tracking-tight sm:text-[1.5rem]">
            {namedCount === 0
              ? 'Right now, AI doesn’t recommend your business.'
              : namedCount === questionCount
                ? 'AI names you on every question we asked.'
                : `AI names you sometimes — on ${namedCount} of your ${questionCount} questions.`}
          </h2>
          {/*
            ⚠️ "SOMEBODY ELSE", AND NEVER "YOUR COMPETITOR". citedInstead is the
            top source in the engine's own ranking that is not this domain, and
            proof-card.tsx records what that turns out to be: "a lead-generation
            directory at least as often as it is a rival business". Naming a
            category we did not measure would be confidently wrong on a large
            share of local-services accounts.

            The middle branch used to be six words. It is the commonest result
            there is, and it left the reader with the fact and nothing to do
            with it — so it now says what "somebody else" usually means and
            points at the table that names them.
          */}
          <p className="text-slate mt-2.5 text-[1.0625rem] leading-relaxed">
            {namedCount === 0
              ? `We asked ${questionCount} questions a customer might ask. Your name came back on none of them.`
              : namedCount === questionCount
                ? `All ${questionCount} of them. Worth keeping an eye on — answers change as the assistants re-read the web.`
                : `The other ${missed === 1 ? 'one' : missed} went to somebody else. Often that’s a directory rather than a business like yours. The table below shows who, question by question.`}
          </p>
        </section>
      )}

      {/* Can AI read the site — the three checks a free audit scores, as boxes
          rather than as prose. This replaced a "Why" section that listed only
          the failures: a reader counting three boxes learns more than one
          reading two paragraphs about what went wrong.

          ⚠️ Gated on the rows, not on `report`. A heading with nothing under it
          claims a check we did not take. */}
      {readability.length > 0 && (
        <Section
          title="Can AI actually read your site?"
          lede="Three things decide it. Here’s how yours did."
        >
          <ReadabilityChecklist rows={readability} />
        </Section>
      )}

      {asked && proof && (
        <Section title="What AI said about you" lede="One real question, and the answer it gave.">
          <ProofCard proof={proof} siteName={site.name} />
        </Section>
      )}

      {/* ⚠️ THIS SUBSUMES TWO OLD SECTIONS. "Every question we asked" was a list
          of ratios and "Who's getting named instead" was a list of domains; the
          table carries both facts in one grid, which is the comparison somebody
          actually wants and one fewer thing to scroll past. */}
      {asked && (
        <Section
          title="Who AI names for your questions"
          lede="A tick means it named you. A cross means it named somebody else."
        >
          <PromptRanking tracking={tracking} />
        </Section>
      )}

      {!asked && (
        <Section title="We’re asking AI about you now" lede="This takes a few minutes.">
          {/* Three sentences, not one of thirty-two words. Same facts. */}
          <p className="text-slate text-[0.9375rem] leading-relaxed">
            We’re putting your questions to ChatGPT, Perplexity and Google’s Gemini. We’ll record
            who each one names. You can close this tab — it keeps running without you.
          </p>
        </Section>
      )}

      {/* Deliberately last of the numbered sections: what to do only means
          something once the reader has seen what is wrong.

          ⚠️ Gated on the steps. A site that passes all three checks has nothing
          to do, which is a real and good outcome — but "05 WHAT TO DO NEXT"
          over a blank space reads as a page that failed to load. */}
      {steps.length > 0 && (
        <Section
          title="What to do next"
          lede="Start at the top — that’s the order we’d do them in."
        >
          <NextSteps steps={steps} />
        </Section>
      )}

      {/* The one lock, stated as what it is. Wording matches
          publish-workspace's own upgrade card so the same feature is not
          described two ways. */}
      <div className="mt-8">
        <UpgradeCard
          title="Ready-to-paste code for your website"
          /* ⚠️ llms.txt IS EXPLAINED IN THE SAME BREATH, not assumed. That is
             the rule pricing-teaser.tsx sets for exactly this word, and this
             card was naming the file without it. Also four sentences now
             instead of three long ones. */
          body={`Your answers, ready to paste onto your own site — so the mention goes to you. You also get the code that tells AI which business you are. And an llms.txt file: a plain-text summary written for AI to read. Pro reads every page, not just your home page. It watches 25 questions every week, so you can see whether any of it worked. $${PRO_PRICE.monthly} a month.`}
        />
      </div>
    </article>
  );
}

/**
 * One section of the report: a question, a line saying what you're looking at,
 * then the thing itself.
 *
 * Not a card. The card metaphor is the app's, and globals.css already argues
 * against it for anything meant to be read rather than worked in: "floating
 * panels with shadows print as grey smudges".
 *
 * ⚠️ IT WAS A RULED HEADING AND NOW IT IS A CHIP, SO WHITESPACE IS THE ONLY
 * SEPARATOR LEFT. Every hairline on this page is gone — under the score, under
 * the verdict, and between each section — which means `pt` here is doing the
 * work a border used to. Trim it and the sections run together; there is
 * nothing else holding them apart. The print stylesheet had already reached
 * this conclusion for the verdict block: "it leads, so it gets air and no rule
 * of its own".
 *
 * ⚠️ A CHIP THAT HUGS ITS TEXT, NEVER A FULL-WIDTH BAND — AND THE DIFFERENCE
 * IS RECORDED. overview-workspace.tsx went through a banner phase and came back
 * out of it: "the band made a working screen look like the marketing site, and
 * it was covering for the real problem underneath". Three things make this the
 * other case. It is inline, so it labels rather than divides. It is on a
 * conversion page somebody reads once, not a screen they work in. And it
 * REPLACES the structure the rules were providing rather than decorating on top
 * of structure that already worked. Widen it and that note applies again.
 *
 * ⚠️ bg-primary WITH text-white, NEVER THE GRADIENT AND NEVER accent. White on
 * #2563EB is 5.17:1. The gradient's cyan end and --color-accent are both
 * fill-only at roughly 1.9:1 and take navy text instead — see the note at the
 * top of globals.css and the VARIANTS comment in components/ui/button.tsx.
 * There is no other filled heading in this codebase; the house pattern is a
 * soft tint with dark ink. Keep this spelling to this one file.
 *
 * ⚠️ THE NUMBERS ARE GONE, AND THAT FIXED A BUG AS WELL AS A TONE. This
 * rendered `01` in mono beside a 15px UPPERCASE title — the look of a document
 * to be decoded rather than read, on a page whose reader runs a roofing
 * company. lib/audit/plain.ts has held that line for its own sentences since it
 * was written; this file's own strings were never held to it.
 *
 * The bug: every number was a hardcoded literal, but four of the five sections
 * are conditional. A site that passed all three readability checks rendered
 * 01, 03, 04 and no 02 — a gap in the one thing a numbered document cannot have
 * a gap in. Numbering by position would have fixed it; not numbering removes
 * the class of bug and reads better, so it did both.
 *
 * ⚠️ THE LEDE IS NOT DECORATION. It is the connective tissue: without it each
 * section starts cold with a table or a checklist and the reader has to work
 * out what they are looking at before they can read it. One sentence, and it
 * says what this is rather than repeating the heading.
 */
function Section({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pt-11">
      {/* 20px display, sentence case. Sits deliberately below the verdict's
          24/28px and above body copy, so the page has one clear outline.
          `inline-block` is what keeps it a chip: on a block h2 the fill would
          run the width of the column and become the band above.

          ⚠️ THE RADIUS AND THE TILT ARE BOTH BORROWED FROM THE WORDMARK, which
          is already a blue chip with white type — components/ui/wordmark.tsx's
          "Flo" tile. Matching its 10px makes these read as siblings of the
          logo rather than as a fifth radius; the theme's own scale starts at
          14px and would have been rounder than asked for.

          ⚠️ tilt-a (-1.1°), NOT the wordmark's -rotate-3. The utility's comment
          sets the rule — "kept under 1.5° so it reads as craft, not as a
          mistake" — and 3° is only forgiving because "Flo" is 40px wide. On a
          300px chip the same angle swings the far corner about 16px and reads
          as a mistake. Same idea, sized for the element.

          ⚠️ PADDING IS WHAT KEEPS THE ROTATED CORNERS CLEAR. The wordmark says
          it: the tilt "needs a touch of padding around the chip so the rotated
          corners never clip against neighbouring content". The lede's mt-3
          below clears the ~3px the rotation adds; tighten either and they
          touch. */}
      <h2 className="bg-primary tilt-a inline-block rounded-[10px] px-4 py-2.5 text-[1.25rem] tracking-tight text-white">
        {title}
      </h2>
      {lede && <p className="text-slate mt-3 text-[0.9375rem] leading-relaxed">{lede}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

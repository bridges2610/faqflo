'use client';

import { ScoreDial } from '@/components/ui/score-dial';
import { scoreBand } from '@/lib/audit/score';
import { PRO_PRICE } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { groupByQuestion, namedIn } from '@/lib/dashboard/questions';
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

  /* Both derived here rather than inside their components, so the sections that
     wrap them can be gated on whether there is anything to show. */
  const readability = report ? readabilityRows(report) : [];
  const steps = report ? nextStepsFor(report) : [];

  const today = new Date(report?.checkedAt ?? Date.now());
  const firstName = data.user.name.split(' ')[0] ?? '';

  return (
    <article>
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
        Welcome{firstName ? `, ${firstName}` : ''} — here&rsquo;s what AI can see about your
        business today.{' '}
        <span className="text-navy font-semibold">
          Our goal is simple: get you more customers.
        </span>
      </p>

      <header className="border-navy mt-4 border-b-2 pb-4">
        <p className="text-slate font-mono text-xs tracking-wide uppercase">{site.domain}</p>
        <h1 className="text-navy mt-1 text-[1.75rem] sm:text-[2rem]">AI visibility report</h1>
        <p className="text-slate mt-1 text-sm">
          {today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </header>

      {/* The score sits above the numbered sections: it is the report's
          subject, not one of its findings. */}
      {report && band && (
        <div className="border-line flex flex-col items-center gap-5 border-b py-6 sm:flex-row sm:items-center">
          <ScoreDial score={report.score} size="sm" />
          <div className="min-w-0">
            <h2 className="text-navy text-[1.375rem] font-extrabold tracking-tight">
              {band.label}
            </h2>
            <p className="text-slate mt-1.5 max-w-xl text-[0.9375rem] leading-relaxed">
              {band.summary}
            </p>
            <p className="text-slate mt-2 text-xs">
              Based on {report.scoredCount} checks of your home page.
            </p>
          </div>
        </div>
      )}

      {/*
        ⚠️ THE VERDICT IS FIRST AND STAYS FIRST. It is the sentence the whole
        page exists to earn, and it must never be hardcoded: "Right now, AI
        doesn't recommend your business" is right for an account nobody named
        and false for one named on two prompts out of three.
      */}
      {asked && (
        <Section n="01" title="The verdict">
          <h3 className="text-navy text-[1.375rem] font-extrabold tracking-tight sm:text-[1.5rem]">
            {namedCount === 0
              ? 'Right now, AI doesn’t recommend your business.'
              : namedCount === questionCount
                ? 'AI names you on every question we asked.'
                : `AI names you sometimes — on ${namedCount} of your ${questionCount} questions.`}
          </h3>
          <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">
            {namedCount === 0
              ? `We asked ${questionCount} questions a customer might ask. Your name came back on none of them.`
              : namedCount === questionCount
                ? `All ${questionCount} of them. Worth keeping an eye on — answers change as the engines re-read the web.`
                : `The other ${questionCount - namedCount} went to somebody else.`}
          </p>
        </Section>
      )}

      {/* Can AI read the site — the three checks a free audit scores, as boxes
          rather than as prose. This replaced a "Why" section that listed only
          the failures: a reader counting three boxes learns more than one
          reading two paragraphs about what went wrong.

          ⚠️ Gated on the rows, not on `report`. A heading with nothing under it
          claims a check we did not take. */}
      {readability.length > 0 && (
        <Section n={asked ? '02' : '01'} title="Can AI read your site?">
          <ReadabilityChecklist rows={readability} />
        </Section>
      )}

      {asked && proof && (
        <Section n="03" title="What AI said">
          <ProofCard proof={proof} siteName={site.name} />
        </Section>
      )}

      {/* ⚠️ THIS SUBSUMES TWO OLD SECTIONS. "Every question we asked" was a list
          of ratios and "Who's getting named instead" was a list of domains; the
          table carries both facts in one grid, which is the comparison somebody
          actually wants and one fewer thing to scroll past. */}
      {asked && (
        <Section n="04" title="Who ranks for your prompts">
          <PromptRanking tracking={tracking} />
        </Section>
      )}

      {!asked && (
        <Section n="02" title="Asking the engines about you">
          <p className="text-slate text-[0.9375rem] leading-relaxed">
            We’re putting your questions to ChatGPT, Perplexity and Google’s Gemini and recording
            who they name. It takes a few minutes — you can close this tab, it keeps running
            without you.
          </p>
        </Section>
      )}

      {/* Deliberately last of the numbered sections: what to do only means
          something once the reader has seen what is wrong.

          ⚠️ Gated on the steps. A site that passes all three checks has nothing
          to do, which is a real and good outcome — but "05 WHAT TO DO NEXT"
          over a blank space reads as a page that failed to load. */}
      {steps.length > 0 && (
        <Section n={asked ? '05' : '03'} title="What to do next">
          <NextSteps steps={steps} />
        </Section>
      )}

      {/* The one lock, stated as what it is. Wording matches
          publish-workspace's own upgrade card so the same feature is not
          described two ways. */}
      <div className="mt-8">
        <UpgradeCard
          title="Ready-to-paste code for your website"
          body={`Clean HTML with your answers in it, the behind-the-scenes code that tells AI who you are, and an llms.txt file — built per page and pasted onto your own site, so the mention goes to you. Pro also reads every page rather than just your home page, and watches 25 questions every week so you can see whether it worked. $${PRO_PRICE.monthly} a month.`}
        />
      </div>
    </article>
  );
}

/**
 * One numbered section of the report.
 *
 * A ruled heading and a number, not a card. The card metaphor is the app's, and
 * globals.css already argues against it for anything meant to be read rather
 * than worked in: "floating panels with shadows print as grey smudges", and
 * what a report wants is "a masthead, ruled sections and one column of prose".
 * That reasoning was scoped to print only because nothing on screen was a
 * report. This is.
 */
function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-line border-b py-7 last-of-type:border-b-0">
      <div className="flex items-baseline gap-3">
        <span className="text-slate font-mono text-xs tabular-nums">{n}</span>
        <h2 className="text-navy text-[0.9375rem] font-bold tracking-normal uppercase">{title}</h2>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

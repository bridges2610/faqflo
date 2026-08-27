'use client';

import { ScoreDial } from '@/components/ui/score-dial';
import { plainFor, isHiddenInSummary } from '@/lib/audit/plain';
import { scoreBand } from '@/lib/audit/score';
import { PRO_PRICE } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { groupByQuestion, namedIn } from '@/lib/dashboard/questions';
import { pickProof } from '@/lib/dashboard/proof';
import { FreeAnswers } from './free-answers';
import { Meter } from './meter';
import { PageHeader } from './page-header';
import { ProofCard } from './proof-card';
import { SiteForm } from './site-form';
import { StatRow } from './stat-row';
import { UpgradeCard } from './upgrade-card';

/*
  Home, for an account on the free plan.

  ⚠️ A SEPARATE COMPOSITION, NOT A GATED OverviewWorkspace, AND THE TWO PAGES
  HAVE DIFFERENT JOBS. Pro's Home is where a weekly email lands — somebody who
  already pays, arriving to see what moved. This is a conversion page: somebody
  who has had one check, ever, and is deciding whether any of this is real.
  Gating one screen into serving both would have meant every block carrying a
  branch, and the honest version of each is a different block.

  The blocks themselves are shared, which is what makes two compositions cheap:
  every one of them takes its data as props and none reads the store.

  ⚠️ THE ROUTE CHOOSES, NOT THIS FILE. app/(app)/dashboard/page.tsx reads the
  plan server-side and renders one of the two. Deciding here would mean reading
  it from the provider, which resolves the plan a frame late — and a paying
  customer would see this page flash before Pro's replaced it.

  Order is one argument, in sequence: how readable are you, does AI actually
  name you, here is the proof, here is every question, here is who is winning,
  here is why, here is what to do.
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

  /* Worst first — the rows worth acting on are the ones nobody named you for,
     and best-first buries them under the wins. */
  const rankedQuestions = [...groupsByQuestion].sort(
    (a, b) => namedIn(a) / a.checks.length - namedIn(b) / b.checks.length,
  );

  /* Everyone the engines drew on, us excluded — "who is getting named instead"
     is a question about them. Already sorted descending by the store. */
  const rivals = (tracking?.competitors ?? []).filter((c) => !c.isYou).slice(0, 5);
  const rivalTop = Math.max(...rivals.map((c) => c.citations), 1);

  /*
    Why, in the customer's words rather than the checklist's.

    plainFor() is the audit page's own plain-English rendering of a finding, so
    the two screens cannot describe the same problem differently.
    isHiddenInSummary() drops the locked citation finding and anything marked
    not-worth-saying. A free report scores three checks, so this is at most
    three rows and usually one or two.
  */
  const problems = (report?.pillars ?? [])
    .flatMap((p) => p.findings)
    .filter((f) => !isHiddenInSummary(f) && (f.status === 'fail' || f.status === 'warn'));

  const today = new Date(report?.checkedAt ?? Date.now());

  return (
    <article>
      {/*
        The masthead.

        ⚠️ NOT PageHeader, AND NOT A GREETING. Every other dashboard screen
        opens "Good morning, Beau" because it is a place you work. This is a
        document about a website — it gets the subject, what it is, and when it
        was taken, the way a report handed to somebody would.
      */}
      <header className="border-navy border-b-2 pb-4">
        <p className="font-mono text-xs tracking-wide uppercase text-slate">
          {site.domain}
        </p>
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

      {asked ? (
        <>
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

          {proof && (
            <Section n="02" title="What AI said">
              <ProofCard proof={proof} siteName={site.name} />
            </Section>
          )}

          <Section n="03" title="Every question we asked">
            <p className="text-slate text-sm">
              How many of the three engines named you, question by question.
            </p>
            <div className="divide-line mt-3 divide-y">
              {rankedQuestions.map((g) => (
                <StatRow
                  key={g.question}
                  label={g.question}
                  value={namedIn(g)}
                  /* That group's own length, never ENGINES.length — a question
                     one engine failed on was asked of fewer than three. */
                  total={g.checks.length}
                  tone={namedIn(g) > 0 ? 'primary' : 'line'}
                />
              ))}
            </div>
          </Section>

          <Section n="04" title="Who’s getting named instead">
            <p className="text-slate text-sm">
              Every source the engines drew on across your questions, most cited first.
            </p>
            {rivals.length > 0 ? (
              /* ⚠️ NOT StatRow. It prints "N of M", which is a ratio — and
                 these are counts. The bar is scaled to the biggest row so the
                 shape is comparable, but "4 of 4" would say angi.com was cited
                 every time it could have been, which is not what the number
                 means. Same treatment as share of voice on Results. */
              <ul className="divide-line mt-3 divide-y">
                {rivals.map((c) => (
                  <li key={c.domain} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-slate min-w-0 truncate font-mono text-sm">
                        {c.domain}
                      </span>
                      <span className="text-navy shrink-0 text-sm font-semibold tabular-nums">
                        {c.citations}
                      </span>
                    </div>
                    <Meter className="mt-2" value={(c.citations / rivalTop) * 100} animate />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate mt-3 text-sm">
                None of the answers we saw linked a source we could read.
              </p>
            )}
          </Section>
        </>
      ) : (
        <Section n="01" title="Asking the engines about you">
          <p className="text-slate text-[0.9375rem] leading-relaxed">
            We’re putting your questions to ChatGPT, Perplexity and Google’s Gemini and recording
            who they name. It takes a few minutes — you can close this tab, it keeps running
            without you.
          </p>
        </Section>
      )}

      {problems.length > 0 && (
        <Section n={asked ? '05' : '02'} title="Why">
          <ul className="divide-line divide-y">
            {problems.map((f) => (
              <li key={f.id} className="py-3.5 first:pt-0">
                <p className="text-navy text-[0.9375rem] font-semibold">{f.label}</p>
                <p className="text-slate mt-1 text-sm leading-relaxed">{plainFor(f)}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Answer-writing lives here rather than a link away: free accounts have
          one page, so a CTA pointing at /dashboard/faqs would be a dead end. */}
      <Section n={asked ? '06' : '03'} title="Your answers">
        <FreeAnswers />
      </Section>

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

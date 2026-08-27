'use client';

import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScoreDial } from '@/components/ui/score-dial';
import { plainFor, isHiddenInSummary } from '@/lib/audit/plain';
import { scoreBand } from '@/lib/audit/score';
import { isNamedAfterDomain } from '@/lib/dashboard/domain';
import { PRO_PRICE } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { groupByQuestion, namedIn } from '@/lib/dashboard/questions';
import { pickProof } from '@/lib/dashboard/proof';
import { setupSteps } from '@/lib/dashboard/worklist';
import { Meter } from './meter';
import { MicroLabel } from './micro-label';
import { PageHeader } from './page-header';
import { ProofCard } from './proof-card';
import { SectionTitle } from './section-title';
import { SetupChecklist } from './setup-checklist';
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
  const { site, sites, groups, faqs, questions, tracking, data, user } = useDashboard();

  const report = site?.lastAudit ?? null;
  const input = { report, site: site ?? null, user, groups, faqs, questions };
  const steps = setupSteps({ ...input, siteCount: sites.length });
  const firstName = data?.user.name.split(' ')[0] ?? '';

  /* Same short-circuit as Pro's: an account with no site has nothing to say
     about, and a page of empty shapes is worse than the checklist alone. */
  if (!site || !data) {
    return (
      <>
        <PageHeader
          title="Welcome to FaqFlo"
          description="Add your website and we’ll read it the way ChatGPT and Perplexity would, then tell you plainly what they can and can’t see."
        />
        <SetupChecklist steps={steps} />
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

  return (
    <>
      <PageHeader
        title={`${greetingFor(firstName)}`}
        description={
          isNamedAfterDomain(site.name, site.domain)
            ? site.domain
            : `${site.name} · ${site.domain}`
        }
      />

      {/* a) The score, and what it rests on. The count is load-bearing: a free
             report scores three checks of one page, and a bare 0–100 that does
             not say so invites comparison with a full audit's number. */}
      {report && band && (
        <Card className="mb-5 p-5 sm:p-7">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
            <ScoreDial score={report.score} size="sm" />
            <div className="min-w-0">
              <MicroLabel>Can AI read your site</MicroLabel>
              <h2 className="text-navy mt-1 text-[1.375rem] font-extrabold tracking-tight">
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
        </Card>
      )}

      {/* b) The verdict, and c) the proof. Both from the same run, so they
             appear and disappear together. */}
      {asked ? (
        <div className="mb-5 space-y-5">
          <Verdict named={namedCount} asked={questionCount} />
          {proof && <ProofCard proof={proof} siteName={site.name} />}
        </div>
      ) : (
        <Card tone="cloud" className="mb-5 p-5 sm:p-7">
          <SectionTitle>Asking the engines about you</SectionTitle>
          <p className="text-slate mt-1.5 text-[0.9375rem] leading-relaxed">
            We’re putting your questions to ChatGPT, Perplexity and Google’s Gemini and recording
            who they name. It takes a few minutes — you can close this tab, it keeps running
            without you.
          </p>
        </Card>
      )}

      {/* d) and e) — the proof generalised, then who won instead. */}
      {asked && (
        <div className="mb-5 grid gap-5 lg:grid-cols-2">
          <Card className="p-5 sm:p-7">
            <SectionTitle>Every question we asked</SectionTitle>
            <p className="text-slate mt-1 text-sm">
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
          </Card>

          <Card className="p-5 sm:p-7">
            <SectionTitle>Who’s getting named instead</SectionTitle>
            <p className="text-slate mt-1 text-sm">
              Every source the engines drew on across your questions, most cited first.
            </p>
            {rivals.length > 0 ? (
              /* ⚠️ NOT StatRow, AND THAT IS THE POINT. StatRow prints "N of M",
                 which is a ratio — and these are counts. The bar is scaled to
                 the biggest row so the shape is comparable, but "4 of 4" would
                 say angi.com was cited every time it could have been, which is
                 not what the number means. Same treatment as the share-of-voice
                 card on Results: the count alone, and a bar for the shape. */
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
              /* Sources are the only thing this card can be built from, and an
                 answer can cite none. Saying so beats an empty list. */
              <p className="text-slate mt-3 text-sm">
                None of the answers we saw linked a source we could read.
              </p>
            )}
          </Card>
        </div>
      )}

      {/* f) Why — the failing checks, two lines each, no table. */}
      {problems.length > 0 && (
        <Card className="mb-5 p-5 sm:p-7">
          <SectionTitle>Why</SectionTitle>
          <ul className="divide-line mt-3 divide-y">
            {problems.map((f) => (
              <li key={f.id} className="py-3.5 first:pt-0">
                <p className="text-navy text-[0.9375rem] font-semibold">{f.label}</p>
                <p className="text-slate mt-1 text-sm leading-relaxed">{plainFor(f)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* g) The fix, half-delivered. Writing answers is open on every plan now;
             what Pro buys is the code that puts them where AI reads them. */}
      <Card className="mb-5 p-5 sm:p-7">
        <SectionTitle>What to do about it</SectionTitle>
        <p className="text-slate mt-1.5 text-[0.9375rem] leading-relaxed">
          Answer the questions above in your own words, on your own site. We’ll write the first
          draft — you correct the details only you know.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <ButtonLink href="/dashboard/faqs" size="md" arrow>
            Write your answers
          </ButtonLink>
          <ButtonLink href="/dashboard/questions" size="md" variant="ghost">
            See the questions
          </ButtonLink>
        </div>
      </Card>

      {/* The one lock, stated as what it is. Wording matches publish-workspace's
          own upgrade card so the same feature is not described two ways. */}
      <UpgradeCard
        title="Ready-to-paste code for your website"
        body={`Clean HTML with your answers in it, the behind-the-scenes code that tells AI who you are, and an llms.txt file — built per page and pasted onto your own site, so the mention goes to you. Pro also reads every page rather than just your home page, and watches 25 questions every week so you can see whether it worked. $${PRO_PRICE.monthly} a month.`}
      />
    </>
  );
}

/**
 * The headline, from the data.
 *
 * ⚠️ NEVER HARDCODED. "Right now, AI doesn't recommend your business" is the
 * right sentence for an account nobody named, and a false one for an account
 * named on four questions out of five — which a free run produces often enough
 * that a fixed string would be wrong on a large share of this page's audience.
 */
function Verdict({ named, asked }: { named: number; asked: number }) {
  const all = named === asked && asked > 0;

  return (
    <Card className="p-5 sm:p-7">
      <h2 className="text-navy text-[1.5rem] font-extrabold tracking-tight sm:text-[1.75rem]">
        {named === 0
          ? 'Right now, AI doesn’t recommend your business.'
          : all
            ? 'AI names you on every question we asked.'
            : `AI names you sometimes — on ${named} of your ${asked} questions.`}
      </h2>
      <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">
        {named === 0
          ? `We asked ${asked} questions a customer might ask. Your name came back on none of them.`
          : all
            ? `All ${asked} of them. Worth keeping an eye on — answers change as the engines re-read the web.`
            : `The other ${asked - named} went to somebody else.`}
      </p>
    </Card>
  );
}

/** Time-of-day greeting — the same client-clock read Pro's Home documents. */
function greetingFor(firstName: string): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return firstName ? `${part}, ${firstName}` : part;
}

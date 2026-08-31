'use client';

import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sparkle } from '@/components/ui/doodle';
import { isNamedAfterDomain } from '@/lib/dashboard/domain';
import { useDashboard } from '@/lib/dashboard/provider';
import { canOfferDoneForYou, canTrack } from '@/lib/dashboard/plans';
import { timeAgo } from '@/lib/dashboard/format';
import { buildWorklist, setupSteps, standing } from '@/lib/dashboard/worklist';
import { DoneForYouCard } from './done-for-you-card';
import { HomePreviews } from './home-previews';
import { MicroLabel } from './micro-label';
import { FaqIcon, GlobeIcon, SearchIcon } from './nav-icons';
import { PageHeader } from './page-header';
import { SetupChecklist } from './setup-checklist';
import { StatRow } from './stat-row';
import { TaskRow } from './task-row';

/*
  The landing screen.

  This went through a gradient-banner phase and came back out of it. The band
  made a working screen look like the marketing site, and it was covering for
  the real problem underneath: six identical full-width rectangles stacked down
  the page. Density, alignment and real data are what make a tool look finished
  — not the brand's decoration carried across from pages meant to sell.

  So: a row of figures at the top, then a main column holding the one list that
  matters, then a rail of supporting context. Cohesion with the marketing site
  now comes only from shared tokens — same navy, same slate, same radii, same
  type scale.
*/

/**
 * Time-of-day greeting.
 *
 * ⚠️ Reads a client clock, which is normally a hydration bug — see the note in
 * lib/dashboard/format.ts about dates. Safe HERE specifically: AppShell renders
 * its skeleton until the store resolves in an effect, so this never renders
 * during SSR and there is no server output to disagree with. Moving it
 * somewhere that renders on the server would break that.
 */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/*
  bandDot() used to live here — a coloured dot beside the score, with a note
  explaining that its thresholds had to match scoreBand() so the colour and the
  word could never disagree.

  It went with the Visibility tile. The score card that replaced that tile leads
  with the band WORD as its heading and the band's own summary sentence
  underneath, so the verdict is now carried by language at full size. A dot
  beside it would be a third encoding of something already said twice — and the
  rule it was obeying (colour never alone) is satisfied more plainly without it.
*/

export function OverviewWorkspace() {
  const { site, sites, groups, faqs, questions, tracking, data, user } = useDashboard();

  /*
    ⚠️ THE PAST-RUNS FETCH HAS GONE WITH THE THINGS THAT READ IT.

    auditHistory() was called here for two consumers: a sparkline and a "since
    last time" delta, both of which lived in the score strip this screen no
    longer has. Keeping the request would have been a round trip per visit for
    a value nothing rendered.

    The rule it carried is worth remembering if a trend comes back: compare
    SAME-DEPTH runs only. A quick run scores 3 findings across 2 pillars and a
    full one ~40 across 6, so a line through both draws a cliff that never
    happened to the customer's website. lib/dashboard/store.ts's auditHistory
    still returns `depth` for exactly that reason.
  */

  const report = site?.lastAudit ?? null;
  const input = { report, site: site ?? null, user, groups, faqs, questions };
  const steps = setupSteps({ ...input, siteCount: sites.length });
  const firstName = data?.user.name.split(' ')[0] ?? '';

  /*
    A brand-new account gets no metric row.

    Four cells reading "—" is worse than no row at all: it fills the top of the
    screen with the shape of information while telling them nothing. The
    checklist is the whole page until there is something to measure.
  */
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

  const tasks = buildWorklist(input);
  const state = standing(input);


  const pagesWithFaq = report?.pages?.filter((p) => p.hasFaqSchema).length ?? 0;
  const setupDone = steps.every((s) => s.done);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        /* Most people type their domain into the name field, so printing both
           gave "letsroof.com · letsroof.com". */
        description={
          isNamedAfterDomain(site.name, site.domain)
            ? site.domain
            : `${site.name} · ${site.domain}`
        }
        action={
          <ButtonLink href="/dashboard/audit" variant="ghost" size="sm">
            {report ? 'Run a fresh check' : 'Check my site'}
          </ButtonLink>
        }
      />

      {/*
        ⚠️ FOUR WINDOWS, NOT A FIFTH DASHBOARD.

        A visibility panel, a score strip and three metric tiles stood here —
        a summary that counted things for itself and could therefore disagree
        with the pages it summarised. HomePreviews reads exactly what the four
        destinations read, and every card is a link: Home says where to go, it
        is not somewhere to stay.

        ⚠️ AND IT SITS BELOW THE WORKLIST NOW. Three rows of figures used to
        come first, which put "how am I doing" above "what do I do about it"
        on the one screen that exists to answer the second question.
      */}

      {/* Main column and rail. The rail only exists once there is room beside
          the list; below lg everything stacks in source order, which puts the
          work above the context. */}
      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
        <div className="space-y-5">
          {/* In the MAIN column, not the rail, and only while it is unfinished.
              For a new account this is the primary content — a rail would push
              it below the worklist on a phone, which is exactly the person who
              needs it first. */}
          {!setupDone && <SetupChecklist steps={steps} />}

          {tasks.length > 0 ? (
            <Card className="p-5 sm:p-7">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-[0.9375rem] font-bold tracking-normal">Do these next</h2>
                <p className="text-slate text-xs">Highest payoff for the least work, in order.</p>
              </div>
              <ul className="divide-line mt-2 divide-y">
                {tasks.map((task, i) => (
                  <TaskRow key={task.id} task={task} index={i} />
                ))}
              </ul>
            </Card>
          ) : (
            report && (
              <Card className="p-5 sm:p-7">
                {/* The one doodle in the dashboard, and it is here because this
                    is the one screen state that marks something achieved rather
                    than something to do. Everywhere else a hand-drawn mark
                    would be decoration on a working tool — nav-icons.tsx says
                    as much about why the loose marks are wrong for navigation.
                    Fill-only cyan, as globals.css requires: it sits beside the
                    words, never carrying them. */}
                <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold tracking-normal">
                  <Sparkle className="text-accent h-4 w-4 shrink-0" />
                  Nothing needs you right now
                </h2>
                <p className="text-slate mt-1.5 text-[0.9375rem] leading-relaxed">
                  Your answers are live and current, and the last check found nothing worth
                  fixing. Come back after your next round of changes to the site.
                </p>
              </Card>
            )
          )}
        </div>

        <div className="mt-5 space-y-5 lg:mt-0">
          {report && (
            <Card className="p-5">
              <MicroLabel>About this site</MicroLabel>

              {/* ⚠️ THE RATIOS GET BARS; THE FACTS DO NOT.

                  These rows used to be one undifferentiated list of
                  right-aligned text, which made "1 of 4" and "Roofing
                  contractor" look like the same kind of statement. The
                  proportions now read as proportions; industry and service area
                  are facts with no denominator, and a bar under either would be
                  decoration pretending to be data.

                  ⚠️ "AI citations" USED TO BE HERE AND DELIBERATELY IS NOT.
                  It lives in the visibility panel at the top of the page now.
                  Two reasons beyond tidiness: a citation count is not a fact
                  about the crawl, and this whole card is gated on `report` —
                  so an account that had been checked but never audited saw
                  nothing at all from Results on this screen. */}
              <div className="divide-line mt-2 divide-y">
                <StatRow
                  label="Pages read"
                  value={report.crawled.length}
                  total={Math.max(report.discovered, report.crawled.length)}
                />
                <StatRow
                  label="With FAQ markup"
                  value={pagesWithFaq}
                  total={report.pages ? report.pages.length : null}
                  note="—"
                />
              </div>

              {/* "Not set", not "unknown": on a site that has never run a full
                  audit we did not look and fail — there was nothing to look at.
                  "Unknown" implied a dead end, which is what this row used to
                  be. */}
              <dl className="divide-line border-line mt-1 divide-y border-t text-sm">
                <Row term="Industry" value={site.industry ?? 'Not set'} />
                <Row term="Service area" value={site.location ?? 'Not set'} />
              </dl>

              {/* ⚠️ Where these two values came from changes how much to trust
                  them, so the UI says which it is — `schema` is the business's
                  own markup, `inferred` is a model's reading of the homepage.

                  Every state except `manual` links out, including the null one.
                  That was the bug: the link used to appear only for `inferred`,
                  so a site that had never had a content plan built showed
                  "unknown" with nowhere to go — and the editor it pointed at
                  was itself unreachable until a plan existed.

                  It now points at Sites, which holds the only editor. Keeping
                  one editor is what keeps the `manual` promise — once a
                  customer corrects us, no later run overwrites it — in one
                  place rather than several. */}
              {site.profileSource !== 'manual' && (
                <p className="text-slate mt-3 text-xs leading-relaxed">
                  {site.profileSource === 'inferred'
                    ? 'Industry and area were worked out from your homepage. '
                    : site.profileSource === 'schema'
                      ? "Read from your site's own markup. "
                      : 'Not set yet — adding them makes your content plan and questions specific to your trade. '}
                  <Link
                    href="/dashboard/sites"
                    className="text-primary hover:text-primary-hover font-semibold"
                  >
                    {site.profileSource === null ? 'Add them →' : 'Edit →'}
                  </Link>
                </p>
              )}
            </Card>
          )}

          <Card tone="cloud" className="p-5">
            <MicroLabel>Learn</MicroLabel>
            <ul className="mt-3 space-y-3.5">
              <LearnLink
                href="/blog/what-is-aeo"
                title="What AEO is, in plain English"
                body="Why being the answer replaced being ranked."
              />
              <LearnLink
                href="/seo-guide"
                title="SEO in the age of AI answers"
                body="The fundamentals that still matter, and why."
              />
            </ul>
            <p className="text-slate border-line mt-4 border-t pt-3 text-xs leading-relaxed">
              Citation tracking — putting your questions to the engines and recording who they
              name — runs once on Free, and every week on Pro without you having to do anything.
              You can see the results on the Results page.
            </p>
          </Card>

          {/*
            Below Learn, at the bottom of the rail.

            Last on purpose: the rail is supporting context, and this is the
            only thing in it asking for money. Above the Learn card it would be
            the second thing on the screen after the worklist, which is a
            harder sell than the page has earned by then.

            `tone="white"` because Learn directly above is cloud — two cloud
            cards in a row merge into one block. `compact` because the rail is
            20rem and the card's default padding is a viewport breakpoint that
            would resolve to p-7 in here. Copy is shorter than the default for
            the same reason: this column is a third the width of the Publish
            page the default wording was written for.

            Pro only. `user` is null for the provider's first frame and
            isPro(null) is false, so the card stays out rather than appearing
            and then vanishing once the plan loads.
          */}
          {canOfferDoneForYou(user) && (
            <DoneForYouCard
              tone="white"
              compact
              body="I’ll set the whole thing up by hand and get it live on your site."
            />
          )}
        </div>
      </div>

      <div className="mt-6">
        <HomePreviews report={report} />
      </div>

      {sites.length > 1 && (
        <p className="text-slate mt-6 text-center text-xs">
          {sites.length} sites on this account — switch at the top of the page.
        </p>
      )}
    </>
  );
}

/** One term and its value in the site brief. */
function Row({ term, value }: { term: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-slate">{term}</dt>
      <dd className="text-navy min-w-0 truncate text-right font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** A way into the guides — the only thing in the dashboard that links to them. */
function LearnLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <li>
      <Link href={href} className="group block">
        <p className="text-navy group-hover:text-primary text-sm font-semibold transition-colors duration-150">
          {title} →
        </p>
        <p className="text-slate mt-0.5 text-xs leading-relaxed">{body}</p>
      </Link>
    </li>
  );
}

'use client';

import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { PostMeta } from '@/lib/blog/posts';
import { useDashboard } from '@/lib/dashboard/provider';
import { canOfferDoneForYou, isPro, trackingPlanFor, TRACKING_PLANS } from '@/lib/dashboard/plans';
import { buildWorklist, setupSteps } from '@/lib/dashboard/worklist';
import { DoneForYouCard } from './done-for-you-card';
import { CitationChart } from './citation-chart';
import { HomeReading } from './home-reading';
import { HomeRivals } from './home-rivals';
import { HomeSnapshot } from './home-snapshot';
import { HomeWorklist } from './home-worklist';
import { LockedPreview } from './locked-preview';
import { SectionTitle } from './section-title';
import { FaqIcon, TickIcon } from './nav-icons';
import { PageHeader } from './page-header';
import { SetupChecklist } from './setup-checklist';

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
/**
 * The time of day, with a mark to match it.
 *
 * ⚠️ new Date() IS SAFE HERE AND WOULD NOT BE HIGHER UP. A clock read during
 * render is the classic hydration mismatch — the server is on UTC and the
 * reader is not. It cannot bite here because this branch never renders on the
 * server: `data` is null until the provider resolves, and the !site || !data
 * branch above returns the welcome screen instead. Move this above that guard
 * and it becomes a real bug.
 */
function greeting(): { text: string; emoji: string } {
  const hour = new Date().getHours();
  /* ⚠️ 😎, NOT A SUN WEARING SUNGLASSES — there is no such emoji in Unicode.
     The nearest two are this one, which has the sunglasses, and 🌞 (sun with
     face), which has the sun. Swapping between them is a one-character change. */
  if (hour < 12) return { text: 'Good morning', emoji: '😎' };
  if (hour < 18) return { text: 'Good afternoon', emoji: '👋' };
  return { text: 'Good evening', emoji: '🌙' };
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

export function OverviewWorkspace({ posts = [] }: { posts?: PostMeta[] }) {
  /* ⚠️ NO runAudit/auditBusy/auditError — this screen starts no crawl. They are
     still on the provider and still read by audit-workspace.tsx, which is the
     only place a check is started from now. */
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
  const hello = greeting();

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


  const setupDone = steps.every((s) => s.done);

  /* Both copied from the AI Mentions page rather than derived a second way —
     the chart is the same chart and must describe the same window. */
  const daily = tracking?.daily ?? [];
  /* ⚠️ `unscheduled`, not `oneShot` — it means "no automatic weekly re-check",
     never "only one check ever". See the fuller note in tracking-workspace.tsx,
     which this line is copied from and where the old name went wrong. */
  const unscheduled = trackingPlanFor(user).schedule === 'once';

  /* The questions actually put to the engines for this account, deduplicated —
     `latest` holds one row per question AND engine. */
  const watched = [...new Set((tracking?.latest ?? []).map((c) => c.question))];
  const moreWithPro = Math.max(0, TRACKING_PLANS.pro.promptCap - watched.length);

  return (
    <>
      <PageHeader
        /*
          ⚠️ THE SECOND LINE SAYS WHAT THE PRODUCT IS FOR. It read
          "Letsroof · letsroof.com" — a name and a domain, on the screen a
          customer lands on. It said nothing about why they are here, which is
          the one thing a home screen owes somebody who has just arrived.

          ⚠️ THE THREE ENGINES BY NAME, AND ONLY THOSE THREE. They are what
          ENGINES lists and what this product actually queries. The house rule
          against naming Google AI Overviews on a product surface still holds.
        */
        title={
          <>
            {hello.text}, {firstName}{' '}
            {/* ⚠️ aria-hidden, AND THE SENTENCE IS WHOLE WITHOUT IT. A screen
                reader announcing "sun" after somebody's name is noise, not
                warmth — the greeting already says the time of day in words. */}
            <span aria-hidden="true">{hello.emoji}</span>
          </>
        }
        description={`This is how ${site.domain} looks to ChatGPT, Perplexity and Gemini — and what to change so they name you when someone asks.`}
        /* ⚠️ NO ACTION HERE, AND SCANNING LIVES ON THE AUDIT PAGE ALONE. A
           "Run a fresh check" button sat in this slot and called runAudit
           directly. Two entry points to one crawl meant two places to keep in
           step — this one had to carry its own copy of the busy state and its
           own refusal line — for a control the Audit page already offers twice.

           ⚠️ IT WAS NOT THE ONLY WAY IN FOR A NEW ACCOUNT, WHICH IS WHY IT COULD
           GO. setupSteps() renders a `run-audit` step pointing at
           /dashboard/audit for exactly as long as site.lastAudit is missing, and
           the checklist below is shown in both branches of this component. The
           button was a second door to a room that already had one. */
      />

      {/* The progress line that used to sit here is a toast now — see
          components/dashboard/audit-notice.tsx. Under the greeting it was a
          second slate paragraph directly below the first, and it scrolled away
          on a page long enough that a minute-long check outlives the view.

          ⚠️ THE auditError LINE THAT FOLLOWED IT HAS GONE WITH THE BUTTON. It
          existed to catch AUDIT_FULL_RATE_LIMIT refusals "where the button is",
          and this page no longer starts a check — an error about a crawl nobody
          asked for here reads as a fault in the page you are looking at. The
          Audit page still shows its own. */}

      {/*
        ⚠️ THE SETUP CHECKLIST OUTRANKS EVERYTHING, AND ONLY WHILE UNFINISHED.
        A score dial above these four steps would put a measurement of an empty
        account above the thing that fills it.
      */}
      {/* ⚠️ THE COMPACT ONE HERE, THE FULL CARD ONLY WITH NO SITE. This account
          already has figures below; a four-step card ahead of them delays the
          thing they opened the page for. The branch above — no site at all —
          keeps the full version, where the steps are the whole page. */}
      {!setupDone && (
        <div className="mb-5">
          <SetupChecklist steps={steps} compact />
        </div>
      )}

      {/*
        ⚠️ THE SNAPSHOT ROW IS THE POINT OF THE PAGE, AND IT IS FIRST.

        Home led with a score card beside the worklist. Honest, and it did not
        look like a dashboard: the score sat alone on the left while AI
        mentions, share of voice and answer counts were buried in preview cards
        below the fold — and the worklist was three times the height of the
        thing next to it, so the left column was mostly white space.

        The order now answers the two questions in the order they get asked:
        where do I stand (the row), is it moving (the chart), what do I do (the
        list). Each block spans the full width of whatever it needs, so nothing
        tall is ever parked beside something short.
      */}
      <HomeSnapshot report={report} />

      {/*
        ⚠️ items-stretch, NOT items-start, AND THAT IS THE FIX BEAU ASKED FOR.
        The old page put a 500px card beside a 1,200px one and the difference
        read as a hole. These two are much closer — a chart against a short
        list — but they are still not equal, and a ragged bottom edge is what
        looks unfinished. Stretched, the row reads as one band; the list simply
        breathes more. The tall thing (the worklist) now spans the full width
        below, so nothing is ever parked beside it.

        ⚠️ AND NO CHART WITHOUT DATA. CitationChart will draw empty axes given
        an empty array — Math.max(1, ...[]) is 1 and its last point is
        optionally chained — so the guard lives here rather than in a component
        that is right to assume it was given something to plot.
      */}
      {daily.length > 0 && (
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-stretch">
          {/* The span string is copied from the AI Mentions page rather than
              written again — its own docstring records how this line has been
              wrong before, describing five checkpoints spread over three months
              as "the last 5 days". */}
          <CitationChart
            daily={daily}
            span={unscheduled ? 'from your checks so far' : 'over the last 30 days'}
          />
          <HomeRivals />
        </div>
      )}

      {/*
        ⚠️ FREE ONLY, AND IT SHOWS THE REAL QUESTIONS FIRST. What a free account
        is watching is genuinely theirs — three prompts, put to three engines,
        with real answers stored. The blurred bars underneath are the SHAPE of
        the rest of Pro's list and carry nothing at all; see locked-preview.tsx
        for why nothing is the only safe thing to put behind a blur.

        ⚠️ THE REMAINDER IS ARITHMETIC ON THE PLAN, NOT A TYPED NUMBER. Pro's
        promptCap minus what they actually hold — an account may have fewer than
        the free cap, and hardcoding "22" would be wrong the moment either cap
        moves.
      */}
      {!isPro(user) && watched.length > 0 && moreWithPro > 0 && (
        <Card className="mt-5 p-5 sm:p-6">
          {/* ⚠️ SectionTitle, LIKE EVERY OTHER CARD ON THIS PAGE. This was a bare
              <h2 at text-[1.0625rem] with no weight — larger and lighter than
              the headings either side of it, so the one card a free account
              sees that a Pro account does not was also the one card in a
              different typeface. Every sibling here is
              text-[0.9375rem] font-bold tracking-normal, which is what
              SectionTitle renders; home-worklist.tsx writes those same classes
              by hand rather than inventing its own. */}
          <SectionTitle icon={<FaqIcon className="h-4 w-4" />} tint="bg-cloud text-slate">
            Questions we&rsquo;re watching for you
          </SectionTitle>
          <p className="text-slate mt-1 text-sm">
            We put these to ChatGPT, Perplexity and Gemini and saved what they said.
          </p>

          <LockedPreview
            bars={3}
            label={`${moreWithPro} more questions with Pro, re-checked every week`}
          >
            <ul className="mt-4 space-y-2">
              {watched.map((q) => (
                <li key={q} className="text-navy flex items-start gap-2 text-sm leading-snug">
                  <TickIcon className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                  {q}
                </li>
              ))}
            </ul>
          </LockedPreview>

          <div className="mt-4">
            <ButtonLink href="/dashboard/plan" size="sm" variant="ghost">
              See what Pro includes
            </ButtonLink>
          </div>
        </Card>
      )}

      {/* Full width, because it is the tallest thing on the page and nothing
          should have to sit beside it. */}
      <div className="mt-5">
        <HomeWorklist report={report} tasks={tasks} />
      </div>

      {/*
        ⚠️ THIS LINE IS THE SURVIVING HALF OF THE "About this site" CARD.

        That card went — pages read, industry and service area all read better
        on the redesigned Audit, in context. But it also carried the ONLY prompt
        anywhere in the dashboard to set industry and service area, and both
        fields are sent to the model by Content and by question discovery.

        `manual` gets nothing: once a customer has corrected us, asking again is
        noise.
      */}
      {site.profileSource !== 'manual' && (
        <p className="text-slate mt-4 text-sm leading-relaxed">
          {site.profileSource === 'inferred'
            ? `We worked out that you're a ${(site.industry ?? 'business').toLowerCase()} from your homepage. `
            : site.profileSource === 'schema'
              ? `Your trade and service area were read from your site's own markup. `
              : 'Your trade and service area aren’t set. Adding them makes your questions and content plan specific to what you do. '}
          <Link
            href="/dashboard/sites"
            className="text-primary hover:text-primary-hover font-semibold"
          >
            {site.profileSource === null ? 'Add them →' : 'Change it →'}
          </Link>
        </p>
      )}

      {/* ⚠️ "Learn" USED TO SIT HERE with two hand-picked links. It has become
          HomeReading — the three most recent posts, which keep themselves
          current — and that component carries /seo-guide in its footer because
          the card it replaced was the only route to it in the product. */}
      <HomeReading posts={posts} />

      {/* Last, and that is where the upsell belongs: it is the only thing on
          this page asking for money, and the page has to earn it first. */}
      {canOfferDoneForYou(user) && (
        <div className="mt-6">
          <DoneForYouCard
            tone="cloud"
            compact
            body="I’ll set the whole thing up by hand and get it live on your site."
          />
        </div>
      )}

      {sites.length > 1 && (
        <p className="text-slate mt-6 text-center text-xs">
          {sites.length} sites on this account — switch at the top of the page.
        </p>
      )}
    </>
  );
}

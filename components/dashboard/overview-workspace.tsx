'use client';

import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import type { PostMeta } from '@/lib/blog/posts';
import { useDashboard } from '@/lib/dashboard/provider';
import { canOfferDoneForYou, trackingPlanFor } from '@/lib/dashboard/plans';
import { buildWorklist, setupSteps } from '@/lib/dashboard/worklist';
import { DoneForYouCard } from './done-for-you-card';
import { CitationChart } from './citation-chart';
import { HomeReading } from './home-reading';
import { HomeRivals } from './home-rivals';
import { HomeSnapshot } from './home-snapshot';
import { HomeWorklist } from './home-worklist';
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
  const oneShot = trackingPlanFor(user).schedule === 'once';

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
        action={
          <ButtonLink href="/dashboard/audit" variant="ghost" size="sm">
            {report ? 'Run a fresh check' : 'Check my site'}
          </ButtonLink>
        }
      />

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
            span={oneShot ? 'from your one check' : 'over the last 30 days'}
          />
          <HomeRivals />
        </div>
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

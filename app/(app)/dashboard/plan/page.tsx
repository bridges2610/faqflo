import type { Metadata } from 'next';
import { PageHeader } from '@/components/dashboard/page-header';
import { PlanWorkspace } from '@/components/dashboard/plan-workspace';

export const metadata: Metadata = { title: 'Your plan' };

/*
  Where every locked feature in the dashboard points, and where the pricing
  page's "Start Pro" lands.

  Sits under /dashboard so proxy.ts already treats it as protected: an arrival
  who is not signed in is bounced to /sign-up and comes straight back here
  afterwards. That is the whole flow the pricing CTA promises.

  ⚠️ THIS PAGE ONLY READS, and the writing half is a POST the client sends. A
  <Link> to this page is prefetched, and a server component cannot tell a
  prefetch from a visit — a checkout session created on GET would be created
  every time somebody's mouse crossed an upgrade button. Same rule the old
  /dashboard/checkout/start followed, and the reason it had a client half too.

  ⚠️ THE YEAR IS COMPUTED HERE AND NEVER LEAVES THIS COMPONENT. free-home.tsx
  refuses to print a year at all and gives the reason: it is a client component,
  so new Date() runs on the server and again in the browser, which is "a
  hydration mismatch waiting for New Year's Eve". That objection is about WHERE
  the call happens, not about the word.

  It used to be computed here and passed down as a prop, which was safe but
  still meant a client component had a year to render. It now goes straight into
  the header this server component already renders, and PlanWorkspace takes no
  year at all — the concern is retired rather than managed. The route is behind
  requireUser() so it is dynamic rather than prerendered, which means the value
  is right at request time rather than frozen at the last deploy: better than
  the marketing home page, which stamps its year at build.

  Do not push this back down into PlanWorkspace.
*/
export default function PlanPage() {
  return (
    <>
      {/*
        ⚠️ ONE HEADLINE FOR BOTH PLANS, AND THAT IS WHY IT NAMES AN OUTCOME
        RATHER THAN AN ACTION. A Pro subscriber opens this same route to change
        their card, so "Upgrade to…" would tell a paying customer to buy what
        they already have. "Get more business in {year}" is true either way: one
        reader is trying to start, the other is checking it is still happening.
        Branching by plan was considered and dropped — it would put a second
        source of truth about who the reader is up here, when PlanWorkspace
        already branches one level down.

        ⚠️ THE TITLE AND THE SUBTITLE SAY DIFFERENT THINGS, AND THEY USED NOT
        TO. This read "Get AI to name your business" over "Plans built to get
        you more customers in {year}", above a section headed "Get cited where
        your customers are asking" — three tellings of one idea before the
        reader reached a price. The title now carries the outcome, the subtitle
        carries the mechanism, and the engine row below carries no argument at
        all. Adding a sell to any one of them puts the repetition back.

        ⚠️ `description` IS TYPED string, NOT ReactNode. No link and no <strong>
        in it without widening a prop every dashboard page shares — which is
        also why the year is interpolated into a plain string here.
      */}
      <PageHeader
        centered
        title={`Get more business in ${new Date().getFullYear()}`}
        description="Upgrade so AI names you when customers go looking."
      />
      <PlanWorkspace />
    </>
  );
}

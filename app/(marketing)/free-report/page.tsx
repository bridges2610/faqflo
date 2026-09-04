import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Underline } from '@/components/ui/doodle';
import { StartForm } from '@/components/marketing/start-form';

/*
  The free report, on a URL of its own.

  ⚠️ IT STARTS AN ACCOUNT NOW, AND IT USED TO BE THE OPPOSITE. This page rendered
  VisibilityAudit: an anonymous check that POSTed to /api/audit, drew the result
  inline, and only then offered a link to /dashboard/start. The hero handed its
  domain straight to /dashboard/start instead, which makes a free account and
  scans — and the two were documented as a deliberate split, with the hero
  saying "Check my site" belonged to the free tool "which needs no account at
  all. This button creates one."

  Both create one now. That is why:
    - the meta below no longer says "no signup";
    - final-cta.tsx, done-for-you, site-faq.tsx and about all stopped promising
      no account for the VISIBILITY CHECK specifically;
    - components/marketing/visibility-audit.tsx is gone.

  ⚠️ WHAT DID NOT CHANGE, AND MUST NOT BE "TIDIED" TO MATCH. /api/generate is
  still anonymous, so the home page's `#try` generator and its "Free · No
  signup" badge are still true. And /api/audit itself is untouched — it looks
  orphaned once this page stops calling it, but lib/dashboard/provider.tsx still
  uses it and eight comments across other routes cite it as the reference
  implementation. Only the anonymous `quick` path lost its caller here.

  ⚠️ THE HEADING IS THE PAGE'S ONLY <h1>. It was an <h2> when this was a band on
  the home page, and it lived inside VisibilityAudit until that component was
  deleted; it is inline here so nothing can move it back under another heading
  without somebody noticing.
*/
export const metadata: Metadata = {
  title: 'Free AI visibility report',
  description:
    'See what AI sees on your site. We fetch your page the way an AI crawler does — no JavaScript — and tell you what it can and cannot read. Free, no card.',
  alternates: { canonical: '/free-report' },
};

export default function FreeReportPage() {
  return (
    <section className="px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-2xl text-center">
        {/* ⚠️ ABOUT THE CARD, NOT THE SIGNUP — the claim this page can still
            make. It was `Free · No signup`, which stopped being true the moment
            the form below started creating an account. Free and card-free are
            both still exactly true.

            ⚠️ THE HOME PAGE'S `Free · No signup` PILL IS NOT A COPY OF THIS ONE
            AND MUST NOT BE "MADE CONSISTENT". It sits on the `#try` generator,
            which runs on /api/generate with no auth at all — so it is still
            accurate there and would become a lie if it were changed to match. */}
        <Badge tone="success">Free · No cc required</Badge>

        <h1 className="mt-5 text-[2rem] text-balance sm:text-[2.5rem]">
          See what AI{' '}
          <span className="relative inline-block">
            sees
            <Underline className="text-accent absolute -bottom-2 left-0 h-3.5 w-full" />
          </span>{' '}
          on your site
        </h1>

        <p className="text-slate mt-4 text-[1.0625rem] leading-relaxed">
          Enter your address. We&rsquo;ll fetch it the way an AI crawler does — no JavaScript — and
          tell you what it can and can&rsquo;t see. Your report lands in a free account, so it is
          still there when you come back.
        </p>

        {/* ⚠️ WIDER AND DIFFERENTLY LABELLED THAN THE HERO'S, AND BOTH ARE
            PROPS RATHER THAN A SECOND COMPONENT. max-w-xl is the width this
            page's form had before it was replaced (it was `mx-auto mt-8 flex
            max-w-xl` in the deleted visibility-audit.tsx), and the column here
            is max-w-2xl, so there is room the hero does not have. "Analyze Now"
            because this page is about running the check; the hero is a headline
            about the product.

            mx-auto because the column is centred — the hero renders the same
            component left-aligned. text-left keeps the placeholder from
            inheriting the centring. */}
        <StartForm
          id="free-report-domain"
          label="Analyze Now"
          width="max-w-xl"
          className="mx-auto mt-8 text-left"
        />
      </div>
    </section>
  );
}

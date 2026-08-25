import { FaqGenerator } from '@/components/generator/faq-generator';
import { FinalCta } from '@/components/marketing/final-cta';
import { Hero } from '@/components/marketing/hero';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { PricingTeaser } from '@/components/marketing/pricing-teaser';
import { ProductShots } from '@/components/marketing/product-shots';
import { SiteFaq } from '@/components/marketing/site-faq';
import { Stats } from '@/components/marketing/stats';
import { WhatIsAeo } from '@/components/marketing/what-is-aeo';
import { WhoAndFeatures } from '@/components/marketing/who-and-features';
import { WhyFaqs } from '@/components/marketing/why-faqs';
import { Badge } from '@/components/ui/badge';
import { jsonLd, SITE_NAME, SITE_URL } from '@/lib/site';
import type { Metadata } from 'next';

/*
  ⚠️ THIS PAGE HAD NO `metadata` EXPORT AT ALL.

  It is the most valuable URL on the site and it was the only marketing page
  with no canonical — every other one declares its own. It also had no title or
  description of its own, silently inheriting the root layout's, which meant the
  homepage could never say anything the fallback did not.

  Our own `canonical` check warns on a missing canonical tag, and `title-unique`
  FAILS outright — not warns — when two crawled pages share a title. Inheriting
  the default is precisely how that happens.
*/
export const metadata: Metadata = {
  title: 'Get your business cited by AI',
  description:
    'Free check of whether AI assistants can read your site. Publish answers they can quote on your own domain, then see if ChatGPT, Perplexity and Gemini cite you.',
  alternates: { canonical: '/' },
};

/*
  Who this site is, in the form an assistant can repeat.

  ⚠️ THE HIGHEST-VALUE CHECK IN OUR OWN AUDIT, AND WE WERE FAILING IT.

  `org-schema` in lib/audit/checks/identity.ts looks for a JSON-LD node typed
  Organization or LocalBusiness carrying a non-empty `name` AND `url`. It is
  weighted at roughly 4.55 points of the 100 — more than any other single
  finding — because it is what lets an assistant work out who a page is about
  and who to credit. FaqFlo had no such node anywhere: the only Organization on
  the site was nested as `publisher` inside BlogPosting, with a name and no url,
  which is the shape that only ever earns a warn.

  ⚠️ `sameAs` is deliberately absent. That check wants two or more profile URLs
  and is worth another ~3 points, but inventing social accounts to satisfy a
  scoring rule would put fabricated links in front of every crawler that reads
  this page. It stays off until there are real profiles to name — a failing
  check we can explain beats a passing one we made up.
*/
const ORGANIZATION = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  // Real file in public/logo. A logo URL that 404s is worse than none: it
  // invites a fetch and hands back nothing.
  logo: `${SITE_URL}/logo/FAQFlo.png`,
  description:
    'FaqFlo checks whether AI assistants can read your site, helps publish answers they can quote, and tracks whether ChatGPT, Perplexity and Gemini cite you.',
};

const WEBSITE = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
  publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
};

export default function Home() {
  return (
    <>
      {/* jsonLd() escapes `<` so a closing script tag inside any string cannot
          break out of the element — see the note in lib/site.ts. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd([ORGANIZATION, WEBSITE]) }}
      />

      <Hero />

      {/* The audit band that used to sit here now lives at /free-report.

          It was the lead hook when the hero only had two buttons. The hero now
          takes a domain and starts a real check with it, so keeping a second
          form asking for the same thing directly underneath meant two ways to
          begin, four hundred pixels apart, with different outcomes. */}
      <Stats />
      <WhyFaqs />

      {/* Sits on the page's cloud background rather than white: WhyFaqs above it
          is white, and two white sections back to back lose their boundary. It
          also gives the generator's white cards something to stand on. */}
      <section id="try" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <Badge tone="success">Free · No signup</Badge>
            <h2 className="mt-5 text-[2rem] text-balance sm:text-[2.5rem]">
              See what your answers could look like
            </h2>
            <p className="text-slate mt-4 text-[1.0625rem] leading-relaxed">
              Write a description or paste a URL
            </p>
          </div>

          <FaqGenerator />
        </div>
      </section>

      <HowItWorks />
      {/* Straight after the loop that describes the work, and showing the same
          four screens in the same order — the visitor reads "audit, answer,
          publish, track" and then sees each one. White between HowItWorks
          (tint-cyan) and WhatIsAeo (cloud), which is the only seam on this page
          where a white section touches neither of its own kind. */}
      <ProductShots />
      <WhatIsAeo />
      {/* Answers "is this for me?" on white, between the cloud AEO section and
          the tint-blue pricing band — and immediately before the price. */}
      <WhoAndFeatures />
      <PricingTeaser />
      <FinalCta />
      {/* FAQ sits last, as asked. The more usual order puts it before the CTA
          so the page closes on the call to action — easy to swap if wanted. */}
      <SiteFaq />
    </>
  );
}

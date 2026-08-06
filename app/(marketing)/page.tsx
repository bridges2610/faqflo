import { FaqGenerator } from '@/components/generator/faq-generator';
import { FinalCta } from '@/components/marketing/final-cta';
import { Hero } from '@/components/marketing/hero';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { PricingTeaser } from '@/components/marketing/pricing-teaser';
import { SiteFaq } from '@/components/marketing/site-faq';
import { Stats } from '@/components/marketing/stats';
import { VisibilityAudit } from '@/components/marketing/visibility-audit';
import { WhatIsAeo } from '@/components/marketing/what-is-aeo';
import { WhoAndFeatures } from '@/components/marketing/who-and-features';
import { WhyFaqs } from '@/components/marketing/why-faqs';
import { Badge } from '@/components/ui/badge';

export default function Home() {
  return (
    <>
      <Hero />

      {/* The lead hook goes directly under the hero: the headline makes a claim
          about what AI can see, and this is where someone finds out whether it's
          true of them. Everything else on the page argues; this measures. */}
      <VisibilityAudit />

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

import { FaqGenerator } from '@/components/generator/faq-generator';
import { FinalCta } from '@/components/marketing/final-cta';
import { Hero } from '@/components/marketing/hero';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { PricingTeaser } from '@/components/marketing/pricing-teaser';
import { SiteFaq } from '@/components/marketing/site-faq';
import { Stats } from '@/components/marketing/stats';
import { WhatIsAeo } from '@/components/marketing/what-is-aeo';
import { WhyFaqs } from '@/components/marketing/why-faqs';
import { Badge } from '@/components/ui/badge';

export default function Home() {
  return (
    <>
      <Hero />
      <WhyFaqs />
      <Stats />

      {/* Sits on the page's cloud background rather than white: WhyFaqs above it
          is white, and two white sections back to back lose their boundary. It
          also gives the generator's white cards something to stand on. */}
      <section id="try" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <Badge tone="success">Free · No signup</Badge>
            <h2 className="mt-5 text-[2rem] text-balance sm:text-[2.5rem]">
              Try it right now
            </h2>
            <p className="text-slate mt-4 text-[1.0625rem] leading-relaxed">
              Paste a page from your site and watch FaqFlo turn it into questions your customers
              actually ask.
            </p>
          </div>

          <FaqGenerator />
        </div>
      </section>

      <HowItWorks />
      <WhatIsAeo />
      <PricingTeaser />
      <FinalCta />
      {/* FAQ sits last, as asked. The more usual order puts it before the CTA
          so the page closes on the call to action — easy to swap if wanted. */}
      <SiteFaq />
    </>
  );
}

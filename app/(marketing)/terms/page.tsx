import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
// Imported rather than typed, so the guarantee this page GOVERNS cannot say a
// different number from the one the pricing page and the checkout promise.
import { GUARANTEE_DAYS } from '@/lib/dashboard/plans';

/*
  Terms and Conditions.

  Twin of app/(marketing)/privacy/page.tsx — same quiet hierarchy, same
  numbered clauses, same helpers. A legal document is read to find one clause,
  not skimmed for a pitch.

  One correction to the supplied copy, agreed before writing: the intro's
  "please note especially" list cited Disclaimer as 16, Limitation as 17,
  Indemnification as 18 and Governing Law as 19. Those clauses are actually
  14, 15, 16 and 17 — section 19 is Contact. The clause bodies are
  authoritative, so the intro numbers were corrected to match. It matters
  because these references render as working links, and a link labelled
  "Section 16 (Disclaimer)" that lands on Indemnification misdirects someone
  reading a binding agreement.
*/

export const metadata: Metadata = {
  title: 'Terms and Conditions',
  description:
    'The terms governing your use of the FaqFlo website, web application, and related services.',
  alternates: { canonical: '/terms' },
};

/*
  A fact about the document, not about the render — deliberately not new Date().
  The footer's dynamic copyright year is right there; doing the same here would
  silently restamp the agreement every day it is served.
*/
const LAST_UPDATED = 'August 11, 2026';

const CONTACT_EMAIL = 'hello@faqflo.com';

/* §4's five clauses, supplied as run-together lines. They are plainly separate
   billing rules, so they read as a list. */
const FEE_TERMS = [
  {
    term: 'Pricing',
    body: 'is shown at purchase, in U.S. dollars.',
  },
  {
    term: 'Subscriptions',
    body: 'renew automatically at the then-current rate until you cancel, and you authorize us (through our payment processor) to charge your payment method. Annual plans are billed up front for the term.',
  },
  {
    term: 'Cancellation',
    body: 'takes effect at the end of your current billing period; you keep paid access until then.',
  },
  {
    term: 'Price changes',
    body: 'apply at your next renewal, with advance notice for subscriptions.',
  },
  {
    term: 'Taxes',
    body: 'are your responsibility, except taxes on our net income. Payments are handled by our third-party processor; if a payment fails, we may retry, suspend, or downgrade your account.',
  },
];

export default function Terms() {
  return (
    <div className="px-5 pt-14 pb-24 sm:px-8 sm:pt-20">
      <article className="mx-auto max-w-184">
        <Badge tone="neutral">Legal</Badge>
        <h1 className="mt-5 text-[2.25rem] text-balance sm:text-[2.5rem]">
          FaqFlo Terms and Conditions
        </h1>
        <p className="text-slate mt-4 font-mono text-xs tracking-wide uppercase">
          Last updated: {LAST_UPDATED}
        </p>

        <div className="mt-8">
          <P>
            These Terms and Conditions (&ldquo;Terms&rdquo;) are a binding agreement between you
            (&ldquo;you&rdquo;) and FaqFlo (&ldquo;FaqFlo,&rdquo; &ldquo;we,&rdquo;
            &ldquo;us,&rdquo; or &ldquo;our&rdquo;) governing your use of the FaqFlo website, web
            application, and related services (the &ldquo;Services&rdquo;).
          </P>
          <P>
            By creating an account, purchasing a plan, or using the Services, you agree to these
            Terms and to our <PageLink href="/privacy">Privacy Policy</PageLink>. If you do not
            agree, do not use the Services. Please note especially{' '}
            <A href="#no-guarantee">Section 10 (No Guarantee of Results)</A>,{' '}
            <A href="#ai-and-content">Section 11 (AI and Content)</A>,{' '}
            <A href="#disclaimer">Section 14 (Disclaimer)</A>,{' '}
            <A href="#liability">Section 15 (Limitation of Liability)</A>,{' '}
            <A href="#indemnification">Section 16 (Indemnification)</A>, and{' '}
            <A href="#governing-law">Section 17 (Governing Law)</A>, which affect your legal rights.
          </P>
        </div>

        <Section id="eligibility" n={1} title="Eligibility and Accounts">
          <P>
            You must be at least 18 and able to enter a binding contract. If you use the Services
            for a business, you represent that you can bind it. You are responsible for your account
            credentials and all activity under your account, and must notify us at <Mail /> of any
            unauthorized use.
          </P>
        </Section>

        <Section id="the-services" n={2} title="The Services">
          <P>
            Depending on your plan, FaqFlo lets you audit a website for AI visibility, discover
            questions people ask AI engines, generate FAQ content, export publish-ready crawlable
            HTML and schema for your own website, and track whether your business is cited across AI
            answer engines such as ChatGPT, Perplexity, and Google&rsquo;s AI Overviews.
          </P>
          <P>
            <strong className="text-navy">You publish on your own domain.</strong> We provide
            content for you to place on your own website; we do not host it or control your site or
            website builder. You are responsible for correctly implementing the output and for the
            content once published. We may modify or discontinue features at any time.
          </P>
        </Section>

        <Section id="plans-limits" n={3} title="Plans, Free Tier, and Limits">
          <P>
            We may offer free features (such as the audit tool and FAQ generator) and paid plans,
            each subject to usage and rate limits. Free and beta features are provided &ldquo;as
            is&rdquo; and may change or be withdrawn at any time.
          </P>
        </Section>

        <Section id="fees" n={4} title="Fees and Subscriptions">
          <TermList items={FEE_TERMS} />
        </Section>

        <Section id="refunds" n={5} title="Refunds">
          {/*
            ⚠️ THIS SECTION USED TO SAY THE OPPOSITE, AND IT GOVERNS. It read
            "fees are non-refundable… any refund we choose to give is
            discretionary", which directly contradicted the money-back guarantee
            now offered on the annual plan. A guarantee on the pricing page that
            the terms deny is worse than no guarantee at all, so the two change
            together — see GUARANTEE_DAYS in lib/dashboard/plans.ts, which is
            where the number the app quotes comes from.
          */}
          <P>
            <strong>Annual plans come with a {GUARANTEE_DAYS}-day money-back guarantee.</strong>{' '}
            Ask us within {GUARANTEE_DAYS} days of your first annual payment and we will refund it
            in full and cancel the subscription. The guarantee applies to a first annual term, once
            per customer.
          </P>
          <P>
            Monthly plans are not covered by that guarantee, because you can cancel at any time and
            the most you can be charged for is the month already running. Cancellation takes effect
            at the end of the current billing period and we do not refund part-months or unused
            allowances.
          </P>
          <P>
            Except as set out above, and except where required by law, fees are non-refundable. Any
            other refund we choose to give is discretionary. A specific refund policy shown at
            purchase governs that transaction.
          </P>
        </Section>

        <Section id="lifetime-deal" n={6} title="Lifetime Deal">
          <P>
            A promotional &ldquo;Lifetime Deal&rdquo; is a one-time, limited-availability purchase
            granting access to specified features for the operational lifetime of the applicable
            Service or feature — not in perpetuity. Because ongoing features like citation tracking
            carry continuing per-customer costs, a Lifetime Deal may exclude them or include only a
            capped allowance, as disclosed at purchase. &ldquo;Lifetime&rdquo; means the lifetime of
            the Service or feature and does not require us to operate it indefinitely.
          </P>
        </Section>

        <Section id="your-content" n={7} title="Your Content">
          <P>
            You own the content you submit (&ldquo;Customer Content&rdquo;) and the FAQ output
            generated for you. You grant us a worldwide, non-exclusive, royalty-free license to
            host, process, and transmit your Customer Content — including to our service providers
            and third-party AI and search providers — solely to operate and improve the Services and
            deliver your output.
          </P>
          <P>
            You represent that you have the rights to submit your Customer Content and any URL you
            enter, that it does not infringe any third-party right or violate any law, and that you
            own or are authorized to submit any website you audit or track. You are responsible for
            reviewing output before publishing it (see <A href="#no-guarantee">Sections 10</A> and{' '}
            <A href="#ai-and-content">11</A>). Because output is AI-generated from common inputs,
            similar output may be produced for others, and we do not warrant it is unique to you.
          </P>
        </Section>

        <Section id="acceptable-use" n={8} title="Acceptable Use">
          <P>
            You agree not to: use the Services unlawfully; submit URLs or content you don&rsquo;t
            own or aren&rsquo;t authorized to submit; infringe others&rsquo; rights; upload or
            generate unlawful, deceptive, harmful, or malicious content; generate spam or
            manipulative content that violates a platform&rsquo;s terms; attempt to access or
            disrupt our systems or other accounts; circumvent usage limits or plan gating; reverse
            engineer the Services (except where law permits); resell the Services beyond your plan;
            or use the Services to build or train a competing product. We may suspend or terminate
            access for suspected violations.
          </P>
        </Section>

        <Section id="intellectual-property" n={9} title="Intellectual Property">
          <P>
            The Services and all related software, designs, and trademarks (including
            &ldquo;FaqFlo&rdquo;) are owned by us or our licensors. We grant you a limited,
            non-exclusive, non-transferable, revocable license to use the Services for your business
            in line with these Terms; all other rights are reserved. Any feedback you give us may be
            used freely without obligation to you.
          </P>
        </Section>

        <Section id="no-guarantee" n={10} title="No Guarantee of Results">
          <P>
            The Services help you optimize content for AI answer engines, but we cannot and do not
            guarantee any particular result. AI and search engines like ChatGPT, Perplexity, and
            Google decide independently whether and how to cite, quote, index, or rank any content,
            and their behavior changes constantly and is outside our control. We do not promise that
            using the Services will get your business cited, ranked, or shown, or that it will
            increase your visibility, traffic, or revenue. Scores, examples, and projections are
            illustrative only. You are purchasing tools and content, not a guaranteed outcome.
          </P>
        </Section>

        <Section id="ai-and-content" n={11} title="AI and Content">
          <P>
            The Services use third-party AI to generate output and analyze results. AI output and
            audit and tracking results may contain errors, be incomplete, or be out of date. You are
            responsible for reviewing, verifying, and editing all output before publishing or
            relying on it, including its accuracy and legal compliance. Output is not professional,
            legal, or financial advice, and we are not responsible for decisions you make or content
            you publish based on it.
          </P>
        </Section>

        <Section id="third-party" n={12} title="Third-Party Services">
          <P>
            The Services depend on third parties — AI and search engines, website builders, hosting,
            authentication, and payment processors — that we do not control. We are not responsible
            for their availability, changes, or acts, and their changes may affect the
            Services&rsquo; functionality or results. Note that some website builders render pasted
            HTML inside an iframe or otherwise non-crawlable form; verifying how your platform
            renders published content is your responsibility.
          </P>
        </Section>

        <Section id="termination" n={13} title="Suspension and Termination">
          <P>
            You may close your account at any time. We may suspend or terminate access, with or
            without notice, if you breach these Terms, if your use poses a legal or security risk,
            if required by law, or if we discontinue the Services. On termination, your right to use
            the Services ends, and we may delete your account and content after a reasonable period
            unless the law requires retention. Sections that should survive termination will survive.
          </P>
        </Section>

        <Section id="disclaimer" n={14} title="Disclaimer of Warranties">
          <P>
            The Services, including all output, audits, and tracking results, are provided &ldquo;as
            is&rdquo; and &ldquo;as available,&rdquo; without warranties of any kind, express,
            implied, or statutory. To the fullest extent permitted by law, we disclaim all implied
            warranties, including merchantability, fitness for a particular purpose, title, and
            non-infringement. We do not warrant that the Services will be uninterrupted, error-free,
            or secure, or that output will be accurate or produce any result.
          </P>
        </Section>

        <Section id="liability" n={15} title="Limitation of Liability">
          <P>
            To the fullest extent permitted by law, we will not be liable for any indirect,
            incidental, special, consequential, or punitive damages, or for lost profits, revenue,
            data, goodwill, or business opportunities, arising out of or relating to the Services or
            these Terms, under any theory of liability, even if advised of the possibility. Our
            total aggregate liability will not exceed the greater of the amounts you paid us in the
            twelve months before the event giving rise to the claim, or one hundred U.S. dollars
            ($100). Some jurisdictions do not allow certain limitations, so some may not apply to
            you.
          </P>
        </Section>

        <Section id="indemnification" n={16} title="Indemnification">
          <P>
            You agree to defend, indemnify, and hold harmless FaqFlo from any claims, damages,
            losses, and expenses (including reasonable attorneys&rsquo; fees) arising from your
            Customer Content, any content you publish using the output, your use of the Services,
            your violation of these Terms or any law, or your violation of any third-party right,
            including any URL you submitted without authorization.
          </P>
        </Section>

        <Section id="governing-law" n={17} title="Governing Law and Disputes">
          <P>
            These Terms are governed by the laws of the State of New Hampshire, United States,
            without regard to conflict-of-laws rules. Before filing a claim, you agree to try to
            resolve the dispute informally by contacting <Mail />; we will try to resolve it within
            sixty (60) days. The state and federal courts located in New Hampshire will have
            exclusive jurisdiction, and you consent to venue there. To the extent permitted by law,
            you and we agree to bring claims only individually and not as part of a class or
            representative action. Nothing here prevents either party from seeking injunctive relief
            for intellectual-property misuse, and your non-waivable statutory rights are unaffected.
          </P>
        </Section>

        <Section id="general" n={18} title="General">
          <P>
            These Terms, with the <PageLink href="/privacy">Privacy Policy</PageLink> and any plan
            terms shown at purchase, are the entire agreement between us and supersede prior
            agreements on this subject. If any provision is unenforceable, the rest remain in
            effect. Our failure to enforce a provision is not a waiver. You may not assign these
            Terms without our consent; we may assign them in a merger, sale, or reorganization. We
            are not liable for delays or failures caused by events beyond our reasonable control.
            You consent to receive communications from us electronically. These Terms create no
            partnership, employment, or agency relationship.
          </P>
        </Section>

        <Section id="contact" n={19} title="Contact">
          <P>
            FaqFlo Email: <Mail />
          </P>
        </Section>
      </article>
    </div>
  );
}

/** Numbered clause, separated by a hairline rule. */
function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-line mt-12 scroll-mt-24 border-t pt-9">
      <h2 className="mb-4 text-[1.375rem] leading-snug">
        <span className="text-slate font-normal tabular-nums">{n}.</span> {title}
      </h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-slate mt-4 text-[1.0625rem] leading-[1.8] first:mt-0">{children}</p>;
}

/** Bolded term, em dash, definition — used by §4's billing rules. */
function TermList({ items }: { items: { term: string; body: string }[] }) {
  return (
    <ul className="mt-3 space-y-3">
      {items.map((item) => (
        <li key={item.term} className="text-slate flex gap-3 text-[1.0625rem] leading-[1.8]">
          <span className="bg-slate/40 mt-3 h-1 w-1 shrink-0 rounded-full" aria-hidden="true" />
          <span>
            <strong className="text-navy">{item.term}</strong> {item.body}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** In-page cross-reference. The copy refers to its own clauses by number and
    name; those should navigate rather than make the reader hunt. */
function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-primary hover:text-primary-hover underline decoration-2 underline-offset-4 transition-colors duration-150"
    >
      {children}
    </a>
  );
}

/** Cross-document link — next/link rather than a raw anchor, since this one
    leaves the page. */
function PageLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-primary hover:text-primary-hover underline decoration-2 underline-offset-4 transition-colors duration-150"
    >
      {children}
    </Link>
  );
}

function Mail() {
  return (
    <a
      href={`mailto:${CONTACT_EMAIL}`}
      className="text-primary hover:text-primary-hover underline decoration-2 underline-offset-4 transition-colors duration-150"
    >
      {CONTACT_EMAIL}
    </a>
  );
}

import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';

/*
  Privacy Policy.

  Plainer than the other long-form pages on purpose. No coloured eyebrows, no
  cards, no doodles: a legal document is read to find one clause, not skimmed
  for a pitch, so the hierarchy stays quiet and the sections stay numbered.

  Sections carry ids even though there is no contents list — the copy
  cross-references itself ("see Section 3", "see GDPR Rights"), and those
  references are rendered as real links.
*/

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How FaqFlo collects, uses, and shares information through our website, app, and services.',
  alternates: { canonical: '/privacy' },
};

/*
  A fact about the document, not about the render. Deliberately not new Date():
  the footer's dynamic copyright year is right there, and doing the same here
  would silently restamp the policy every day it is served.
*/
const LAST_UPDATED = 'August 11, 2026';

const CONTACT_EMAIL = 'hello@faqflo.com';

const PROVIDED = [
  {
    term: 'Account',
    body: 'your name, email, and login credentials (passwords are managed by our authentication provider and stored hashed; we never see your plaintext password).',
  },
  {
    term: 'Billing',
    body: 'handled by our payment processor. We do not store full card numbers; we receive limited details such as card brand, last four digits, expiration, and subscription status.',
  },
  {
    term: 'Content you submit',
    body: 'website URLs, business details, topics, and the FAQ questions and answers you create or generate.',
  },
  {
    term: 'Communications',
    body: 'support requests, demo and intake forms, and anything else you send us.',
  },
];

const AUTOMATIC = [
  {
    term: 'Usage data',
    body: 'audits run, FAQs generated, features used, pages viewed, and timestamps.',
  },
  {
    term: 'Device and log data',
    body: 'IP address, browser and device type, and diagnostic/error logs used to keep the Services secure and working.',
  },
];

const SHARING = [
  'with service providers who work on our behalf — hosting, authentication, payment processing, email delivery, error monitoring, analytics, and the AI and search engines used for generation and tracking;',
  'for legal and safety reasons, when required by law or to protect our rights, users, or the public;',
  'in a business transfer, such as a merger, acquisition, or sale of assets;',
  'at your direction or with your consent; and',
  'as aggregated or de-identified data that cannot reasonably identify you.',
];

export default function Privacy() {
  return (
    <div className="px-5 pt-14 pb-24 sm:px-8 sm:pt-20">
      <article className="mx-auto max-w-184">
        <Badge tone="neutral">Legal</Badge>
        <h1 className="mt-5 text-[2.25rem] text-balance sm:text-[2.5rem]">
          FaqFlo Privacy Policy
        </h1>
        <p className="text-slate mt-4 font-mono text-xs tracking-wide uppercase">
          Last updated: {LAST_UPDATED}
        </p>

        <div className="mt-8">
          <P>
            This Privacy Policy explains how FaqFlo (&ldquo;FaqFlo,&rdquo; &ldquo;we,&rdquo;
            &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, and shares information through
            the FaqFlo website, web application, and related services (the &ldquo;Services&rdquo;).
          </P>
          <P>
            FaqFlo is an Answer Engine Optimization (AEO) service. It audits websites for AI
            visibility, generates FAQ content, produces publish-ready HTML for you to place on your
            own website, and tracks whether your business is cited by AI answer engines such as
            ChatGPT, Perplexity, and Google&rsquo;s AI Overviews.
          </P>
          <P>
            By using the Services, you agree to this Privacy Policy. If you are in the EEA, UK, or
            Switzerland, see <A href="#gdpr">GDPR Rights</A>; if you are a California resident, see{' '}
            <A href="#california">California Rights</A>.
          </P>
        </div>

        <Section id="who-we-are" n={1} title="Who We Are">
          <P>
            FaqFlo is the data controller for information processed through the Services. You can
            contact us any time at <Mail />.
          </P>
        </Section>

        <Section id="information-we-collect" n={2} title="Information We Collect">
          <H3>Information you provide</H3>
          <TermList items={PROVIDED} />

          <H3>Information we collect automatically</H3>
          <TermList items={AUTOMATIC} />
          <P>
            <strong className="text-navy">Cookies and similar technologies</strong> — see{' '}
            <A href="#cookies">Section 3</A>.
          </P>

          <H3>Information from websites you submit</H3>
          <P>
            A core function of the Services is to fetch and analyze the URLs you submit, including
            their public HTML, robots.txt, and structured data. You are responsible for having the
            right to submit any URL you enter.
          </P>

          <H3>Information from third parties</H3>
          <P>
            Our authentication provider, payment processor, and analytics partners may share
            account, billing, or attribution information, and the AI and search engines we query on
            your behalf return results that may reference your business or competitors.
          </P>
        </Section>

        <Section id="cookies" n={3} title="Cookies">
          <P>
            We use cookies and similar technologies that are strictly necessary (for login and
            security), functional (to remember preferences), and for analytics and marketing
            measurement. Where required by law, we ask for your consent before setting non-essential
            cookies and provide a way to manage them; you can also control cookies in your browser.
            We do not respond to browser &ldquo;Do Not Track&rdquo; signals but honor recognized
            opt-out signals (such as Global Privacy Control) where legally required.
          </P>
        </Section>

        <Section id="how-we-use" n={4} title="How We Use Information">
          <P>
            We use information to provide and operate the Services (running audits, generating FAQ
            content, producing HTML and schema, and tracking citations); to create and secure your
            account; to process payments and manage subscriptions; to communicate with you,
            including service, billing, and — where permitted — marketing messages; to improve the
            Services and develop new features; to prevent fraud and abuse; and to comply with legal
            obligations.
          </P>

          <H3>Use of AI</H3>
          <P>
            To deliver the Services, the content you submit may be processed by third-party AI
            providers to generate FAQ content, and we send queries to third-party AI and search
            engines to track citations. We do not use your submitted content to train our own AI
            models and contractually seek to limit our providers from doing so, though those
            providers operate under their own terms.
          </P>

          <H3>Legal bases (EEA/UK/Switzerland)</H3>
          <P>
            We process personal data to perform our contract with you, for our legitimate interests
            (securing and improving the Services, preventing abuse, and marketing to existing
            customers), with your consent (for example, certain cookies and marketing), and to
            comply with legal obligations.
          </P>
        </Section>

        <Section id="how-we-share" n={5} title="How We Share Information">
          <P>
            We do not sell your personal information. We share it only:
          </P>
          <ul className="mt-4 space-y-3">
            {SHARING.map((item) => (
              <li key={item} className="text-slate flex gap-3 text-[1.0625rem] leading-[1.8]">
                <span className="bg-slate/40 mt-3 h-1 w-1 shrink-0 rounded-full" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          <P>
            A list of our key subprocessors is available on request at <Mail />.
          </P>
        </Section>

        <Section id="retention-security" n={6} title="Data Retention and Security">
          <P>
            We keep personal information for as long as your account is active and as needed to
            provide the Services, then for as long as necessary to meet legal obligations, resolve
            disputes, and enforce our agreements, after which we delete or de-identify it. We use
            reasonable safeguards such as encryption in transit, access controls, and reputable
            infrastructure and payment providers, but no system is completely secure. You are
            responsible for keeping your credentials confidential.
          </P>
        </Section>

        <Section id="international-transfers" n={7} title="International Transfers">
          <P>
            We are based in the United States and may process information there and in other
            countries whose laws may differ from yours. Where we transfer personal data out of the
            EEA, UK, or Switzerland, we rely on appropriate safeguards such as the Standard
            Contractual Clauses. Request details at <Mail />.
          </P>
        </Section>

        <Section id="your-rights" n={8} title="Your Privacy Rights">
          <P>
            We will not discriminate against you for exercising any right below. To make a request,
            email <Mail />; we may need to verify your identity first.
          </P>

          <H3 id="gdpr">GDPR Rights (EEA/UK/Switzerland)</H3>
          <P>
            You may request access, correction, deletion, restriction, or portability of your
            personal data; object to certain processing; withdraw consent; and lodge a complaint
            with your local supervisory authority.
          </P>

          <H3 id="california">California Rights (CCPA/CPRA)</H3>
          <P>
            You may request to know, access, delete, or correct your personal information, and to
            opt out of the sale or sharing of it. We do not sell your personal information or share
            it for cross-context behavioral advertising. In the past twelve months we may have
            collected the categories described in{' '}
            <A href="#information-we-collect">Section 2</A> (identifiers, customer and commercial
            records, internet activity, approximate location from IP, and the contents of your
            communications and inputs) for the purposes in <A href="#how-we-use">Section 4</A>. You
            may use an authorized agent, subject to verification.
          </P>

          <H3 id="other-us-states">Other U.S. states</H3>
          <P>
            Residents of states such as Virginia, Colorado, Connecticut, Utah, Texas, Oregon,
            Montana, and New Hampshire may have similar rights to access, correct, delete, and port
            their data and to opt out of targeted advertising and sale — none of which we engage in.
            Contact <Mail /> to exercise them.
          </P>
        </Section>

        <Section id="childrens-privacy" n={9} title="Children’s Privacy">
          <P>
            The Services are for business users who are at least 18. We do not knowingly collect
            information from anyone under 16. If you believe a child has provided us information,
            contact <Mail /> and we will delete it.
          </P>
        </Section>

        <Section id="marketing-links" n={10} title="Marketing and Third-Party Links">
          <P>
            You can opt out of marketing emails via the unsubscribe link or by emailing <Mail />; we
            will still send necessary account and service messages. The Services link to and
            interoperate with third-party sites and platforms (including your own website, website
            builders, and AI engines) whose privacy practices are their own.
          </P>
        </Section>

        <Section id="changes-contact" n={11} title="Changes and Contact">
          <P>
            We may update this Privacy Policy and will revise the &ldquo;Last updated&rdquo; date,
            providing additional notice if the changes are material. Continued use after changes
            take effect means you accept them.
          </P>
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

/** Labelled run inside a clause. Takes an optional id so §8's three rights
    blocks can be linked to directly. */
function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="mt-7 mb-1 scroll-mt-24 text-[1.0625rem]">
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-slate mt-4 text-[1.0625rem] leading-[1.8] first:mt-0">{children}</p>;
}

/** Bolded term, em dash, definition — the pattern §2 uses throughout. */
function TermList({ items }: { items: { term: string; body: string }[] }) {
  return (
    <ul className="mt-3 space-y-3">
      {items.map((item) => (
        <li key={item.term} className="text-slate flex gap-3 text-[1.0625rem] leading-[1.8]">
          <span className="bg-slate/40 mt-3 h-1 w-1 shrink-0 rounded-full" aria-hidden="true" />
          <span>
            <strong className="text-navy">{item.term}</strong> — {item.body}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** In-page cross-reference. The copy refers to its own sections by name and
    number; those should navigate rather than make the reader hunt. */
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

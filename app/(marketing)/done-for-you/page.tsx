import type { Metadata } from 'next';
import Image from 'next/image';
import { DoneForYouForm } from '@/components/marketing/done-for-you-form';
import { Check } from '@/components/ui/check';
import { AUTHOR, AUTHOR_AVATAR } from '@/lib/blog/posts';
import { ENTITLEMENTS } from '@/lib/dashboard/plans';
import { DFY_PRICE, DFY_PRICE_USD, DFY_SITE_SCOPE, DFY_TURNAROUND } from '@/lib/done-for-you';
import { SITE_NAME, SITE_URL, jsonLd } from '@/lib/site';

/*
  The done-for-you service page, written as a short letter.

  ⚠️ THE BREVITY IS THE DESIGN, AND SO IS THE PLAINNESS. DO NOT GROW IT BACK.

  This page has been cut twice. It started as the marketing kit — badges,
  tinted bands, gradient step cards, an accordion FAQ — which was the wrong
  treatment for something sold as "a person does this by hand". Then it was a
  1,400-word letter, which was the wrong LENGTH for the reader: a small
  business owner who wants to know what they get, what it costs, and how to
  say yes. They are not going to read an essay to find that out.

  So the whole page is now roughly 500 words and answers those three questions
  in that order. Every addition trades against that. The things most likely to
  creep back, and why they were cut:

    - The five-step breakdown  → the tick list already says what they get.
    - The "Instead of:" lines  → arguing with a reader who already agrees.
    - A timing section         → one clause in the price block does it.
    - More than three FAQs     → the other four were answered above them.

  ⚠️ IT SPEAKS AS "I". Every other page says "we" — /about says "a small,
  focused team", the footer says "Made by Tenichi". That is not an
  inconsistency to tidy up; it is the product. If this ever becomes a team of
  three, the copy changes before the delivery does.

  ⚠️ THE $129 FOR GET CITED IS DELIBERATELY NOT MENTIONED, AND THAT IS A
  STATEMENT ABOUT WHO READS THIS.

  The service is only offered to people who already pay for Get Cited, so by
  the time anyone sees this page the $129 is spent, the site is set up, and
  explaining the order is answering a question nobody has. An earlier draft
  led the price block with "on top of Get Cited ($129 once)" and carried a
  whole FAQ about the ordering — accurate, and pure friction for the actual
  reader.

  ⚠️ THAT ASSUMPTION IS LOAD-BEARING. It holds only while every route to this
  page runs through somebody who has already bought. If it is ever pitched to
  a cold audience — an ad, a newsletter, a link from a page a stranger reads —
  then "$497 once" reads as all-in, the second charge is a surprise, and the
  surprise is a refund. Changing who this page is shown to means putting the
  order back into the copy in the same commit.

  The form still asks whether they have Get Cited. That is the backstop for
  the stranger who finds the page anyway, and it is why the question is worth
  keeping even though the intended reader always answers it the same way.

  ⚠️ NO <FinalCta />. Every other marketing page ends with it and it pushes the
  free visibility check — the right ask for a stranger, the wrong one for
  somebody who has just read a price. The P.S. carries that reader instead.
*/

export const metadata: Metadata = {
  title: 'Done for you',
  description:
    'I set the whole thing up for you by hand — your site audited and fixed, answers written in your voice and published live, plus 90 days of tracking. $497, live in two weeks.',
  alternates: { canonical: '/done-for-you' },
};

/* -------------------------------------------------------------- content --- */

/*
  What they get, in the order it happens.

  ⚠️ SIX LINES, NOT NINE. This replaced both a nine-item inclusion list and a
  five-step walkthrough that said the same things twice at different lengths.
  Each line is one thing I do, phrased as the outcome rather than the task —
  "your site audited and the blockers fixed", not "I read the 44-check audit
  and work the ranked list". The reader is buying the outcome.
*/
const INCLUDED = [
  'Your site audited, and the things blocking AI from reading it fixed',
  'The questions people actually ask AI about businesses like yours',
  'Every answer written and edited by hand, in your voice',
  'Published live on your own site — by me, not handed to you as homework',
  '90 days of citation tracking across ChatGPT, Perplexity and Gemini — checked five times, on a schedule',
  'One plain-English report at the end: who’s being cited, and what I’d do next',
];

/*
  ⚠️ THIS LIST IS NOT PADDING AND MUST NOT BE CUT FURTHER.

  It is three lines because the page got short, but at a price with a scope
  attached it is the thing standing between an assumption and a chargeback.
  /about says outright that anyone guaranteeing you a citation is selling
  something; this is where that principle costs us something to keep.
*/
const NOT_INCLUDED = [
  {
    label: 'A website redesign.',
    body: 'I add answers to the site you already have.',
  },
  {
    label: 'A guarantee that AI will cite you.',
    body: 'Nobody controls what ChatGPT quotes, and be careful with anyone who says they do. I can make you readable, quotable and worth quoting — then show you honestly whether it worked.',
  },
  {
    label: 'Anything after the 90 days.',
    body: `Everything I make stays yours for good. Keeping tracking and fresh answers running is Stay Cited, at ${ENTITLEMENTS.stay_cited.price}.`,
  },
];

/*
  Three questions, chosen because they are the three that stop a sale and are
  NOT already answered above.

  "Can you guarantee citations" is deliberately absent — it is in the list
  above, and a page that answers the same objection twice reads as nervous.

  "Do I still have to buy Get Cited separately?" used to lead this list. It
  went when the audience was pinned to existing Get Cited customers: the whole
  answer is "you already did". See the note at the top of this file for what
  has to change if that stops being true.
*/
const FAQS = [
  {
    q: 'What if I don’t like the answers you write?',
    a: 'You see all of them before anything goes live. I send you the full set, you tell me what is wrong — a price, a policy, a sentence that just is not how you would say it — and I fix it. That round is part of the two weeks, not an extra.',
  },
  {
    q: 'What if I can’t give you a login to my site?',
    a: 'Tell me on the form and we will talk before you pay anything. Publishing it myself is what makes this done-for-you rather than done-and-handed-over, so if there is genuinely no way in, this might not be the right buy for you — and I would rather say that than take the money.',
  },
  {
    q: 'What if you’re full?',
    a: 'I will tell you, and give you a date. I do the work myself, so a handful a month is a real ceiling rather than a sales line. Taking your money and sitting on it for six weeks is worse than losing the sale.',
  },
];

/* ----------------------------------------------------------------- page --- */

export default function DoneForYou() {
  return (
    <div className="px-5 pt-14 pb-24 sm:px-8 sm:pt-20">
      {/* The reading column /about and /seo-guide already use. */}
      <article className="mx-auto max-w-184">
        {/*
          Service alongside FAQPage. The Offer makes this page machine-readable
          as a purchasable thing at a stated price — exactly the markup this
          business sells to other people, so the page had better carry it.
          `price` is derived from DFY_PRICE_USD, never typed, so it cannot
          disagree with the number printed below it.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd({
              '@context': 'https://schema.org',
              '@type': 'Service',
              name: 'FaqFlo Done For You',
              serviceType: 'Answer engine optimisation setup',
              url: `${SITE_URL}/done-for-you`,
              description:
                'A hands-on setup service: your site audited and fixed, the right questions chosen, answers written by hand and published to your own site, plus 90 days of citation tracking reported back to you.',
              provider: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
              offers: {
                '@type': 'Offer',
                price: String(DFY_PRICE_USD),
                priceCurrency: 'USD',
                url: `${SITE_URL}/done-for-you#start`,
                availability: 'https://schema.org/LimitedAvailability',
              },
            }),
          }}
        />

        {/*
          The letterhead.

          alt="" because the name is the very next thing on the page as text —
          the call components/marketing/author-bio.tsx makes and explains.
          Lazy, because the h1 below is the LCP element, not an 80px avatar.

          ⚠️ The credential line lives HERE and nowhere else. On a page this
          short, saying "I built FaqFlo" twice inside four lines is a quarter
          of the letter spent introducing myself.
        */}
        <div className="border-line flex items-center gap-4 border-b pb-8">
          <Image
            src={AUTHOR_AVATAR}
            alt=""
            width={80}
            height={80}
            className="bg-cloud h-16 w-16 shrink-0 rounded-full object-cover sm:h-18 sm:w-18"
          />
          <div>
            <p className="font-display text-navy text-lg font-bold">{AUTHOR}</p>
            <p className="text-slate mt-0.5 text-[0.9375rem] leading-relaxed">
              I built FaqFlo. Twenty years doing marketing for small businesses.
            </p>
          </div>
        </div>

        <h1 className="mt-10 text-[2rem] leading-tight text-balance sm:text-[2.5rem]">
          I&rsquo;ll set the whole thing up for you
        </h1>

        <div className="mt-7">
          <P>Hi.</P>
          <P>
            You&rsquo;ve got Get Cited running. And somewhere between the audit findings and the
            block of HTML waiting to go onto your site, this probably stopped feeling like a quick
            job.
          </P>
          <P>
            That&rsquo;s not you being slow. It&rsquo;s an afternoon of fiddly work sitting behind
            everything else you&rsquo;re already behind on — and until it&rsquo;s live on your site,
            none of it counts.
          </P>
          {/*
            ⚠️ THIS PARAGRAPH IS THE ARGUMENT, NOT PADDING. DO NOT TRIM IT.

            Everything else on this page is what you get, what it costs and how
            to say yes. This is the only part that says why I am offering it at
            all, and it is the reason somebody picks a person over a cheaper
            tool. A future pass cutting for length will find it the most
            expendable-looking block here and it is the last thing that should
            go.
          */}
          <P>
            Most software leaves you hanging right about there. It hands you the output, wishes you
            luck, and whether any of it ever reaches your site quietly becomes your problem. I
            don&rsquo;t want that for you. I built this thing, and I&rsquo;d rather it actually
            worked for you than sat in a dashboard looking impressive.
          </P>
          <P>
            So let me just do it. All of it, by hand, and you&rsquo;ll be live in{' '}
            {DFY_TURNAROUND}.
          </P>
        </div>

        <Section title="What you get">
          <ul className="space-y-2.5">
            {INCLUDED.map((item) => (
              <li key={item} className="text-slate flex gap-3 text-[1.0625rem] leading-relaxed">
                <Check className="text-primary mt-[0.45rem] shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="What it costs">
          {/* Heading weight, not a 48px price display. The number matters; a
              billboard treatment of it belongs on a pricing table. */}
          <p className="font-display text-navy text-[1.75rem] leading-none font-extrabold">
            {DFY_PRICE} once
          </p>

          {/* ⚠️ The second charge, stated immediately under the number rather
              than in small print. This sentence is the one thing on the page
              that cannot be cut for length. */}
          {/* No mention of the $129 — see the note at the top of this file.
              Everyone who reaches this page has already paid it. */}
          <P>
            {DFY_SITE_SCOPE}. Live within {DFY_TURNAROUND} of me getting access, and nothing to pay
            until we&rsquo;ve agreed the scope.
          </P>
          <P>
            I take on a handful of these a month, because I do the work myself. If I&rsquo;m full
            when you write, I&rsquo;ll tell you and give you a date.
          </P>

          <div className="border-line mt-8 border-t pt-7">
            <h3 className="text-[1.1875rem]">What it doesn&rsquo;t cover</h3>
            <ul className="mt-4 space-y-3">
              {NOT_INCLUDED.map((item) => (
                <li key={item.label} className="text-slate text-[1.0625rem] leading-[1.8]">
                  <strong className="text-navy">{item.label}</strong> {item.body}
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section title="What I need from you">
          <P>
            A login to your site, half an hour on your prices and policies, and one round of review
            before anything goes live. That&rsquo;s the whole ask.
          </P>
        </Section>

        <Section title="Three quick questions">
          {/* Built from the same array that renders below, so the markup and
              the page can never describe different questions. Plain text, not
              an accordion — every answer is in the server HTML, which is the
              standard this business holds its customers to. */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: jsonLd({
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: FAQS.map((f) => ({
                  '@type': 'Question',
                  name: f.q,
                  acceptedAnswer: { '@type': 'Answer', text: f.a },
                })),
              }),
            }}
          />

          <div className="space-y-6">
            {FAQS.map((faq) => (
              <div key={faq.q}>
                <h3 className="text-[1.1875rem] leading-snug">{faq.q}</h3>
                <p className="text-slate mt-2 text-[1.0625rem] leading-[1.8]">{faq.a}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* The sign-off. A rule, a short close, a name. */}
        <div className="border-line mt-14 border-t pt-10">
          <P>
            That&rsquo;s the whole thing. Fill in the form below and it comes straight to my inbox
            — I read them myself, and I&rsquo;ll reply within a working day with either a start date
            or an honest &ldquo;I&rsquo;m full until then&rdquo;.
          </P>
          <p className="font-display text-navy mt-7 text-lg font-bold">&mdash; {AUTHOR}</p>

          {/* The free-check line belongs in the P.S., not the argument: it is
              the right thing to say to someone unsure and the wrong thing to
              interrupt someone who isn't. */}
          <p className="text-slate mt-7 text-[0.9375rem] leading-[1.8]">
            <strong className="text-navy">P.S.</strong> Not sure yet? Run the{' '}
            <a href="/#audit" className="text-primary hover:text-primary-hover font-semibold">
              free visibility check
            </a>{' '}
            first — thirty seconds, no account. If AI can already read and cite you, I&rsquo;ll tell
            you that instead of selling you something.
          </p>
        </div>

        <section id="start" className="border-line mt-14 scroll-mt-24 border-t pt-10">
          <h2 className="text-[1.625rem] leading-snug text-balance sm:text-[1.875rem]">
            Tell me about your site
          </h2>
          <P>This comes straight to me — not a queue, not a chatbot.</P>

          <div className="mt-7">
            <DoneForYouForm />
          </div>
        </section>
      </article>
    </div>
  );
}

/* ------------------------------------------------------------- helpers --- */

/*
  The two prose primitives /about and /seo-guide each carry a copy of.
  Deliberately page-local: those files already duplicate them verbatim, so a
  third copy follows the established pattern, and extracting them would mean
  editing two stable pages to gain nothing. `label` is dropped from the /about
  version — an uppercase eyebrow above every heading is decoration this page
  has no room for.
*/
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-line mt-12 border-t pt-9">
      <h2 className="mb-5 text-[1.625rem] leading-snug text-balance sm:text-[1.875rem]">{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-slate mt-4 text-[1.0625rem] leading-[1.8] first:mt-0">{children}</p>;
}

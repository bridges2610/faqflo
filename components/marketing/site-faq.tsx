import { FaqItem } from '@/components/ui/faq-item';
import { FREE_GENERATED_FAQ_SET_CAP, PRO_PRICE } from '@/lib/dashboard/plans';
import { jsonLd } from '@/lib/site';

/*
  FaqFlo's own FAQs — real ones, not the generator's sample set.

  ⚠️ WRITTEN FOR AN OWNER, NOT A DEVELOPER. These used to lead with "Why not
  just a JavaScript widget?" and an iframe explanation — true, and answering a
  question nobody with a business to run has ever asked. What they want to know
  is what they get, who writes it, how much of their week it costs, and how they
  will know it worked. The mechanics survive only where an owner would actually
  hit them: "do I need a developer", "will it work with my site".

  ⚠️ THE NUMBERS COME FROM lib/dashboard/plans.ts, NOT FROM TYPING. The free
  allowance and the Pro price are quoted here and enforced there; two copies is
  two chances to change one of them. Same rule PLAN_FEATURES follows.

  ⚠️ ChatGPT, PERPLEXITY AND GEMINI — NEVER "AI OVERVIEWS". "How will I know
  if it's working" is a tracking claim on a product surface, and ENGINES in
  lib/dashboard/types.ts is the list we can actually ask.

  This is the section that finally makes FAQPage JSON-LD honest on this page.
  Emitting schema for the generator's illustrative examples would have marked up
  content that isn't actually the site's FAQ, which is exactly the sloppiness
  this product exists to fix. These are genuine, so they get marked up.

  Rendered with <details>, so every question and answer is in the server HTML
  and readable with JavaScript disabled.
*/
const FAQS = [
  {
    /*
      ⚠️ FIRST, BECAUSE IT IS THE QUESTION UNDER ALL THE OTHERS. "What do I get"
      and "how much work is it" both assume the reader already knows why they
      would bother. This one answers that, so it goes above them.

      ⚠️ A MECHANISM, NOT A RESULT. It says what being named IS — a customer
      arriving pointed at you — and never how many, how much more, or how soon.
      Nothing here has been measured, so nothing here is quantified; the same
      rule the busy-button panel and every ⚠️ in lib/dashboard/plans.ts follow.
    */
    q: 'What’s the point of FaqFlo?',
    a: 'To get your business named when someone asks an AI who to hire, and to turn that into work. Being the name in the answer is closer to a referral than an ad — the customer arrives already pointed at you, rather than having to be talked round. Everything else here exists to make that more likely.',
  },
  {
    q: 'What do I actually get?',
    a: 'A plain-English report on whether AI can read your website, the questions customers are really asking about businesses like yours, answers written for you in the form AI tends to quote, and a block of content you paste onto your own site. After that we keep asking the assistants those questions and tell you when your name starts coming up.',
  },
  {
    q: 'Do you write it for me, or do I have to?',
    a: 'We write it. You get the answers drafted for you, and full articles too if you want them — you review, change anything that isn’t right, and paste. You know your business better than we do, so nothing is published without you seeing it.',
  },
  {
    /*
      ⚠️ "A PAID ADD-ON", NOT "INCLUDED WITH PRO", AND THE DISTINCTION IS THE
      WHOLE REASON THIS SENTENCE IS CAREFUL. Done-for-you is a separate service,
      quoted and invoiced by hand — lib/dashboard/plans.ts deliberately gives its
      PLAN_FEATURES row no prosePro so it can never appear as a tick on the
      pricing card, on the stated grounds that a tick under "$39/month" "would
      be a false claim to a stranger". This FAQ is read by exactly that stranger.

      ⚠️ AND IT DOES NOT LINK TO /done-for-you. That page opens by telling the
      reader "You've got Pro running", which is false for most people reading
      this section — canOfferDoneForYou() exists precisely to keep non-customers
      away from it. Naming the service without sending anyone there is the same
      safe shape the plan table uses: it quotes nothing and links nowhere.
    */
    q: 'How much work is this for me?',
    a: 'An afternoon at the start, then very little. The bulk of it is checking the answers sound like you and pasting them onto your site. After that it runs on its own, and the only upkeep is updating a price or a service area when it actually changes. If you would rather not do even that, Pro customers can have us do the whole setup by hand — it’s a paid add-on rather than part of the subscription.',
  },
  {
    q: 'How will I know if it’s working?',
    a: 'We put your questions to ChatGPT, Perplexity and Gemini on a schedule and record what comes back — whether you were named, whether they linked to you, and which business got the mention when it wasn’t you. It’s the part most people never get to see.',
  },
  {
    q: 'Is it really free to start?',
    a: `Yes, and no card. The FAQ writer on this page needs no account at all. A free account gets you the visibility report, ${FREE_GENERATED_FAQ_SET_CAP} sets of answers and your first article, so you can see the whole thing work before deciding. Pro is $${PRO_PRICE.monthly} a month.`,
  },
  {
    q: 'Do I need a developer?',
    a: 'No, and no plugin either. You get a block of ordinary text-and-HTML and paste it into your site the same way you would add any other content — WordPress, Squarespace, Webflow and Wix all have somewhere for it.',
  },
  {
    q: 'Will this work with my website?',
    a: 'Almost certainly. The one thing worth checking is where the content lands: some site builders tuck embedded code inside a frame that AI assistants read as a separate page, which wastes the effort. We check that for you after you paste and tell you if it didn’t take.',
  },
  {
    q: 'Does the content live on your site or mine?',
    a: 'Yours, always, on your own domain. Hosting it on a FaqFlo address would mean the credit and the customer go to us instead of you, which would defeat the entire point.',
  },
  {
    q: 'What is answer engine optimisation?',
    a: 'It’s making sure AI assistants can find, understand and quote your business when someone asks them a question you could have answered. It isn’t a replacement for search — it’s the same idea in the place people increasingly ask first.',
  },
];

export function SiteFaq() {
  return (
    <section id="faq" className="scroll-mt-24 bg-white px-5 py-20 sm:px-8 sm:py-24">
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

      <div className="mx-auto max-w-6xl">
        {/* Deliberately not another centred badge-heading-subhead stack — the
            sections above already use that shape twice. */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-20">
          <div className="relative">
            <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">
              Before you ask
            </p>
            <h2 className="mt-4 text-[2rem] text-balance sm:text-[2.5rem]">
              The questions we get most
            </h2>
            <p className="text-slate mt-5 text-[0.9375rem] leading-relaxed">
              Written by hand, marked up with FAQ schema — the same thing FaqFlo does for you.
            </p>
          </div>

          <div className="divide-line border-line divide-y border-t">
            {FAQS.map((faq, i) => (
              <FaqItem key={faq.q} question={faq.q} answer={faq.a} defaultOpen={i === 0} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

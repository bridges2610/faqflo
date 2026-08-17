import { FaqItem } from '@/components/ui/faq-item';
import { jsonLd } from '@/lib/site';

/*
  FaqFlo's own FAQs — real ones, not the generator's sample set.

  This is the section that finally makes FAQPage JSON-LD honest on this page.
  Emitting schema for the generator's illustrative examples would have marked up
  content that isn't actually the site's FAQ, which is exactly the sloppiness
  this product exists to fix. These are genuine, so they get marked up.

  Rendered with <details>, so every question and answer is in the server HTML
  and readable with JavaScript disabled.
*/
const FAQS = [
  {
    q: 'Is the check really free?',
    a: 'Yes — the visibility score and the FAQ generator are free, with no account and no card. The full audit, the publish-ready export, and citation tracking are the paid parts.',
  },
  {
    q: 'What is answer engine optimisation?',
    a: 'It’s shaping your content so AI assistants like ChatGPT, Perplexity, and Google’s AI answers can find, understand, and quote you. It’s a different job from ranking in blue links, and question-and-answer content is the format that does it best.',
  },
  {
    q: 'Do I need a developer?',
    a: 'No, and you don’t need a plugin either. You get a block of plain HTML and you paste it into your site’s own code block — the Custom HTML block in WordPress, a code block in Squarespace, an embed in Webflow. If you can paste a paragraph, you can do this.',
  },
  {
    q: 'Why not just a JavaScript widget?',
    a: 'Because AI crawlers don’t run JavaScript. Anything a script draws after the page loads is invisible to exactly the systems this is meant to reach, so the answers have to be in the HTML itself. That’s the whole reason the delivery is a copy-paste block rather than one line of script.',
  },
  {
    q: 'Will this work on Wix or a site builder?',
    a: 'Check where the HTML lands first. Some builders wrap embedded code in an iframe, and content inside an iframe isn’t read as part of your page — so it won’t earn you the citation. If yours does that, put the answers in a native text or HTML section instead of an embed.',
  },
  {
    q: 'Does the content live on your site or mine?',
    a: 'Yours, always, on your own domain. Hosting it on a FaqFlo subdomain would mean the citation and the click go to us instead of you, which would defeat the point.',
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

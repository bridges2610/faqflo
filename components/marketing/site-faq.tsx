import { FaqItem } from '@/components/ui/faq-item';

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
    q: 'Is FaqFlo really free?',
    a: 'The generator is, and stays that way — three FAQ sets a day, no account, no card. Paid plans are for when you want the widget live on your own site with analytics behind it.',
  },
  {
    q: 'What is answer engine optimisation?',
    a: 'It’s optimising your content so AI assistants like ChatGPT, Perplexity, and Google’s AI answers can find, understand, and quote you. It’s a different job from ranking in blue links, and FAQs are the format that does it best.',
  },
  {
    q: 'Do I need a developer?',
    a: 'No. Generating and copying FAQs takes no setup at all. When the widget launches, installing it is pasting one line into your site — the same as adding an analytics tag.',
  },
  {
    q: 'What content should I feed it?',
    a: 'Anything that explains what you do: an about page, a product or service page, a blog post, your documentation. Around 200 words or more gives it enough to work from.',
  },
  {
    q: 'Can I edit the questions it writes?',
    a: 'Always. Treat the output as a strong first draft — copy it out, cut what doesn’t fit, and rewrite anything in your own words. The FAQs are yours to publish and use commercially.',
  },
  {
    q: 'Which languages does it support?',
    a: 'English, Spanish, French, German, Dutch, and Japanese, in a professional, casual, or authoritative tone. Pick once and the whole set matches.',
  },
];

export function SiteFaq() {
  return (
    <section id="faq" className="scroll-mt-24 bg-white px-5 py-20 sm:px-8 sm:py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
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

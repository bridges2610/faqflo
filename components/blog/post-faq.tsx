import { FaqItem } from '@/components/ui/faq-item';
import { jsonLd } from '@/lib/site';

/*
  An FAQ block for the end of a post, with its schema.

  Both the visible questions and the FAQPage JSON-LD come from one array, so
  the markup can never describe something different from what's on the page —
  which is the specific failure this product exists to fix.

  FaqItem is <details>-based, so every question and answer sits in the server
  HTML whether or not the item is open. That matters more than usual here: a
  post arguing that answers must be crawlable would be embarrassing if its own
  answers needed JavaScript to exist.

  Heading styles are inline rather than borrowed from post-prose. Components
  used directly inside MDX don't pass through the element map in
  mdx-components.tsx — only markdown-generated elements do — so this has to
  carry its own.
*/
export function PostFaq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <section className="border-line mt-14 border-t pt-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          // The < escape is Next's recommended guard for JSON-LD: it stops
          // a "</script>" inside any answer from closing the tag early. Every
          // answer here is a static literal today, but the array is the kind of
          // thing that eventually gets fed from elsewhere.
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: items.map((item) => ({
              '@type': 'Question',
              name: item.q,
              acceptedAnswer: { '@type': 'Answer', text: item.a },
            })),
          }).replace(/</g, '\\u003c'),
        }}
      />

      <h2 className="mb-1 text-[1.625rem] leading-snug text-balance">
        Frequently asked questions
      </h2>

      <div className="divide-line border-line mt-6 divide-y border-t">
        {items.map((item, i) => (
          <FaqItem key={item.q} question={item.q} answer={item.a} defaultOpen={i === 0} />
        ))}
      </div>
    </section>
  );
}

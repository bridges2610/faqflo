import Link from 'next/link';
import { Wordmark } from '@/components/ui/wordmark';

const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { href: '/#try', label: 'Free generator' },
      { href: '/#how', label: 'How it works' },
      { href: '/#pricing', label: 'Pricing' },
    ],
  },
  {
    heading: 'Learn',
    links: [
      { href: '/seo-guide', label: 'AI SEO guide' },
      { href: '/#aeo', label: "What's AEO" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-line border-t bg-white">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Wordmark />
            <p className="text-slate mt-4 text-sm leading-relaxed">
              Get your business listed on AI Search. Add your FAQs, paste one line, and let the answer
              engines do the rest.
            </p>
          </div>

          <div className="flex gap-14">
            {COLUMNS.map((col) => (
              <div key={col.heading}>
                <h2 className="font-display text-navy mb-3 text-sm font-bold">{col.heading}</h2>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-slate hover:text-primary text-sm transition-colors duration-150"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="border-line text-slate mt-12 border-t pt-6 text-xs">
          <span>&copy; {new Date().getFullYear()} FaqFlo. Made by Tenichi.</span>
        </div>
      </div>
    </footer>
  );
}

import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { Wordmark } from '@/components/ui/wordmark';

const LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#aeo', label: "What's AEO" },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/seo-guide', label: 'Guide' },
];

export function SiteNav() {
  return (
    <header className="border-line bg-cloud/85 sticky top-0 z-50 border-b backdrop-blur-md">
      <nav className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-6 px-5 sm:px-8">
        <Wordmark />

        <ul className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-slate hover:text-primary text-sm font-medium transition-colors duration-150"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <ButtonLink href="/#try" size="sm" arrow>
          Try it free
        </ButtonLink>
      </nav>
    </header>
  );
}

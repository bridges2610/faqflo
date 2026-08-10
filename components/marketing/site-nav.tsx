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

        {/*
          Until accounts existed, nothing on the marketing site linked to the
          app at all — /dashboard was reachable only by typing it. "Sign in" is
          a quiet text link rather than a second button because the primary
          action here is still the free check: the people who already have an
          account know what they came for, and the ones who don't shouldn't be
          asked to choose between two buttons.
        */}
        <div className="flex items-center gap-4 sm:gap-5">
          <Link
            href="/sign-in"
            className="text-slate hover:text-primary text-sm font-medium transition-colors duration-150"
          >
            Sign in
          </Link>
          <ButtonLink href="/#audit" size="sm" arrow>
            Check my site
          </ButtonLink>
        </div>
      </nav>
    </header>
  );
}

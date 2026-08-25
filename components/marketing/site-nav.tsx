import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { Wordmark } from '@/components/ui/wordmark';
import { NavAccountLink } from './nav-account-link';
import { MobileNav } from './mobile-nav';

const LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#aeo', label: "What's AEO" },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/seo-guide', label: 'Guide' },
];

/*
  Two more links, mobile only.

  Blog and About are footer links on desktop, where the footer is a known
  gesture away. On a phone the footer is the far end of a very long scroll, and
  the drawer is the only navigation there is — so it carries the fuller map.
  The desktop row is left at five: seven is where a horizontal strip of links
  starts to crowd, and a vertical drawer has room the strip does not.
*/
const MOBILE_LINKS = [
  ...LINKS,
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
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
          app at all — /dashboard was reachable only by typing it. It stays a
          quiet text link rather than a button: it is for people who already
          know what they came for, not an ask made of first-time visitors.

          It says "Dashboard" to somebody already signed in, decided in the
          browser so these pages stay prerendered — see NavAccountLink.

          Both of these are desktop-only. Below md they live at the foot of the
          drawer instead (see MobileNav), leaving the mobile header as just the
          wordmark and the menu button — the button in particular was the thing
          crowding a 375px row, and the hero CTA sits a few hundred pixels
          below it anyway.
        */}
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="hidden items-center gap-4 sm:gap-5 md:flex">
            <NavAccountLink />
            <ButtonLink href="/free-report" size="sm" arrow>
              Check my site
            </ButtonLink>
          </div>
          <MobileNav links={MOBILE_LINKS} />
        </div>
      </nav>
    </header>
  );
}

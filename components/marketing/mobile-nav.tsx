'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ButtonLink } from '@/components/ui/button';
import { CloseIcon, MenuIcon } from '@/components/ui/icons';
import { Wordmark } from '@/components/ui/wordmark';
import { NavAccountLink } from './nav-account-link';

/*
  The marketing nav below `md`.

  ⚠️ WHY THIS IS A SEPARATE FILE RATHER THAN STATE INSIDE SiteNav.

  SiteNav is a server component and the marketing pages are `○ Static` — see the
  long note in nav-account-link.tsx for why that matters. A `useState` in
  SiteNav itself would make the whole header a client component and ship the
  link list, the wordmark and the CTA to the browser twice. Keeping the toggle
  down here means only the drawer crosses the boundary.

  The panel is only mounted while open, which also means the second
  NavAccountLink inside it opens its Supabase subscription only while somebody
  is actually looking at the menu.
*/

type NavLink = { href: string; label: string };

export function MobileNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // A route change closes the drawer, so it never covers the page it just
  // navigated to. This does NOT cover the hash links (/#pricing and friends) —
  // those leave `pathname` untouched, which is why every link below also closes
  // on click.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;

    // Escape closes it — it's a modal overlay, and modal overlays that trap you
    // until you find the X are a bug.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);

    // Without this the page scrolls behind the drawer while it's open, which
    // reads as the site coming apart.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus lands inside the drawer on open and comes back to the hamburger on
    // close, so a keyboard or screen-reader user isn't left tabbing through the
    // page hidden behind it.
    closeRef.current?.focus();

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  /*
    ⚠️ THE DRAWER IS PORTALLED TO <body>, AND IT HAS TO BE.

    SiteNav's header carries `backdrop-blur-md`, and an ancestor with a
    backdrop-filter becomes the containing block for its `position: fixed`
    descendants. Rendered in place, `fixed inset-0` therefore resolves against
    the 73px-tall header rather than the viewport: the scrim covers only the
    header strip and the panel is a stub hanging off the top-right corner.
    Escaping to <body> is what makes a full-height drawer possible at all.

    z-[60] rather than z-50 because out here it is a sibling of the header
    instead of a child, so it no longer inherits the header's stacking context
    and has to outrank it on its own.
  */
  const drawer = (
    <div className="fixed inset-0 z-[60] md:hidden">
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Close menu"
        className="bg-navy/40 absolute inset-0 backdrop-blur-[2px]"
      />

      {/*
        From the right, not the left like the dashboard drawer: the trigger is
        on the right here, and a panel should arrive from the edge it was
        tapped on.
      */}
      <div
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        className="shadow-lift absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white p-5"
      >
        <div className="flex items-center justify-between">
          <Wordmark className="text-[1.25rem]" />
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="text-slate hover:text-navy rounded-full p-1.5"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <ul className="mt-6 flex flex-col">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-navy hover:text-primary block py-3 text-base font-medium transition-colors duration-150"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/*
          Both of these are in the header on desktop and only down here below
          md, where the header is kept to the wordmark and this menu. Somebody
          who opens the menu looking for the free check should find it, rather
          than be sent back out to hunt the page for it.
        */}
        <div className="border-line mt-auto flex flex-col gap-4 border-t pt-5">
          <NavAccountLink />
          <ButtonLink
            href="/free-report"
            size="sm"
            shape="pill"
            arrow
            onClick={() => setOpen(false)}
            className="w-full"
          >
            Check my site
          </ButtonLink>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="text-slate hover:text-navy border-line rounded-input border bg-white p-2 md:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      {open ? createPortal(drawer, document.body) : null}
    </>
  );
}

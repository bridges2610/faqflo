import Link from 'next/link';
import { Wordmark } from '@/components/ui/wordmark';

const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { href: '/#audit', label: 'Free visibility check' },
      { href: '/#try', label: 'Free generator' },
      { href: '/#how', label: 'How it works' },
      { href: '/#pricing', label: 'Pricing' },
      /*
        ⚠️ NO "Done for you" LINK HERE, AND IT WAS REMOVED RATHER THAN NEVER
        ADDED. That service is only offered to people who already pay for Get
        Cited — its page opens by assuming the reader has it and never
        mentions the $129 — so surfacing it in a footer that renders on every
        marketing page puts it in front of exactly the audience it is not
        written for. It lives in the dashboard instead. See the note at the
        top of app/(marketing)/done-for-you/page.tsx.
      */
    ],
  },
  {
    heading: 'Learn',
    links: [
      { href: '/blog', label: 'Blog' },
      { href: '/seo-guide', label: 'SEO guide' },
      { href: '/#aeo', label: "What's AEO" },
    ],
  },
  {
    heading: 'Company',
    links: [{ href: '/about', label: 'About' }],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-line border-t bg-white">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        {/*
          Four even-ish tracks rather than brand-left / links-right. With
          justify-between the whole link group got pushed against the right
          edge and bunched there, which only got worse as columns were added.
          The brand takes 1.5fr — about 20rem, the width its blurb already
          asks for — and the three link columns split the rest evenly.
        */}
        <div className="flex flex-col gap-10 sm:grid sm:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] sm:gap-10">
          <div className="max-w-xs">
            <Wordmark />
            <p className="text-slate mt-4 text-sm leading-relaxed">
              Get your business cited by AI. Check what the engines can see, publish answers they can
              quote, and track whether they start naming you.
            </p>
          </div>

          {/*
            sm:contents dissolves this wrapper into the grid above, so each
            column gets its own track instead of all three sharing one. Below
            sm it stays a real box: a wrapping row under the blurb, which is
            what phones already had — without it they'd each become a stacked
            block and the footer would grow a screenful taller.

            Safe on a plain div: the display:contents accessibility bug only
            ever affected elements carrying an implicit ARIA role.
          */}
          <div className="flex flex-wrap gap-x-14 gap-y-8 sm:contents">
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

        {/* Legal links live down here rather than in a fourth column: the grid
            above is fixed at three link tracks, and this is where people look
            for them anyway. flex-wrap so the two don't collide on a phone. */}
        <div className="border-line text-slate mt-12 flex flex-wrap items-center justify-between gap-4 border-t pt-6 text-xs">
          <span>&copy; {new Date().getFullYear()} FaqFlo. Made by Tenichi.</span>
          {/* Grouped, not two more children of the justify-between row — three
              siblings would spread copyright / Privacy / Terms edge to edge. */}
          <span className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/privacy" className="hover:text-primary transition-colors duration-150">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-primary transition-colors duration-150">
              Terms &amp; Conditions
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

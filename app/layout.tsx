import type { Metadata, Viewport } from 'next';
import { SITE_URL } from '@/lib/site';
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import Script from 'next/script';
import { ThemeScript } from '@/components/dashboard/theme';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

/*
  ⚠️ NOT PRELOADED, AND IT IS THE ONLY ONE OF THE THREE THAT ISN'T. Three
  families preload four files — 118KB measured over the wire — into the window
  that decides when the hero paints. The mono face is the one the page can
  afford to wait for: its only above-the-fold use is the source chip in
  components/marketing/hero.tsx, which is `blur-[3px]` and decorative, so the
  `display: swap` below lands on text nobody can read anyway.

  ⚠️ preload: false IS NOT "do not load". The file is still fetched the moment
  something needs it; it just stops competing with the two faces the LCP text
  actually renders in. Do not "fix" this by removing the line.
*/
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
  preload: false,
});

const GA_ID = 'G-7JX690DTV7';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'FaqFlo — Get your business cited by AI',
    template: '%s — FaqFlo',
  },
  /*
    ⚠️ TWO DIFFERENT LISTS ON PURPOSE, AND THEY MUST NOT BE MERGED BACK.

    This used to name "ChatGPT, Perplexity and Google AI Overviews" once and
    then say "track whether THEY start citing you" — which promised tracking of
    AI Overviews, and that has no API for anyone. Readability is about crawlers
    generally, so it stays broad; tracking names the three engines we actually
    ask. See the warning on ENGINES in lib/dashboard/types.ts.

    ⚠️ AND IT IS 150 CHARACTERS, BECAUSE THE LENGTH IS A RULE WE ENFORCE ON
    OTHER PEOPLE. It was 199. Our own `meta-length` check warns a customer whose
    descriptions fall outside 70–160, and this is the description every page
    inherits unless it sets its own — so the site selling that check was failing
    it site-wide. Keep any rewrite inside the window.
  */
  description:
    'See whether AI assistants can read your site, publish answers they can quote on your own domain, and track if ChatGPT, Perplexity and Gemini cite you.',
  // Favicon comes from app/icon.svg (the new bubble mark) — Next picks that up
  // automatically, so there's no `icons` entry pointing at the old PNG.
  openGraph: {
    type: 'website',
    siteName: 'FaqFlo',
    url: SITE_URL,
    title: 'FaqFlo — Get your business cited by AI',
    description:
      'Find out what AI can see on your site, publish answers it can quote, and track the citations.',
    /*
      ⚠️ THE DEFAULT SHARE IMAGE, AND WITHOUT IT `open-graph` ONLY EVER WARNED.

      That check wants og:title, og:description AND og:image; we had two of
      three site-wide. Resolved against metadataBase, so the relative path
      becomes absolute in the rendered tag — which is what every scraper
      requires and the reason metadataBase exists.

      Blog posts override this with their own featured image in
      generateMetadata; everything else shares this one.
    */
    images: [{ url: '/blog/faqflo-for-business-owners.png', width: 2400, height: 1350 }],
  },
  /*
    ⚠️ There was no twitter block anywhere in the codebase. X falls back to
    Open Graph when this is absent, but only as a small square card — the
    large-image card has to be asked for by name, and the image is already
    the right shape for it.
  */
  twitter: {
    card: 'summary_large_image',
    title: 'FaqFlo — Get your business cited by AI',
    description:
      'Find out what AI can see on your site, publish answers it can quote, and track the citations.',
    images: ['/blog/faqflo-for-business-owners.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#f6f8fc',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${inter.variable} ${jetbrains.variable}`}
    >
      {/*
        suppressHydrationWarning is here for browser extensions, not for our own
        markup. Grammarly and friends stamp attributes onto <body> (
        data-gr-ext-installed, data-new-gr-c-s-check-loaded) before React
        hydrates, so the client element carries attributes the server never
        sent. Nothing we render is variable.

        It applies to this element only and one level deep — it does NOT
        silence real mismatches inside the app, which is why it belongs on
        <body> and nowhere else.
      */}
      <body className="flex min-h-dvh flex-col" suppressHydrationWarning>
        {/*
          ⚠️ BEFORE {children}, AND IN THE ROOT LAYOUT RATHER THAN THE (app) ONE.

          It sets the dashboard's dark attribute at parse time so a dark-mode
          customer never gets a white first frame. Rendered from
          app/(app)/layout.tsx it drew a React warning — "scripts inside React
          components are never executed when rendering on the client" — because a
          NESTED layout renders on the client when you soft-navigate into it, and
          an inert script tag cannot prevent a flash. This layout is only ever
          server-rendered.

          It is site-wide by position and dashboard-only by behaviour: the script
          returns immediately unless the path is under /dashboard. Marketing has
          no dark palette, so that check is what keeps it light.

          ⚠️ NOT next/script. The docs require `beforeInteractive` to live in this
          file — which it does — but state its execution "does not block page
          hydration", and the guarantee needed here is "runs at parse position".
          A plain tag at a known position gives exactly that.
        */}
        <ThemeScript />
        {children}
        {/*
          ⚠️ lazyOnload, NOT afterInteractive, AND IT IS THE BIGGEST THING ON THE
          PAGE. Measured on production under mobile emulation (Moto G4, 4x CPU,
          ~1.6Mbps): gtag is 170KB of a 588KB page — 29% of everything
          transferred, and 2.4x the next-heaviest file. afterInteractive starts
          it as hydration begins, which is exactly the window that decides when
          the hero paints, and the LCP element here is text with no image ahead
          of it. Idle-after-load is where a third-party tag belongs.

          ⚠️ THE TRADE IS REAL AND WAS ACCEPTED: somebody who bounces inside the
          first second or so may go uncounted, so reported traffic can dip. That
          is a change to measurement, not to the site.

          ⚠️ BOTH TAGS MOVE TOGETHER OR NEITHER DOES. The init script below
          calls gtag('config'); leaving it afterInteractive while the library
          goes lazy would run it before gtag exists.

          ⚠️ NOT strategy="worker". next/dist/docs is explicit that Partytown
          "is not yet stable and does not yet work with the App Router".
        */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="lazyOnload"
        />
        <Script id="ga-init" strategy="lazyOnload">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
        </Script>
      </body>
    </html>
  );
}

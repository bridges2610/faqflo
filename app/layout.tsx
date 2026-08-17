import type { Metadata, Viewport } from 'next';
import { SITE_URL } from '@/lib/site';
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import Script from 'next/script';
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

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
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
        {children}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
        </Script>
      </body>
    </html>
  );
}

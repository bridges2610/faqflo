import type { Metadata, Viewport } from 'next';
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
  metadataBase: new URL('https://www.faqflo.com'),
  title: {
    default: 'FaqFlo — Get your business listed on AI Search',
    template: '%s — FaqFlo',
  },
  description:
    'Add your FAQs, paste one line of code, and get your answers in front of people asking Google and AI assistants. Free FAQ generator, no signup.',
  // Favicon comes from app/icon.svg (the new bubble mark) — Next picks that up
  // automatically, so there's no `icons` entry pointing at the old PNG.
  openGraph: {
    type: 'website',
    siteName: 'FaqFlo',
    title: 'FaqFlo — Get your business listed on AI Search',
    description:
      'Add your FAQs, paste one line of code, and get found by Google and AI assistants.',
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
      <body className="flex min-h-dvh flex-col">
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

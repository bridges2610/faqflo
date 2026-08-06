import type { Metadata } from 'next';
import { AppShell } from '@/components/dashboard/app-shell';
import { DashboardProvider } from '@/lib/dashboard/provider';

/*
  The app shell — deliberately not the marketing layout.

  SiteNav and SiteFooter exist to sell the product: sticky marketing links, a
  pricing anchor, a footer full of outbound routes. None of that belongs around
  a screen someone is working in, so the (app) group gets its own chrome.
*/
export const metadata: Metadata = {
  title: 'Dashboard',
  // A signed-in surface has nothing to offer a crawler, and its URLs shouldn't
  // compete with the marketing pages in search results.
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <AppShell>{children}</AppShell>
    </DashboardProvider>
  );
}

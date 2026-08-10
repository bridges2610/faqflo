import type { Metadata } from 'next';

/*
  Sign-in, sign-up and the password screens.

  Their own route group because they belong to neither of the others: the
  marketing nav invites you to read about the product, which is noise when you
  are trying to get into it, and the dashboard shell is chrome for a site you
  have not been let into yet.

  Same robots rule as (app), for the same reason its layout gives — these pages
  have nothing to offer a crawler, and a sign-in form in search results is a
  phishing target more than a landing page.
*/
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-5 py-12 sm:px-8">
      {children}
    </main>
  );
}

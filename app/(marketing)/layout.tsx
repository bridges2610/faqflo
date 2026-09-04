import { BusyButton } from '@/components/marketing/busy-button';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteNav } from '@/components/marketing/site-nav';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteNav />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      {/* ⚠️ HERE RATHER THAN ON THE HOME PAGE, because "public facing pages" is
          all of them: this group wraps the 9 marketing routes AND every blog
          post, so a reader who arrives on an article gets the same twenty-second
          answer a reader who arrives on the home page does. It is deliberately
          NOT in the (app) group — a signed-in customer is not the audience. */}
      <BusyButton />
    </>
  );
}

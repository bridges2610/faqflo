import type { Metadata } from 'next';
import { AuthCard, AuthLink, OrDivider } from '@/components/auth/auth-card';
import { GoogleButton } from '@/components/auth/google-button';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { safeNext } from '@/lib/auth/origin';

export const metadata: Metadata = { title: 'Create an account' };

/*
  ⚠️ THIS PAGE SITS IN THE MIDDLE OF A PURCHASE, AND USED TO FORGET IT.

  Somebody who scanned their site and clicked "Get set up" arrives here with a
  destination attached: the checkout page, carrying the domain they typed on
  the home page. None of that survived — the page took no searchParams, so the
  Google button, the form and the confirmation email all had nowhere to go
  except /dashboard. They paid attention, we lost the thread, and they landed
  on an empty dashboard with no memory of what they had asked for.

  Every branch out of this page now carries `next`. It is validated by
  safeNext() rather than trusted, here AND again in the action, because it
  arrives from a URL and passes through a user-editable hidden field.
*/
export default async function SignUpPage({
  searchParams,
}: {
  // Async in Next 16 — the synchronous form was removed, not just deprecated.
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next, '');

  return (
    <AuthCard
      title="Create an account"
      intro="Set your site up to be quoted by AI assistants."
      footer={
        <>
          Already have an account?{' '}
          {/* Carries the destination too — a returning customer clicking this
              mid-purchase must not be dropped any more than a new one. */}
          <AuthLink href={next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'}>
            Sign in
          </AuthLink>
        </>
      }
    >
      <GoogleButton label="Continue with Google" next={next || undefined} />
      <OrDivider />
      <SignUpForm next={next || undefined} />

      {/*
        ⚠️ THE "run it without an account" LINE WAS HERE, AND ITS REMOVAL WAS
        DELIBERATE. It read "Just want the free check? Run it without an
        account", and its note argued that the marketing pages promise an
        account-free check in five places, so saying so here stopped the form
        reading as a wall in front of something advertised as open.

        That argument is still true; it was outweighed. This page is the last
        step of the funnel, and an escape hatch at the final prompt is an offer
        to not finish. Somebody who wants the account-free version still meets
        it everywhere it is advertised — site-footer.tsx, final-cta.tsx,
        mobile-nav.tsx, hero.tsx, the SEO guide and the done-for-you page all
        link /free-report, and it stays in the sitemap. Nothing is stranded;
        the offer simply is not repeated at the point of signing up.
      */}
    </AuthCard>
  );
}

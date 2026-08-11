import type { Metadata } from 'next';
import { AuthCard, AuthLink, OrDivider } from '@/components/auth/auth-card';
import { GoogleButton } from '@/components/auth/google-button';
import { SignInForm } from '@/components/auth/sign-in-form';
import { safeNext } from '@/lib/auth/origin';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  // Async in Next 16 — the synchronous form was removed, not just deprecated.
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  // Where proxy.ts sent them from, so they resume where they were going.
  // Sanitised here as well as in the action: this value reaches an <a>-shaped
  // redirect, and an unchecked one is an open redirect.
  const next = safeNext(params.next, '');

  return (
    <AuthCard
      title="Sign in"
      intro="Pick up where you left off."
      footer={
        <>
          New here?{' '}
          {/* ⚠️ Carries `next`. Without it this link was where the email
              sign-up path died: a first-time buyer arrived here mid-purchase,
              clicked through to create an account, and silently lost both the
              checkout destination and the domain they had just scanned. */}
          <AuthLink href={next ? `/sign-up?next=${encodeURIComponent(next)}` : '/sign-up'}>
            Create an account
          </AuthLink>
        </>
      }
    >
      {/* Errors handed back by /auth/callback — an expired link, or Google
          refused. Shown above everything because it explains why you're here. */}
      {params.error && (
        <p role="alert" className="text-error-ink mb-5 text-sm">
          {params.error}
        </p>
      )}

      <GoogleButton label="Continue with Google" next={next || undefined} />
      <OrDivider />
      <SignInForm next={next || undefined} />
    </AuthCard>
  );
}

import type { Metadata } from 'next';
import { AuthCard, AuthLink } from '@/components/auth/auth-card';

export const metadata: Metadata = { title: 'Check your email' };

/**
 * The dead end between signing up and being signed in.
 *
 * It exists because "verify before access" means there is a real gap where the
 * account exists but the session does not, and a form that just cleared itself
 * with no explanation reads as a failure.
 */
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;
  const isReset = reset === '1';

  return (
    <AuthCard
      title={isReset ? 'Check your email' : 'Confirm your email'}
      intro={
        isReset
          ? // Deliberately conditional: we never confirmed the address exists,
            // because saying so would let anyone test who has an account here.
            'If that address has an account, we have sent it a link for setting a new password. It expires in an hour.'
          : 'We have sent you a link. Click it and you will be signed in — until then the account is not active.'
      }
      footer={<AuthLink href="/sign-in">Back to sign in</AuthLink>}
    >
      <p className="text-slate text-sm leading-relaxed">
        Nothing yet? Give it a minute, then check your spam folder — confirmation mail lands
        there more often than it should.
      </p>
    </AuthCard>
  );
}

import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/auth-card';
import { ResetPasswordForm } from '@/components/auth/password-forms';

export const metadata: Metadata = { title: 'Set a new password' };

/**
 * Where the reset link lands, after /auth/callback has traded it for a session.
 *
 * Not listed in proxy.ts's AUTH_ONLY set, deliberately: by the time someone
 * reaches this page they ARE signed in, on a recovery session, and the rule
 * that bounces signed-in users away from auth pages would bounce them off the
 * one page they were sent here to use.
 */
export default function ResetPasswordPage() {
  return (
    <AuthCard title="Set a new password" intro="Choose something you haven't used here before.">
      <ResetPasswordForm />
    </AuthCard>
  );
}

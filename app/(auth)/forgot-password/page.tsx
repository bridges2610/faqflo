import type { Metadata } from 'next';
import { AuthCard, AuthLink } from '@/components/auth/auth-card';
import { ForgotPasswordForm } from '@/components/auth/password-forms';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      intro="Tell us the address you signed up with and we'll send you a link."
      footer={<AuthLink href="/sign-in">Back to sign in</AuthLink>}
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}

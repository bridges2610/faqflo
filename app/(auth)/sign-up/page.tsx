import type { Metadata } from 'next';
import { AuthCard, AuthLink, OrDivider } from '@/components/auth/auth-card';
import { GoogleButton } from '@/components/auth/google-button';
import { SignUpForm } from '@/components/auth/sign-up-form';

export const metadata: Metadata = { title: 'Create an account' };

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create an account"
      intro="Set your site up to be quoted by AI assistants."
      footer={<>Already have an account? <AuthLink href="/sign-in">Sign in</AuthLink></>}
    >
      <GoogleButton label="Continue with Google" />
      <OrDivider />
      <SignUpForm />

      {/* The free check needs no account, and the marketing page promises that
          in five places. Saying so here stops the form reading as a wall in
          front of something that was advertised as open. */}
      <p className="text-slate mt-5 text-xs leading-relaxed">
        Just want the free check? <AuthLink href="/#audit">Run it without an account</AuthLink>.
      </p>
    </AuthCard>
  );
}

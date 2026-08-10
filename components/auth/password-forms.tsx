'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { requestPasswordReset, updatePassword } from '@/lib/auth/actions';
import { NO_ERROR } from '@/lib/auth/form-state';
import { FIELD, FieldLabel } from './auth-card';

/*
  The two halves of a password reset.

  Present because a sign-in without one is a sign-in people get permanently
  locked out of, and "email us" is not a recovery flow.
*/

/** Ask for the link. */
export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, NO_ERROR);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <FieldLabel>Email</FieldLabel>
        <input
          className={FIELD}
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
        />
      </label>

      <Button type="submit" size="md" className="w-full" disabled={pending}>
        {pending ? 'Sending…' : 'Send me a reset link'}
      </Button>

      {state.error && (
        <p role="alert" className="text-error-ink text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}

/**
 * Set the new one.
 *
 * Reached only from the link in the email, which creates a recovery session on
 * the way through /auth/callback. The action re-checks that session exists —
 * without it, this page's URL alone would be enough to change a password.
 */
export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, NO_ERROR);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <FieldLabel>New password</FieldLabel>
        <input
          className={FIELD}
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <span className="text-slate mt-2 block text-xs">At least 8 characters.</span>
      </label>

      <label className="block">
        <FieldLabel>Confirm it</FieldLabel>
        <input
          className={FIELD}
          type="password"
          name="confirm"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </label>

      <Button type="submit" size="md" className="w-full" disabled={pending}>
        {pending ? 'Saving…' : 'Save new password'}
      </Button>

      {state.error && (
        <p role="alert" className="text-error-ink text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}

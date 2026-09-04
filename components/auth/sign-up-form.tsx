'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { signUpWithEmail } from '@/lib/auth/actions';
import { NO_ERROR } from '@/lib/auth/form-state';
import { FIELD, FieldLabel } from './auth-card';
import { PasswordField } from './password-field';

/**
 * Name, email, password.
 *
 * Name is asked for because the account menu and the emails both read badly
 * without one, and guessing it from the address gives people "j.smith84".
 * It rides along in the signup metadata and the database trigger reads it, so
 * an email account and a Google account end up with the same shape of profile.
 */
export function SignUpForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signUpWithEmail, NO_ERROR);

  return (
    <form action={formAction} className="space-y-4">
      {/* Where to land afterwards — for this form that means the link in the
          confirmation email, not an immediate redirect, since there is no
          session until it is clicked. Validated server-side by safeNext(): a
          hidden field is user-editable, so it can't be trusted from here.
          Mirrors sign-in-form.tsx. */}
      {next && <input type="hidden" name="next" value={next} />}

      <label className="block">
        <FieldLabel>Your name</FieldLabel>
        <input className={FIELD} type="text" name="name" autoComplete="name" required />
      </label>

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

      {/* The hint is stated up front. A rule you only meet by breaking it
          wastes a submit. */}
      <PasswordField
        label="Password"
        name="password"
        autoComplete="new-password"
        minLength={8}
        hint="At least 8 characters."
      />

      <Button type="submit" size="md" className="w-full" disabled={pending}>
        {pending ? 'Creating your account…' : 'Create account'}
      </Button>

      {state.error && (
        <p role="alert" className="text-error-ink text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}

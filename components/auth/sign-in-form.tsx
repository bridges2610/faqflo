'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { signInWithEmail } from '@/lib/auth/actions';
import { NO_ERROR } from '@/lib/auth/form-state';
import { AuthLink, FIELD, FieldLabel } from './auth-card';

/**
 * Email and password.
 *
 * `useActionState` gives the pending flag and the returned error without a
 * `useState` pair or a client-side fetch, and the form still submits without
 * JavaScript. That last part is worth having on the one screen where a person
 * is locked out until it works.
 */
export function SignInForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signInWithEmail, NO_ERROR);

  return (
    <form action={formAction} className="space-y-4">
      {/* Where to land afterwards. Validated server-side by safeNext() — a
          hidden field is user-editable, so it can't be trusted from here. */}
      {next && <input type="hidden" name="next" value={next} />}

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

      <label className="block">
        <FieldLabel>Password</FieldLabel>
        <input
          className={FIELD}
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </label>

      <Button type="submit" size="md" className="w-full" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>

      {state.error && (
        <p role="alert" className="text-error-ink text-sm">
          {state.error}
        </p>
      )}

      <p className="text-slate text-sm">
        <AuthLink href="/forgot-password">Forgotten your password?</AuthLink>
      </p>
    </form>
  );
}

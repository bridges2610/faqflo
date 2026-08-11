'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { AuthState } from './form-state';
import { safeNext, siteOrigin } from './origin';

/**
 * The email half of authentication.
 *
 * Server Actions rather than route handlers, so the forms work before
 * JavaScript loads and there is no client-side fetch to get wrong. Each takes
 * `(prevState, formData)` because that is the signature `useActionState`
 * imposes, and each RE-CHECKS whatever it needs rather than trusting proxy.ts
 * — Next's docs warn that a Server Function is a POST to the page it lives on,
 * so a matcher change can silently remove proxy coverage from it.
 *
 * Errors are returned, not thrown. The Next guide is explicit about this for
 * expected failures: "avoid using try/catch blocks and throw errors. Instead,
 * model expected errors as return values." A wrong password is expected.
 *
 * `redirect()` is always called OUTSIDE try/catch — it works by throwing, so a
 * catch block swallows the navigation and the user sits on a form that
 * silently succeeded.
 */

/*
  ⚠️ Everything exported from this file must be an `async function`.

  `'use server'` turns each export into a server action — a POST endpoint
  reachable by anyone — so Next rejects any other kind of export outright:
  "A 'use server' file can only export async functions, found object."

  That is not a lint preference; it is the module's contract. `AuthState` and
  `NO_ERROR` used to live here and broke the dashboard the first time anyone
  rendered it signed in. They are in ./form-state now. Shared values go there.
*/

/**
 * Eight, not Supabase's default six.
 *
 * Stated in the form as well, because a rule the user only discovers by
 * breaking it is a rule that wastes their time.
 */
const MIN_PASSWORD = 8;

/** Deliberately loose. The confirmation email is the real check. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/* ------------------------------------------------------------- sign up --- */

export async function signUpWithEmail(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const name = field(formData, 'name');
  const email = field(formData, 'email');
  // Not trimmed — a leading or trailing space is a legitimate password
  // character, and silently removing it means they can never sign in again.
  const password = String(formData.get('password') ?? '');

  if (!name) return { error: 'Tell us your name.' };
  if (!looksLikeEmail(email)) return { error: 'Enter a valid email address.' };
  if (password.length < MIN_PASSWORD) {
    return { error: `Use a password of at least ${MIN_PASSWORD} characters.` };
  }

  const supabase = await createClient();
  const origin = await siteOrigin();

  /*
    The destination has to survive a round trip through an email client.

    Someone signing up mid-purchase came here from checkout, carrying the
    domain they scanned on the home page. There is no session yet, so we cannot
    redirect them anywhere — the only thing that will bring them back is the
    link in the confirmation mail, which means the destination has to be baked
    into that link or it is gone.

    Re-validated with safeNext() even though the page already did: this arrives
    from a hidden form field, which anybody can edit.
  */
  const next = safeNext(field(formData, 'next') || null, '');
  const callback = next
    ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
    : `${origin}/auth/callback`;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      /*
        Where the confirmation link lands. Until it's clicked there is no
        session, which is what makes "verify before access" true rather than
        merely displayed.

        ⚠️ Supabase SILENTLY IGNORES a value that is not in the project's
        redirect allow-list and falls back to Site URL. Nothing errors — the
        customer just lands on the home page instead of checkout. If that
        happens, the allow-list is what to check, not this line. `/**` matches
        a query string; `/*` does not.
      */
      emailRedirectTo: callback,
      // Read by the signup trigger in supabase/migrations/0001, so an email
      // account gets a name the same way a Google one does.
      data: { full_name: name },
    },
  });

  if (error) return { error: humanise(error.message) };

  // Carried so /check-email's way back doesn't strand somebody mid-purchase.
  redirect(next ? `/check-email?next=${encodeURIComponent(next)}` : '/check-email');
}

/* ------------------------------------------------------------- sign in --- */

export async function signInWithEmail(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = field(formData, 'email');
  const password = String(formData.get('password') ?? '');
  const next = safeNext(field(formData, 'next') || null);

  if (!email || !password) return { error: 'Enter your email address and password.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    /*
      One message for both "no such account" and "wrong password", on purpose.
      Distinguishing them turns the sign-in form into a way to ask whether a
      given person has an account here, which is not ours to answer.
    */
    return { error: 'That email and password do not match an account.' };
  }

  redirect(next);
}

/* ------------------------------------------------------ password reset --- */

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = field(formData, 'email');
  if (!looksLikeEmail(email)) return { error: 'Enter a valid email address.' };

  const supabase = await createClient();
  const origin = await siteOrigin();

  /*
    The result is ignored deliberately. Reporting "no account with that email"
    would let anyone enumerate who has signed up. The page says "if that
    address has an account, we've sent a link" either way.
  */
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  redirect('/check-email?reset=1');
}

export async function updatePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (password.length < MIN_PASSWORD) {
    return { error: `Use a password of at least ${MIN_PASSWORD} characters.` };
  }
  if (password !== confirm) return { error: 'Those two passwords do not match.' };

  const supabase = await createClient();

  /*
    This is the check that makes the reset link a credential rather than a
    guess. The recovery link created a session; without one, this is somebody
    hitting the URL directly and must not be able to set a password.
  */
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    return { error: 'That reset link has expired. Request a new one.' };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: humanise(error.message) };

  redirect('/dashboard');
}

/* -------------------------------------------------------------- sign out --- */

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

/**
 * Supabase's messages are written for developers.
 *
 * Only the ones a person can act on are rewritten; anything unrecognised is
 * passed through rather than replaced with a generic line, because a vague
 * message on an unexpected failure is what makes a bug unreportable.
 */
function humanise(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return 'There is already an account with that email. Try signing in instead.';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return "That's too many attempts for now. Wait a minute and try again.";
  }
  if (lower.includes('password')) return message;

  return message;
}

/**
 * The shape an auth form's state takes, and its starting value.
 *
 * Deliberately NOT in lib/auth/actions.ts. That file carries `'use server'`,
 * which makes every one of its exports a server action — an endpoint anyone
 * can POST to — so Next allows it to export nothing but async functions. A
 * constant there is a build error at best, and at worst it suggests a shared
 * value is an endpoint, which it is not.
 *
 * A single error string rather than per-field errors, matching the rest of the
 * app: site-form.tsx and group-form.tsx both hold one `error` and render it in
 * one `role="alert"` line. Auth forms have two or three fields; a per-field map
 * would be more machinery than the screens can use.
 */
export type AuthState = { error: string | null };

/** Nothing has gone wrong yet — the initial state for every useActionState. */
export const NO_ERROR: AuthState = { error: null };

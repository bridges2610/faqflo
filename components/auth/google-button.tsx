'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

/**
 * Continue with Google.
 *
 * A Client Component because `signInWithOAuth` needs to redirect the browser
 * to Google, which a Server Action can't do — the PKCE code verifier is
 * generated and stored client-side, and the callback route later trades it for
 * a session.
 *
 * Deliberately identical on both screens. To Google there is no difference
 * between signing up and signing in — the first time creates the account, and
 * every time after finds it — so offering two different buttons would invent a
 * choice the user can get wrong.
 */
export function GoogleButton({
  label,
  next,
}: {
  label: string;
  /** Where to land afterwards, preserved through the round trip. */
  next?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    setBusy(true);

    try {
      const supabase = createClient();
      const callback = new URL('/auth/callback', window.location.origin);
      if (next) callback.searchParams.set('next', next);

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callback.toString() },
      });

      // On success the browser is already navigating away; only a failure to
      // start the handshake lands back here.
      if (oauthError) {
        setError('Could not reach Google. Try again, or use your email address.');
        setBusy(false);
      }
    } catch {
      setError('Could not reach Google. Try again, or use your email address.');
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="md" className="w-full" onClick={signIn} disabled={busy}>
        <GoogleMark />
        {busy ? 'Taking you to Google…' : label}
      </Button>
      {error && (
        <p role="alert" className="text-error-ink mt-3 text-sm">
          {error}
        </p>
      )}
    </>
  );
}

/** Google's mark, in its own colours — it must not be recoloured. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

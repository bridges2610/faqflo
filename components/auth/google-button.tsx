'use client';

import { useState } from 'react';
import { GoogleMark } from '@/components/ui/ai-marks';
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
      <Button
      variant="ghost"
      size="md"
     
      className="w-full"
      onClick={signIn}
      disabled={busy}
    >
        <GoogleMark className="h-4 w-4" />
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

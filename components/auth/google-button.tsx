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
 *
 * ⚠️ "TO CONTINUE TO <project-ref>.supabase.co" IS NOT SET FROM THIS FILE, AND
 * THIS IS WHERE PEOPLE COME LOOKING FOR IT. Google's account chooser renders
 * that line from the OAuth client's own consent-screen configuration in Google
 * Cloud Console, and the host it falls back to is the client's registered
 * redirect URI — which belongs to Supabase
 * (https://<project-ref>.supabase.co/auth/v1/callback), not to us.
 *
 * The `redirectTo` passed below is a different thing entirely: it is where
 * SUPABASE returns the browser once Google is done. Google never sees it, so
 * changing it cannot change that line.
 *
 * Two levers, neither of them code:
 *   1. Google Cloud Console → OAuth consent screen → App name, logo, authorized
 *      domains. Free, and often enough on its own.
 *   2. If Google keeps showing the raw host: it requires the redirect URI's
 *      domain to be an AUTHORIZED domain, and nobody can verify ownership of
 *      supabase.co. That needs a Supabase custom domain (a paid add-on) so the
 *      callback lives on a domain we do own — at which point
 *      NEXT_PUBLIC_SUPABASE_URL changes too. See the note beside it in
 *      .env.example.
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

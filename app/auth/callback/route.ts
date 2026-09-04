import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth/origin';

/**
 * Where every route into an account converges.
 *
 * Three things land here, and they are the same exchange:
 *   - Google, after the OAuth handshake
 *   - the confirmation link from an email sign-up
 *   - the recovery link from a password reset (with ?next=/reset-password)
 *
 * PKCE means the provider hands back a short-lived `code` rather than a
 * session. exchangeCodeForSession trades it, and the cookies land via the
 * server client's setAll. Until this runs there is no session — which is
 * exactly why an unconfirmed email account cannot reach the dashboard.
 *
 * Not under app/(auth)/ deliberately: this is a machine endpoint with no UI,
 * and putting it inside a route group with a layout would wrap a redirect in
 * page chrome nobody sees.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));

  /*
    Providers report refusals here too — the user closing Google's consent
    screen arrives as `error=access_denied`. Landing them back on sign-in with
    a readable message beats a blank page or a redirect loop.
  */
  const providerError = searchParams.get('error_description') ?? searchParams.get('error');
  if (providerError) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(providerError)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent('That sign-in link was incomplete. Try again.')}`,
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    /*
      Overwhelmingly this is an expired or already-used link — confirmation
      emails get clicked twice, and prefetchers click them once first. Say what
      to do rather than what went wrong.
    */
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent('That link has expired or was already used. Try signing in.')}`,
    );
  }

  /*
    ⚠️ THE WELCOME EMAIL USED TO BE SENT FROM HERE, AND IT MOVED ON PURPOSE.

    Signing in fired `welcomeOnce()` in an after(), and the first scan then sent
    a second mail a minute or two later — two emails almost back to back, the
    first of which could only say "your account is ready" because nothing had
    been measured yet.

    There is one now, sent when the first scan finishes, from
    announceIfFirst() in app/api/scan/tick/route.ts. It still claims through
    welcomed_at, so it is still once per account ever; it just waits until it
    has something to tell them.

    This route is the only way into an account, so having one less thing that
    can throw in it is a bonus rather than a cost.
  */

  return NextResponse.redirect(`${origin}${next}`);
}

import { NextResponse, after, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth/origin';
import { welcomeOnce } from '@/lib/email/welcome';

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
    The welcome email, after the response rather than before it.

    after() runs once the redirect has already been sent, so signing in never
    waits on Resend and a mail outage cannot turn a successful sign-in into an
    error page. That matters more than it sounds: this route is the ONLY way
    into an account, so anything that can throw here can lock everybody out.

    welcomeOnce() is safe to call on every sign-in — it claims the send in the
    database and does nothing if somebody already has. This route runs on every
    returning visit too, which is exactly why that guard lives there and not in
    a condition here.
  */
  const user = data?.user;
  if (user) {
    after(async () => {
      try {
        await welcomeOnce(user.id);
      } catch (err) {
        // Belt and braces: welcomeOnce already swallows send failures, so
        // reaching this means something unexpected. Still must not escape —
        // an unhandled rejection in after() is a logged crash for a courtesy.
        console.error('Welcome email failed after sign-in:', err);
      }
    });
  }

  return NextResponse.redirect(`${origin}${next}`);
}

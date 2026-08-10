/**
 * The two values every Supabase client needs.
 *
 * Read through here rather than inline so a missing key fails with a sentence
 * that says what to do, at the point of use, rather than as
 * "Cannot read properties of undefined" three frames deeper. The API routes
 * already do this for ANTHROPIC_API_KEY; same idea, same reason.
 *
 * Both are NEXT_PUBLIC_ on purpose: the anon key is designed to ship to the
 * browser, and row-level security — not secrecy — is what keeps it safe. If
 * you find yourself wanting to hide it, the thing that actually needs fixing
 * is a missing RLS policy.
 */

export function supabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env and set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from your project settings.',
    );
  }

  return { url, key };
}

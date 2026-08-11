import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { trySendEmail } from './client';
import { welcomeEmail } from './templates';

/**
 * Send the welcome email, at most once per account, ever.
 *
 * Called from /auth/callback, which runs on EVERY sign-in — Google, the
 * confirmation link, a password reset, and every returning visit after that.
 * So "have we already done this?" cannot be answered by the caller; it has to
 * be answered by the database, atomically, or a frequent signer-in gets a
 * welcome email a week.
 *
 * Claim-then-send. The update is the lock: whoever's UPDATE returns a row owns
 * the send, and every other caller gets nothing back and stops.
 *
 * ⚠️ THE TRADE-OFF, STATED: claiming first means a send that fails afterwards
 * is never retried — that person simply gets no welcome. The alternative,
 * send-then-mark, re-sends on every transient network failure. One missing
 * welcome is a non-event; three identical ones is a complaint. If this ever
 * needs to be reliable rather than best-effort, it wants a job queue, not a
 * reordering of these two statements.
 *
 * Uses the service-role client because `welcomed_at` has no UPDATE grant for
 * `authenticated` — deliberately, so a browser cannot clear it and make us
 * send again. See supabase/migrations/0004_welcome_email.sql.
 */
export async function welcomeOnce(userId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('profiles')
    .update({ welcomed_at: new Date().toISOString() })
    .eq('id', userId)
    .is('welcomed_at', null)
    .select('email, name');

  if (error) {
    // Including "column welcomed_at does not exist" if 0004 has not been run.
    // Worth a loud log: the symptom otherwise is silence, which looks like a
    // deliverability problem and gets debugged in Resend instead of here.
    console.error(`Could not claim the welcome email for ${userId}:`, error.message);
    return;
  }

  // No row: already welcomed, or another request won the race. Either way,
  // not ours to send.
  const profile = data?.[0] as { email: string; name: string | null } | undefined;
  if (!profile) return;

  const mail = welcomeEmail(profile.name);
  await trySendEmail(
    {
      to: profile.email,
      ...mail,
      // Belt to the database's braces, and independent of it: if this row were
      // ever cleared by hand, Resend still refuses a duplicate for 24 hours.
      idempotencyKey: `welcome-${userId}`,
    },
    'welcome email',
  );
}

import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { trySendEmail } from './client';
import type { PlanId } from '@/lib/dashboard/types';
import { welcomeEmail, type ScanFindings, type TopFix } from './templates';

/**
 * Send the welcome email, at most once per account, ever.
 *
 * ⚠️ CALLED WHEN THE FIRST SCAN FINISHES, NOT WHEN SOMEBODY SIGNS IN. It used to
 * run from /auth/callback, which meant it fired the instant an account existed
 * and the scan's own "we're done" mail followed a minute or two behind it — two
 * emails almost back to back, the first with nothing measured to report. The
 * claim below is unchanged; only the moment moved. See announceIfFirst() in
 * app/api/scan/tick/route.ts.
 *
 * ⚠️ THE CLAIM IS STILL PER ACCOUNT, NOT PER SCAN. announceIfFirst already
 * guards on "the first scan this site ever completed", but that is a different
 * question from "has this person been welcomed" — a second site, or a job row
 * counted wrong, would be a second welcome. The write below arbitrates, the
 * same shape claimEvent() uses in lib/stripe/fulfil.ts: select-then-check loses
 * to concurrency, only the update can decide.
 *
 * A send that fails is never retried — that person simply gets no welcome. The
 * alternative, a retry that cannot tell a bounce from a timeout, risks sending
 * two: one missing welcome is a non-event; three identical ones is a complaint.
 *
 * Uses the service-role client because `welcomed_at` has no UPDATE grant for
 * `authenticated` — a browser that could clear it could make us send again.
 * See supabase/migrations/0004_welcome_email.sql.
 */
export async function welcomeOnce(
  userId: string,
  siteName: string,
  findings: ScanFindings = {},
  topFix: TopFix | null = null,
): Promise<void> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('profiles')
    .update({ welcomed_at: new Date().toISOString() })
    .eq('id', userId)
    .is('welcomed_at', null)
    /* ⚠️ `plan` COMES BACK TOO, so the template can decide whether to mention
       Pro. Somebody who bought before the first scan finished must not be sold
       the thing they already own — see the note on welcomeEmail's `plan`. */
    .select('email, name, plan');

  if (error) {
    // Including "column welcomed_at does not exist" if 0004 has not been run.
    // Worth a loud log: the symptom otherwise is silence, which looks like a
    // deliverability problem and gets debugged in Resend instead of here.
    console.error(`Could not claim the welcome email for ${userId}:`, error.message);
    return;
  }

  // No row: already welcomed, or another request won the race. Either way,
  // not ours to send.
  const profile = data?.[0] as
    | { email: string; name: string | null; plan: PlanId }
    | undefined;
  if (!profile) return;

  const mail = welcomeEmail(profile.name, siteName, findings, topFix, profile.plan);
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

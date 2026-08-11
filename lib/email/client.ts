import 'server-only';

/**
 * Sending email, over Resend's REST API.
 *
 * `fetch` rather than the `resend` package on purpose. The whole contract is
 * one POST with three required fields, and this codebase has eight
 * dependencies chosen one at a time — a package for ten lines would be the
 * ninth, plus its transitive tree, plus a version to keep current.
 *
 * ⚠️ NOTHING HERE MAY BE ALLOWED TO BREAK THE THING THAT TRIGGERED IT.
 *
 * Every caller sends mail as a consequence of something that already
 * succeeded: an account was created, a payment cleared. A Resend outage must
 * never turn a completed purchase into a failed webhook or a completed sign-in
 * into an error page. So this throws honestly and callers are expected to
 * catch — see the notes at each call site, and `after()` in the auth callback,
 * which puts the send past the response entirely.
 *
 * Supabase's own auth mail (confirm, password reset) does NOT come through
 * here. That goes out over Resend's SMTP, configured in the Supabase dashboard
 * — see .env.example. Two paths to the same provider, for two different jobs.
 */

const ENDPOINT = 'https://api.resend.com/emails';

export type Email = {
  to: string;
  subject: string;
  html: string;
  /** Sent alongside the HTML. Resend derives one if omitted; ours are better. */
  text: string;
  /**
   * Resend de-duplicates on this for 24 hours.
   *
   * A second guard, not the first: every caller already refuses to send twice
   * using the database. This catches the case where our own guard is bypassed
   * — a redeployed webhook, a manual replay — and it costs one header.
   */
  idempotencyKey?: string;
};

/*
  ⚠️ TWO DIFFERENT ADDRESSES, AND THE MISMATCH IS DELIBERATE.

    from      hello@send.faqflo.com   Send-only. A subdomain is verified in
                                      Resend instead of the root so that bulk
                                      mail cannot damage the reputation of the
                                      domain the business actually runs on.
                                      It has NO MX record and never will.

    reply_to  hello@faqflo.com        Where a human lands. The root domain has
                                      live Cloudflare Email Routing MX records,
                                      so mail sent here is actually received.

  Both templates say "reply to this email". Without reply_to that promise
  points at send.faqflo.com, which cannot receive anything — the reply does not
  bounce back to the customer helpfully, it simply disappears. If EMAIL_REPLY_TO
  is ever unset, replies go to `from` and are lost again, so treat an empty
  value as a bug rather than a default.
*/

/** The verified sender. Must be on a domain verified in Resend, or it 403s. */
function from(): string {
  const value = process.env.EMAIL_FROM;

  if (!value) {
    throw new Error(
      'EMAIL_FROM is not configured. Use "Name <you@send.yourdomain.com>", on the domain verified in Resend — an unverified sender is rejected outright, not queued.',
    );
  }

  return value;
}

/** Where replies land. Optional, but its absence means replies are lost. */
function replyTo(): string | undefined {
  return process.env.EMAIL_REPLY_TO || undefined;
}

function apiKey(): string {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    throw new Error(
      'RESEND_API_KEY is not configured. Resend → API Keys. Note this is separate from the SMTP password Supabase uses for auth email, even though the value is the same key.',
    );
  }

  return key;
}

/** Send one email. Throws on any failure; callers decide what that means. */
export async function sendEmail(email: Email): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      ...(email.idempotencyKey ? { 'Idempotency-Key': email.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: from(),
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      // Omitted entirely when unset — Resend rejects an empty string, and a
      // missing key is the documented way to say "no reply-to".
      ...(replyTo() ? { reply_to: replyTo() } : {}),
    }),
  });

  if (!res.ok) {
    // Resend's message names the cause — an unverified domain, a bad key, a
    // recipient it will not deliver to in test mode. Worth surfacing verbatim
    // rather than flattening to "email failed".
    const body = await res.text().catch(() => '');
    throw new Error(`Resend refused the send (${res.status}): ${body.slice(0, 300)}`);
  }

  const { id } = (await res.json()) as { id: string };
  return id;
}

/**
 * Send, and swallow anything that goes wrong.
 *
 * The form every caller in this app actually wants. Named so that using it is
 * a decision rather than an accident: it returns whether the mail went, and
 * discards the reason it did not, so it is only appropriate where the mail is
 * a courtesy attached to work that has already succeeded.
 */
export async function trySendEmail(email: Email, context: string): Promise<boolean> {
  try {
    const id = await sendEmail(email);
    console.info(`Sent ${context} to ${email.to} (${id}).`);
    return true;
  } catch (err) {
    console.error(`Failed to send ${context} to ${email.to}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

import { NextResponse } from 'next/server';
import { currentUser, sitesForUser } from '@/lib/auth/dal';
import { sendEmail } from '@/lib/email/client';
import { contactEmail } from '@/lib/email/templates';
import { checkRateLimit, CONTACT_RATE_LIMIT, limitKey } from '@/lib/rate-limit';
import { SUPPORT_EMAIL, SUPPORT_TOPICS } from '@/lib/support';

/*
  A support message from the dashboard Help page.

  ⚠️ THIS ROUTE USES sendEmail, NOT trySendEmail — and that is the whole design.

  Every other caller in this app sends mail as a courtesy attached to work that
  already succeeded: an account exists, a payment cleared. There, swallowing a
  Resend outage is right, because failing the send must not fail the purchase.
  Here the send IS the work. A swallowed error would show the customer a
  "thanks, we'll be in touch" they have no reason to doubt, for a message
  nobody will ever read — which is worse than telling them it failed.

  It is also the reason this needs no captcha and no honeypot, neither of which
  exists anywhere in this codebase. The route requires a session, so the limiter
  keys on `user:<id>` rather than an IP — one of the few places the in-process
  Map in lib/rate-limit.ts is actually a control rather than a speed bump.
*/

/** Kept short enough to be readable, long enough to describe a real problem. */
const MAX_MESSAGE_CHARS = 4_000;

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return fail('Sign in to send a message.', 401);

  if (!checkRateLimit(`contact:${limitKey(user.id, request.headers)}`, CONTACT_RATE_LIMIT)) {
    return fail(
      `That's ${CONTACT_RATE_LIMIT} messages today. If it's urgent, email ${SUPPORT_EMAIL} directly.`,
      429,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.');
  }

  const { topic, message } = (body ?? {}) as Record<string, unknown>;

  if (typeof topic !== 'string' || !(SUPPORT_TOPICS as readonly string[]).includes(topic)) {
    return fail('Pick what your message is about.');
  }
  if (typeof message !== 'string' || !message.trim()) {
    return fail('Tell us what you need help with.');
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return fail(`That message is too long — keep it under ${MAX_MESSAGE_CHARS} characters.`);
  }

  /*
    Support context, read from the session rather than taken from the body.

    A client-supplied "here is my plan and my domain" field would be both
    forgeable and pointless: the server can look all of it up, and context the
    sender can edit is worse than none — it reads as authoritative and can be
    wrong. Failing to load sites is not worth failing the message over, so it
    degrades to an empty list.
  */
  let domains: string[] = [];
  try {
    domains = (await sitesForUser(user.id)).map((s) => s.domain);
  } catch (err) {
    console.error('Could not load sites for a support message:', err);
  }

  const email = contactEmail({
    topic,
    message: message.trim(),
    name: user.name,
    email: user.email,
    userId: user.id,
    plan: user.plan,
    domains,
  });

  try {
    await sendEmail({
      to: SUPPORT_EMAIL,
      subject: email.subject,
      html: email.html,
      text: email.text,
      // The point of the replyTo field existing. Without it, hitting reply in
      // the support inbox would reach EMAIL_REPLY_TO — us — rather than the
      // person who asked.
      replyTo: user.email,
    });
  } catch (err) {
    console.error('Could not send a support message:', err);
    return fail(`We couldn't send that. Email ${SUPPORT_EMAIL} directly and we'll pick it up there.`, 502);
  }

  return NextResponse.json({ ok: true });
}

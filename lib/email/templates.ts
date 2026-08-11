import 'server-only';

/**
 * The emails this app sends itself.
 *
 * Two, and they do different jobs on purpose. Somebody who signs up and buys
 * straight away already receives four emails inside two minutes — Supabase's
 * confirmation, this welcome, Stripe's receipt, and the set-up note. That is
 * the ceiling. A fifth would be noise, and each of these has to earn its place
 * by saying something the others do not.
 *
 * Plain template strings rather than a rendering library: two emails, no
 * layout to speak of, and the alternative is a dependency plus a build step
 * for markup that fits on a screen.
 */

/** Emails always point at production — a link in an inbox outlives a preview. */
function origin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? 'https://www.faqflo.com';
}

/**
 * ⚠️ Names come from sign-up forms and Google profiles, i.e. from users.
 *
 * Interpolating one into HTML unescaped puts whatever they typed into the
 * markup of a message we send on our own domain. Mail clients strip most of
 * it, which is exactly why this is easy to forget and worth doing anyway.
 */
function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** First name only — "Hi Beau" reads like a person, "Hi Beau Bridges" does not. */
function firstName(name: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first || 'there';
}

export type Rendered = { subject: string; html: string; text: string };

const SIGN_OFF = 'Beau, FaqFlo';

function wrap(body: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#0f172a;max-width:480px">
${body}
<p style="color:#64748b;font-size:13px;margin-top:28px">${SIGN_OFF}</p>
</div>`;
}

/**
 * Sent the first time someone gets into an account, however they got there.
 *
 * Deliberately does not sell anything. They have just made an account; the
 * next thing they do is decide whether this was worth it, and an email that
 * asks for money before they have seen the product answers that badly.
 */
export function welcomeEmail(name: string | null): Rendered {
  const who = escape(firstName(name));
  const url = `${origin()}/dashboard`;

  return {
    subject: 'Welcome to FaqFlo',
    html: wrap(
      `<p>Hi ${who},</p>
<p>Your FaqFlo account is ready.</p>
<p>The quickest way to see where you stand is to run an audit on your site — it tells you what an AI assistant can actually read on your pages, and what it can't.</p>
<p><a href="${url}" style="color:#2563eb">Open your dashboard</a></p>
<p>If anything looks wrong, just reply to this email. It comes to me.</p>`,
    ),
    text: `Hi ${firstName(name)},

Your FaqFlo account is ready.

The quickest way to see where you stand is to run an audit on your site — it tells you what an AI assistant can actually read on your pages, and what it can't.

Open your dashboard: ${url}

If anything looks wrong, just reply to this email. It comes to me.

${SIGN_OFF}`,
  };
}

/**
 * Sent once, when a Get Cited purchase actually grants access.
 *
 * States the 30-day window and what survives it, because that is the part of
 * the deal a customer is most likely to have skimmed on the pricing page — and
 * finding out on day 31 that audits have stopped is how a refund request
 * starts. The receipt itself comes from Stripe; this does not duplicate it.
 */
export function setUpEmail(name: string | null, siteName: string): Rendered {
  const who = escape(firstName(name));
  const site = escape(siteName);
  const url = `${origin()}/dashboard/audit`;

  return {
    subject: `${siteName} is set up`,
    html: wrap(
      `<p>Hi ${who},</p>
<p>Get Cited is active for <strong>${site}</strong>. That unlocks the full audit, the questions people actually put to AI about your category, the content plan, and the publish-ready export.</p>
<p><a href="${url}" style="color:#2563eb">See your audit</a></p>
<p>You have 30 days of full access. After that, everything you have made stays yours — the audit, the answers, the export — and running new ones is what Stay Cited covers.</p>
<p>Reply here if you get stuck.</p>`,
    ),
    text: `Hi ${firstName(name)},

Get Cited is active for ${siteName}. That unlocks the full audit, the questions people actually put to AI about your category, the content plan, and the publish-ready export.

See your audit: ${url}

You have 30 days of full access. After that, everything you have made stays yours — the audit, the answers, the export — and running new ones is what Stay Cited covers.

Reply here if you get stuck.

${SIGN_OFF}`,
  };
}

import 'server-only';
import { SITE_URL } from '@/lib/site';

/**
 * The emails this app sends itself.
 *
 * Two go to customers, and they do different jobs on purpose. Somebody who
 * signs up and buys straight away already receives four emails inside two
 * minutes — Supabase's confirmation, this welcome, Stripe's receipt, and the
 * set-up note. That is the ceiling. A fifth would be noise, and each of these
 * has to earn its place by saying something the others do not.
 *
 * The last two, `contactEmail` and `doneForYouEmail`, are the exception that
 * proves the rule: they go to US, not to a customer, so they count against
 * nobody's inbox and follow none of the conventions below — no `wrap()`, no
 * sign-off, no marketing voice.
 *
 * Plain template strings rather than a rendering library: no layout to speak
 * of, and the alternative is a dependency plus a build step for markup that
 * fits on a screen.
 */

/** Emails always point at production — a link in an inbox outlives a preview. */
function origin(): string {
  /*
    ⚠️ THE ENV VAR STILL WINS HERE, AND THAT IS THE OPPOSITE OF THE RULE FOR
    CANONICALS. An email link should point at the deployment that sent it, so a
    preview's confirmation mail returns to the preview — which is exactly why
    .env.example says to leave NEXT_PUBLIC_SITE_URL unset outside production. A
    canonical tag wants the reverse and must never read this variable; see the
    note in lib/site.ts. Only the fallback is shared.
  */
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? SITE_URL;
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
<p>You have 90 days of full access, and we check whether the engines are naming you five times across it — once now, then on days 7, 30, 60 and 90. Nothing to press. After that, everything you have made stays yours — the audit, the answers, the export — and running new ones is what Stay Cited covers.</p>
<p>Reply here if you get stuck.</p>`,
    ),
    text: `Hi ${firstName(name)},

Get Cited is active for ${siteName}. That unlocks the full audit, the questions people actually put to AI about your category, the content plan, and the publish-ready export.

See your audit: ${url}

You have 90 days of full access, and we check whether the engines are naming you five times across it - once now, then on days 7, 30, 60 and 90. Nothing to press. After that, everything you have made stays yours - the audit, the answers, the export - and running new ones is what Stay Cited covers.

Reply here if you get stuck.

${SIGN_OFF}`,
  };
}

/**
 * A support request from the dashboard Help page. Goes to us, not to a customer.
 *
 * Every field except `topic` and `message` is read server-side from the session
 * rather than accepted from the request body. Support context that the sender
 * can edit is worse than no context — it looks authoritative and can be wrong,
 * and there is nothing here the server cannot look up itself.
 *
 * The customer's address rides on the message's `replyTo` rather than only
 * appearing in the body, so answering is one click instead of a copy-paste.
 * It is repeated in the body anyway, because a forwarded copy loses the header.
 */
export function contactEmail(opts: {
  topic: string;
  message: string;
  name: string | null;
  email: string;
  userId: string;
  plan: string;
  domains: string[];
}): Rendered {
  const { topic, message, name, email, userId, plan, domains } = opts;

  const sites = domains.length ? domains.join(', ') : 'none yet';
  const who = name?.trim() || 'No name';

  const facts: [string, string][] = [
    ['From', `${who} <${email}>`],
    ['Topic', topic],
    ['Plan', plan],
    ['Sites', sites],
    ['User id', userId],
  ];

  return {
    // Prefixed so an inbox filter can find these without matching on the body,
    // and topic-first so a full folder is scannable.
    subject: `[FaqFlo help] ${topic} — ${email}`,
    html: internalHtml(facts, message),
    text: internalText(facts, message),
  };
}

/**
 * An enquiry about the done-for-you service, from /done-for-you.
 *
 * ⚠️ EVERY FIELD HERE IS TYPED BY A STRANGER, WHICH IS THE OPPOSITE OF
 * `contactEmail` ABOVE.
 *
 * That one reads its context from the session precisely so the sender cannot
 * edit it. This form is public — there is no session to read — so the name,
 * the address and the website are claims, not facts. They are escaped like
 * everything else, and the practical consequence is worth stating: the reply-to
 * on this message is an address nobody has verified. Hitting reply is fine.
 * Believing the "From" line before they answer is not.
 *
 * Kept in the same internal-mail shape as `contactEmail` — facts table, quoted
 * body, no sign-off — so both land in the same inbox looking like the same
 * kind of thing.
 */
export function doneForYouEmail(opts: {
  name: string;
  email: string;
  website: string;
  platform: string;
  plan: string;
  notes: string;
}): Rendered {
  const { name, email, website, platform, plan, notes } = opts;

  const facts: [string, string][] = [
    ['From', `${name} <${email}>`],
    ['Website', website],
    ['Built on', platform],
    ['Plan', plan],
  ];

  return {
    // Website first rather than topic: unlike support, every one of these is
    // about the same thing, so the domain is what makes a full folder scannable.
    subject: `[FaqFlo done-for-you] ${website} — ${email}`,
    html: internalHtml(facts, notes || 'No notes given.'),
    text: internalText(facts, notes || 'No notes given.'),
  };
}

/* ------------------------------------------------- internal mail shells --- */

/*
  Shared by the two templates above, which both go to us rather than to a
  customer: a table of facts, then the message quoted behind a rule. Extracted
  when the second one arrived — the markup was identical, and two copies of an
  inline-styled table is two things to fix the next time a mail client renders
  one of them badly.
*/

function internalHtml(facts: [string, string][], body: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#0f172a">
<table cellpadding="0" cellspacing="0" style="font-size:13px;color:#475569;margin-bottom:20px">
${facts
  .map(
    ([k, v]) =>
      `<tr><td style="padding:2px 12px 2px 0;color:#94a3b8">${k}</td><td style="padding:2px 0">${escape(v)}</td></tr>`,
  )
  .join('\n')}
</table>
<div style="white-space:pre-wrap;border-left:3px solid #e2e8f0;padding-left:14px">${escape(body)}</div>
</div>`;
}

function internalText(facts: [string, string][], body: string): string {
  return `${facts.map(([k, v]) => `${k}: ${v}`).join('\n')}

---

${body}`;
}

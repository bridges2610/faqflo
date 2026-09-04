import 'server-only';

import { scoreBand } from '@/lib/audit/score';
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
 * Findings from the first scan. Every field optional, because every one of them
 * is written by the stage that produced it and a stage can finish reporting
 * nothing.
 */
export type ScanFindings = {
  score?: number;
  pagesRead?: number;
  questions?: number;
  /**
   * Whether the engines were actually asked. A count of question-and-engine
   * pairs, which is plumbing — the email says that it happened, never the
   * number, because "75 checks" means nothing to somebody who sells roofs.
   */
  asked?: boolean;
};

/**
 * The single highest-ranked fix from the audit, if it produced one.
 *
 * Straight off ActionItem, whose fields were already written for this reader:
 * `what` is imperative and specific, `why` is one sentence tying it to being
 * quoted, and `effort` is a plain duration. Nothing here needs rewording.
 */
export type TopFix = { what: string; why: string; effort: string };

/**
 * The one email a new account gets from us, sent when the first scan lands.
 *
 * ⚠️ THERE USED TO BE TWO, AND THAT IS THE BUG THIS FIXES. `welcomeEmail` went
 * out from /auth/callback the moment somebody signed in, and `setUpEmail`
 * followed a minute or two later when the scan finished — two mails almost back
 * to back, the first of which could only say "your account is ready" because
 * nothing had been measured yet. This waits until there is something to say.
 *
 * ⚠️ THE OLD setUpEmail SOLD A PRODUCT THAT NO LONGER EXISTS. It offered "Get
 * Cited", "90 days of full access", checks on "days 7, 30, 60 and 90" and
 * "Stay Cited". The plans are Free and Pro and the cadence has been weekly
 * since 0012. Do not reintroduce a template that describes the schedule; it
 * outlived two pricing changes because nothing on screen ever showed it.
 *
 * ⚠️ EVERY FIGURE IS OPTIONAL AND A MISSING ONE REMOVES ITS SENTENCE. Not one
 * of them is defaulted to zero: "we read 0 pages" is a claim about a crawl that
 * did not report, and this codebase's rule is that not measured is not zero.
 *
 * ⚠️ IT NEVER SAYS WHETHER ANYONE IS CITING THEM. The scan asks the engines and
 * stores what they said; summarising that as a count in an email would be a
 * verdict delivered before they have seen the evidence, and a bad first run
 * reads very differently in an inbox than it does beside its own answers.
 */
export function welcomeEmail(
  name: string | null,
  siteName: string,
  findings: ScanFindings = {},
  topFix: TopFix | null = null,
): Rendered {
  const who = escape(firstName(name));
  const site = escape(siteName);
  const url = `${origin()}/dashboard`;

  const { score, pagesRead, questions, asked } = findings;
  const num = (v: number | undefined) => (typeof v === 'number' && v > 0 ? v : null);
  const pages = num(pagesRead);
  const found = num(questions);

  /*
    ⚠️ THE VERDICT COMES FROM scoreBand(), NOT FROM WORDING INVENTED HERE. That
    function already turns a score into a label and a plain sentence, and it is
    what the dashboard prints — so the email and the screen cannot describe the
    same site two different ways. It is also the problem statement: "an
    assistant can read this site, it just has to work harder than it should to
    quote it" is the point of the whole product in one line.
  */
  const band = typeof score === 'number' ? scoreBand(score) : null;

  const lines: string[] = [];
  if (pages) lines.push(`Read ${pages} ${pages === 1 ? 'page' : 'pages'} of your site.`);
  if (found)
    lines.push(
      `Found ${found} ${found === 1 ? 'question' : 'questions'} people ask about your line of work.`,
    );
  if (asked) lines.push('Asked ChatGPT, Perplexity and Gemini about them, and saved every answer.');

  const htmlList = lines.length
    ? `<ul style="padding-left:18px;margin:14px 0">${lines
        .map((l) => `<li style="margin-bottom:6px">${escape(l)}</li>`)
        .join('')}</ul>`
    : '';
  const textList = lines.length ? `\n${lines.map((l) => `- ${l}`).join('\n')}\n` : '';

  const verdictHtml = band
    ? `<p style="margin:14px 0"><strong>${escape(band.label)}</strong> — ${score} out of 100.<br />${escape(band.summary)}</p>`
    : '';
  const verdictText = band ? `\n${band.label} - ${score} out of 100.\n${band.summary}\n` : '';

  /* The solution, named rather than gestured at. Omitted entirely when the
     audit ranked nothing, which is the same rule the figures follow. */
  const fixHtml = topFix
    ? `<p style="margin:14px 0"><strong>Worth doing first:</strong> ${escape(topFix.what)}<br />${escape(topFix.why)} About ${escape(topFix.effort)}.</p>`
    : '';
  const fixText = topFix
    ? `\nWorth doing first: ${topFix.what}\n${topFix.why} About ${topFix.effort}.\n`
    : '';

  return {
    subject: `What AI can read on ${siteName}`,
    html: wrap(
      `<p>Hi ${who},</p>
<p>We've read <strong>${site}</strong> the same way ChatGPT and Gemini do — because that is where more and more of your customers are asking.</p>
${verdictHtml}${htmlList}${fixHtml}
<p><a href="${url}" style="color:#2563eb">Open your dashboard</a></p>
<p>${topFix ? 'The rest is' : 'What to change is'} listed there, in the order worth doing. Work through them and the engines have your real answers to hand out — instead of guessing, or naming somebody else.</p>
<p>We'll look again every week. Nothing for you to press. If anything looks wrong, just reply to this — it comes to me.</p>`,
    ),
    text: `Hi ${firstName(name)},

We've read ${siteName} the same way ChatGPT and Gemini do - because that is where more and more of your customers are asking.
${verdictText}${textList}${fixText}
Open your dashboard: ${url}

${topFix ? 'The rest is' : 'What to change is'} listed there, in the order worth doing. Work through them and the engines have your real answers to hand out - instead of guessing, or naming somebody else.

We'll look again every week. Nothing for you to press. If anything looks wrong, just reply to this - it comes to me.

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

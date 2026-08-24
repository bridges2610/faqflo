import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/client';
import { doneForYouEmail } from '@/lib/email/templates';
import {
  DFY_PLAN_STATES,
  DFY_PLATFORMS,
} from '@/lib/done-for-you';
import { checkRateLimit, DONE_FOR_YOU_RATE_LIMIT, limitKey } from '@/lib/rate-limit';
import { SUPPORT_EMAIL } from '@/lib/support';
import { looksLikeEmail, looksLikeWebsite } from '@/lib/validate';

/*
  An enquiry about the done-for-you service, from the public /done-for-you page.

  ⚠️ THIS IS THE ONLY UNAUTHENTICATED FORM IN THE APP, AND EVERYTHING ODD ABOUT
  THIS FILE FOLLOWS FROM THAT.

  /api/contact — the closest relative, and the file this one is modelled on —
  opens with `if (!user) return fail(...)`, which is what lets it key the
  limiter by account and skip a honeypot entirely. Its comment says so
  explicitly: "it is also the reason this needs no captcha and no honeypot,
  neither of which exists anywhere in this codebase."

  One of them exists now, here, because this route has no session to stand
  behind. The two guards are:

    honeypot   A field no human sees. Filled → we return success and send
               nothing. Cheap, and it catches the form-scraping bots that
               make up nearly all of this traffic.

    limiter    IP-keyed, so genuinely weak (see the note on
               DONE_FOR_YOU_RATE_LIMIT). A speed bump on top of the honeypot,
               not a control.

  What it deliberately does NOT have is a captcha. This is the last step before
  someone spends $497; putting a puzzle in front of it to deflect spam that
  costs us an email is a bad trade, and it would be the first third-party
  script on a marketing site whose entire argument is that scripts are invisible
  to the crawlers we are selling access to.

  ⚠️ sendEmail, NOT trySendEmail — the same call the support route makes, for
  the same reason. Here the send IS the work. A swallowed Resend outage would
  show a stranger "thanks, I'll be in touch" for an enquiry nobody will ever
  read, and the first they would know is a week of silence.
*/

/** Long enough to describe a business, short enough to read in the inbox. */
const MAX_NOTES_CHARS = 2_000;

/** Names and domains, bounded so a paste-bomb cannot become the subject line. */
const MAX_SHORT_CHARS = 200;

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Trimmed string, or null if the field is missing, empty or the wrong type. */
function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request body.');
  }

  const { name, email, website, platform, plan, notes, company } = (body ??
    {}) as Record<string, unknown>;

  /*
    The honeypot, checked before anything else.

    ⚠️ IT RETURNS SUCCESS. Telling a bot it was caught is how the bot's author
    learns which field to leave alone; a submitted-looking response teaches
    nothing and costs one branch. `company` is named to be plausible enough
    that a form-filler wants it and generic enough that it never collides with
    a real field — see the matching input in the form component, which is
    hidden from sight AND from the accessibility tree.
  */
  if (typeof company === 'string' && company.trim()) {
    return NextResponse.json({ ok: true });
  }

  const theirName = text(name);
  const theirEmail = text(email);
  const theirWebsite = text(website);

  if (!theirName) return fail('Tell me your name.');
  if (!theirEmail || !looksLikeEmail(theirEmail)) {
    return fail('Enter an email address I can reply to.');
  }
  if (!theirWebsite || !looksLikeWebsite(theirWebsite)) {
    return fail('Enter your website address, so I know what I would be working on.');
  }
  if (
    theirName.length > MAX_SHORT_CHARS ||
    theirEmail.length > MAX_SHORT_CHARS ||
    theirWebsite.length > MAX_SHORT_CHARS
  ) {
    return fail('One of those fields is far longer than it should be.');
  }

  /*
    Both selects are validated against the shared arrays rather than accepted
    as free text. They come from a <select> whose options are those same
    arrays (lib/done-for-you.ts), so a legitimate submission cannot fail this
    — and anything that does was not sent by the form.
  */
  if (
    typeof platform !== 'string' ||
    !(DFY_PLATFORMS as readonly string[]).includes(platform)
  ) {
    return fail('Pick what your site is built on.');
  }
  if (
    typeof plan !== 'string' ||
    !(DFY_PLAN_STATES as readonly string[]).includes(plan)
  ) {
    return fail('Let me know whether you’re on Pro yet.');
  }

  // Optional — the only field somebody can legitimately leave blank.
  const theirNotes = notes === undefined || notes === null ? '' : text(notes) ?? '';
  if (theirNotes.length > MAX_NOTES_CHARS) {
    return fail(`That's a long one — keep it under ${MAX_NOTES_CHARS} characters and tell me the rest by email.`);
  }

  /*
    ⚠️ THE LIMITER RUNS HERE, AFTER VALIDATION, AND THAT IS NOT WHERE THE
    OTHER ROUTES PUT IT.

    /api/contact and /api/audit check first thing, which is right for them:
    their expensive work starts immediately, and their callers are signed in.
    Checking first here means a typo costs an attempt. `checkRateLimit`
    increments as it tests, so with a ceiling of three, somebody who mistypes
    their email and then their domain has one try left to actually reach me —
    on the page where the whole promise is that a person replies. That is a
    limiter working against the thing it is protecting.

    Below validation, the budget is spent on SENDS, which is the only thing a
    request here actually costs. A flood of malformed JSON now gets rejected
    for free and mails nobody, which is the correct outcome for it; a flood of
    well-formed enquiries still stops at three.
  */
  if (!checkRateLimit(`dfy:${limitKey(null, request.headers)}`, DONE_FOR_YOU_RATE_LIMIT)) {
    return fail(
      `That's a few enquiries from here today. Email ${SUPPORT_EMAIL} directly and I'll pick it up there.`,
      429,
    );
  }

  const mail = doneForYouEmail({
    name: theirName,
    email: theirEmail,
    website: theirWebsite,
    platform,
    plan,
    notes: theirNotes,
  });

  try {
    await sendEmail({
      to: SUPPORT_EMAIL,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      /*
        ⚠️ An address nobody has verified — there is no session here and no
        confirmation step, so this is whatever was typed into the form. That is
        fine for its purpose (replying is one click instead of a copy-paste out
        of the body, and the body carries it anyway for forwarded copies), but
        it means the From line on this message is a claim rather than an
        identity. See the warning on doneForYouEmail.
      */
      replyTo: theirEmail,
    });
  } catch (err) {
    console.error('Could not send a done-for-you enquiry:', err);
    return fail(
      `I couldn't send that. Email ${SUPPORT_EMAIL} directly and I'll pick it up there.`,
      502,
    );
  }

  return NextResponse.json({ ok: true });
}

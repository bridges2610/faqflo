/**
 * What a support message can be about.
 *
 * Its own module, with no imports, because both sides need it: the <select> in
 * components/dashboard/contact-form.tsx renders it, and app/api/contact/route.ts
 * rejects anything not in it. Two copies would drift, and the way a customer
 * would find out is a form that fails on submit for one option and not another.
 *
 * A fixed list rather than free text so the support inbox can be filtered on
 * the subject line, which is built from the topic.
 */
export const SUPPORT_TOPICS = [
  'Getting started',
  'My audit',
  'Writing answers',
  'Publishing to my site',
  'Billing or plans',
  'Something is broken',
  'Something else',
] as const;

export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

/** Where support actually lands — a real inbox, checked by a person. */
export const SUPPORT_EMAIL = 'hello@faqflo.com';

/*
  ⚠️ SUPPORT_EMAIL IS NOT process.env.EMAIL_FROM.

  That is hello@send.faqflo.com — a send-only subdomain verified in Resend so
  that bulk mail cannot damage the reputation of the domain the business runs
  on. It has no MX record and never will, so mail sent there does not bounce
  helpfully, it disappears. See the block in lib/email/client.ts.
*/

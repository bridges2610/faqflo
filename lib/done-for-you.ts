/**
 * The done-for-you service, in the one place every surface reads it from.
 *
 * ⚠️ THE PRICE IS QUOTED ON /done-for-you AND NOWHERE ELSE. Three readers, all
 * on that one page: the copy in the price section, the `Offer` schema it
 * emits, and the line under the enquiry form's button. The route imports the
 * two option arrays and no money at all.
 *
 * It got that way on purpose. A line under the home page's pricing cards was
 * removed when the service was scoped to people who already pay for Get
 * Cited, and the dashboard card dropped its price line because a figure with
 * no scope beside it is the version a customer misreads. Keeping every quote
 * on one page means the scope is always within reading distance of the number.
 *
 * The constants stay here rather than in that page because the price has
 * already moved once, from $997 to $497 — the exact event that catches
 * hardcoded copies out, and the reason the schema derives its amount from
 * DFY_PRICE_USD instead of carrying its own literal.
 *
 * Same reasoning as lib/support.ts: the <select> options and the server that
 * rejects anything not in them come from one array, so a form cannot offer a
 * value its own route refuses.
 *
 * ⚠️ THERE IS NO STRIPE PRICE BEHIND THIS. Unlike the Pro subscription,
 * nothing here is a `STRIPE_PRICE_*` id — the service is quoted, agreed by
 * email and invoiced by hand. That is deliberate, and it is what makes
 * discounting it a conversation rather than a deploy. If it ever gains a
 * checkout, this file stops being the source of truth and the warning at the
 * top of lib/dashboard/plans.ts starts applying to it too.
 *
 * No imports: the form is a client component, the route is a server handler,
 * and both need this.
 */

/**
 * What the service costs, on top of Pro. Copy, not a Stripe amount.
 *
 * ⚠️ THE NUMBER AND THE STRING COME FROM ONE PLACE, BECAUSE THE SCHEMA READS
 * IT TOO. The landing page emits an `Offer` with a bare `price` field, and a
 * hardcoded '997' sat in that schema while the visible copy said $497 would be
 * a page telling search engines one price and customers another — on a site
 * whose product is getting structured data right. `DFY_PRICE_USD` is the
 * source; the display string is derived from it.
 */
export const DFY_PRICE_USD = 497;

/** The display form. Never type the number again — derive it. */
export const DFY_PRICE = `$${DFY_PRICE_USD}`;

/**
 * Calendar weeks, not business days.
 *
 * ⚠️ It starts when access arrives, not when the money does. Most of the
 * elapsed time in this job is waiting for a login and answers about pricing
 * and policy, and a clock that starts at payment turns somebody else's slow
 * week into our missed deadline. Every place this number appears says "from
 * the day I get access" alongside it.
 */
export const DFY_TURNAROUND = 'two weeks';

/**
 * How many sites one engagement covers, and how many pages of answers.
 *
 * Stated because an unbounded "I'll write your answers" is the version of this
 * that ends in an argument. Five pages is a real small-business FAQ set —
 * services, pricing, area, process, contact — not a token allowance.
 */
export const DFY_SITE_SCOPE = 'One website, up to five pages of answers';

/**
 * What the site is built on.
 *
 * Asked because it decides how much of the job is actually mine. Wix wraps
 * embeds in an iframe, Squarespace strips some markup from its code blocks,
 * and a hand-rolled site might have no CMS to log into at all — knowing which
 * before replying is the difference between a quote and a guess.
 *
 * "Something else" and "Not sure" both exist on purpose. A required select
 * with no honest answer teaches people to pick a wrong one.
 */
export const DFY_PLATFORMS = [
  'WordPress',
  'Squarespace',
  'Shopify',
  'Wix',
  'Webflow',
  'Something else',
  'Not sure',
] as const;

export type DfyPlatform = (typeof DFY_PLATFORMS)[number];

/**
 * Whether they are on Pro yet.
 *
 * The service sits on top of it, so this decides what the reply says — a quote,
 * or a quote plus "start Pro first and I'll take it from there". Asked rather
 * than assumed: the page is public and reachable by someone who has never seen
 * the product.
 */
export const DFY_PLAN_STATES = [
  'Yes, I’m on Pro',
  'Not yet — still on Free',
  'Not sure',
] as const;

export type DfyPlanState = (typeof DFY_PLAN_STATES)[number];

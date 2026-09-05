/**
 * The done-for-you service, in the one place every surface reads it from.
 *
 * ⚠️ THE PRICE IS QUOTED ON /done-for-you AND NOWHERE ELSE. Three readers, all
 * on that one page: the copy in the price section, the `Offer` schema it
 * emits, and the line under the enquiry form's button. The route imports the
 * two option arrays and no money at all.
 *
 * ⚠️ IT IS A RETAINER NOW, NOT A PROJECT — a setup fee and a monthly fee, and
 * the monthly INCLUDES the Pro subscription. Anything still describing this as
 * a one-off, or as a charge sitting on top of Pro, is out of date rather than
 * merely imprecise.
 *
 * It got that way on purpose. A line under the home page's pricing cards was
 * removed when the service was scoped to people who already pay for Get
 * Cited, and the dashboard card dropped its price line because a figure with
 * no scope beside it is the version a customer misreads. Keeping every quote
 * on one page means the scope is always within reading distance of the number.
 *
 * The constants stay here rather than in that page because the price has moved
 * twice — $997, then $497 one-off, then $250 up front and $399 a month — which
 * is the exact event that catches hardcoded copies out, and the reason the
 * schema derives its amounts from the USD constants below instead of carrying
 * its own literals.
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
 * What the service costs. Copy, not a Stripe amount.
 *
 * ⚠️ TWO NUMBERS NOW, AND THE SERVICE CHANGED SHAPE RATHER THAN PRICE. It was
 * `DFY_PRICE_USD = 497`, a one-off project: an audit, five pages of answers,
 * ninety days of tracking, a report, done. It is a retainer — a setup fee, then
 * a monthly fee for a monthly deliverable — so a single figure can no longer
 * describe it, and every sentence built on "once" had to go with it.
 *
 * ⚠️ THE NUMBERS AND THE STRINGS COME FROM ONE PLACE, BECAUSE THE SCHEMA READS
 * THEM TOO. A hardcoded '997' once sat in that schema while the visible copy
 * said $497 — a page telling search engines one price and customers another, on
 * a site whose product is getting structured data right. The USD constants are
 * the source; every display string is derived.
 *
 * The price has now moved twice: $997 → $497 one-off → $250 + $399/mo. That is
 * the exact history that catches hardcoded copies out.
 */
export const DFY_SETUP_USD = 250;

/**
 * ⚠️ THIS INCLUDES THE PRO SUBSCRIPTION, AND THE PAGE MUST SAY SO. The old
 * arrangement was $497 on top of $39/mo, and /done-for-you carried a long note
 * about never mentioning the subscription price because "everyone who reaches
 * this page is already paying it". That reasoning inverts here: Pro being
 * inside this number is a reason to state it, not to omit it. Quoting $399 as
 * an addition to $39 would overstate the cost by a subscription.
 */
export const DFY_MONTHLY_USD = 399;

/** The display forms. Never type a number again — derive it. */
export const DFY_SETUP = `$${DFY_SETUP_USD}`;
export const DFY_MONTHLY = `$${DFY_MONTHLY_USD}`;

/**
 * How many articles a month the retainer publishes.
 *
 * Kept as a number so the page can divide by it. Ten articles at
 * DFY_MONTHLY_USD is about $40 each, and that arithmetic is the honest answer
 * to a reader comparing $399 against Pro's $39 — see the price block.
 */
export const DFY_ARTICLES_PER_MONTH = 10;

/**
 * No minimum term.
 *
 * ⚠️ STATED ON THE PAGE, NOT LEFT TO BE ASKED. "Ongoing" with nothing said about
 * commitment is the first thing a small business owner wants to know about a
 * recurring fee, and it costs nothing to answer when the answer is this one.
 * It also carries an obligation: NOT_INCLUDED has to say results take longer
 * than a month, or cancel-anytime quietly invites judging the work on one.
 */
export const DFY_TERM = 'Month to month — stop whenever you like';

/**
 * Calendar weeks, not business days.
 *
 * ⚠️ It starts when access arrives, not when the money does. Most of the
 * elapsed time in this job is waiting for a login and answers about pricing
 * and policy, and a clock that starts at payment turns somebody else's slow
 * week into our missed deadline. Every place this number appears says "from
 * the day I get access" alongside it.
 *
 * ⚠️ IT NOW DESCRIBES THE SETUP ONLY, NOT THE WHOLE JOB. Under the one-off it
 * was the delivery time for everything. On a retainer the setup is what has a
 * deadline and the articles have a cadence, so anything rendering this must say
 * which of the two it means — "live within two weeks" alongside a monthly fee
 * reads as a promise about the articles.
 */
export const DFY_TURNAROUND = 'two weeks';

/**
 * What one month buys, and where it lands.
 *
 * Stated because an unbounded "I'll write your content" is the version of this
 * that ends in an argument. It read "One website, up to five pages of answers"
 * when the job was a one-off build; the bound now is a monthly count rather than
 * a total, and it still names the single site so the scope travels with the
 * number.
 */
export const DFY_SITE_SCOPE = `One website, ${DFY_ARTICLES_PER_MONTH} articles a month`;

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
 * ⚠️ STILL WORTH ASKING, THOUGH THE REASON CHANGED. It used to decide whether
 * the reply was "here is a quote" or "start Pro first and I'll take it from
 * there", because the service sat on top of the subscription. The retainer
 * includes Pro, so nobody needs to start one — what this now decides is whether
 * there is an existing $39/mo to fold in and stop billing separately. Getting
 * that wrong charges somebody twice for the same thing.
 *
 * Asked rather than assumed: the page is public and reachable by someone who
 * has never seen the product.
 */
export const DFY_PLAN_STATES = [
  'Yes, I’m on Pro',
  'Not yet — still on Free',
  'Not sure',
] as const;

export type DfyPlanState = (typeof DFY_PLAN_STATES)[number];

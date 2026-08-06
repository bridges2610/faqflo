/**
 * Ceilings the audit runs under.
 *
 * Here rather than in lib/dashboard/plans.ts because the API route needs them
 * and must not import the dashboard's plan logic — that's client-side state
 * about a customer, and this endpoint has no customer.
 */

/**
 * The most pages any single audit will read.
 *
 * The paid budget, and the clamp on an unauthenticated endpoint: whatever a
 * caller asks for, this is the ceiling, so the worst case stays a known number
 * of outbound requests to somebody else's server.
 */
export const MAX_AUDIT_PAGES = 100;

/**
 * Wall clock for the fetching phase.
 *
 * A hundred pages on a slow host would otherwise run past the platform's
 * function timeout and return nothing at all. When this trips the crawl stops
 * and the report says so — a partial audit that admits it is useful; a request
 * that dies after ninety seconds is not.
 */
export const AUDIT_TIME_BUDGET_MS = 60_000;

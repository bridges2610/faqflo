/**
 * Display helpers shared across dashboard components.
 *
 * All of them read a timestamp against "now", so they're client-only in
 * practice: rendering "2 hours ago" on the server and again on the client is a
 * hydration mismatch waiting for a slow response.
 */

/** "just now" · "3 hours ago" · "12 Mar 2026" once it's past a week. */
export function timeAgo(iso: string | null): string {
  if (!iso) return 'never';

  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));

  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;

  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * "in 3 days" — the forward-looking counterpart to timeAgo().
 *
 * timeAgo() clamps elapsed time at zero, so handing it a future date returns
 * "just now", which would tell someone their quota resets immediately. Dates in
 * the future need their own function rather than a string replace on that one.
 */
export function timeUntil(iso: string | null): string {
  if (!iso) return 'unknown';

  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (seconds <= 0) return 'now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * An absolute date — "12 October 2026".
 *
 * ⚠️ LOCALE AND TIMEZONE ARE BOTH PINNED, for the reason lib/blog/posts.ts
 * spells out at length: a date rendered in the browser's zone can land on the
 * previous day, and one rendered in the browser's locale reads differently on
 * either side of the Atlantic. Both make a scheduled date look wrong to
 * somebody, and this one is a promise about when work happens.
 */
const PLAIN_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatPlainDate(iso: string | null): string {
  if (!iso) return 'unknown';

  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'unknown' : PLAIN_DATE.format(date);
}

/** Thousands separators, so 12480 doesn't read as 1248 at a glance. */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/** Percentage change, or null when there's no baseline to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

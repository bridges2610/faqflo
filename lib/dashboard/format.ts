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

  return AGO_DATE.format(new Date(iso));
}

/**
 * What timeAgo falls back to once "N days ago" stops being useful.
 *
 * ⚠️ PINNED LIKE ITS NEIGHBOURS, AND IT WAS NOT. This branch called
 * `toLocaleDateString(undefined, …)` — no locale, no zone — so it obeyed
 * neither half of the rule stated beside PLAIN_DATE below: the server renders
 * on UTC and the reader's browser does not, and "Aug 15" or "15 Aug" depended
 * on which side of the Atlantic was looking.
 */
const AGO_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

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
 * An absolute date — "October 12, 2026".
 *
 * ⚠️ en-US, AND THAT IS THE WHOLE PRODUCT'S CONVENTION. Every date the
 * dashboard renders is month-first; the chart axis, the plan block and
 * timeAgo's fallback all agree with this one. Only lib/blog/posts.ts keeps its
 * own formatter, and it is already en-US too.
 *
 * ⚠️ LOCALE AND TIMEZONE ARE BOTH PINNED, for the reason lib/blog/posts.ts
 * spells out at length: a date rendered in the browser's zone can land on the
 * previous day, and one rendered in the browser's locale reads differently on
 * either side of the Atlantic. Both make a scheduled date look wrong to
 * somebody, and this one is a promise about when work happens.
 */
const PLAIN_DATE = new Intl.DateTimeFormat('en-US', {
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

/**
 * A short weekday-and-date — "Fri, Sep 4".
 *
 * ⚠️ PINNED FOR THE SAME REASON PLAIN_DATE IS, and it arrived carrying the bug.
 * This came out of a `toLocaleDateString(undefined, …)` in app-shell.tsx, which
 * left both the locale and the zone to the runtime — so the server and the
 * browser could render different days for one timestamp, and a US and a UK
 * reader could see the day and month swapped. It is a promise about when work
 * happens, which is the worst kind of date to render two ways.
 *
 * No year: this is only ever used for a date inside the coming week, where the
 * year is noise in a 256px column.
 */
const SHORT_DATE = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export function formatShortDate(date: Date | null): string {
  return date && !Number.isNaN(date.getTime()) ? SHORT_DATE.format(date) : 'unknown';
}

/**
 * The calendar day a moment fell on, in the READER'S zone — "2026-09-07".
 *
 * ⚠️ THE ONE FUNCTION IN THIS FILE THAT IS NOT UTC-PINNED, AND THE EXCEPTION IS
 * THE WHOLE REASON IT EXISTS. Its neighbours pin UTC because a date rendered in
 * the browser's zone can disagree with one rendered on the server, and a
 * scheduled date that reads differently in two places is a promise we appear to
 * break. That argument is about dates the SERVER renders.
 *
 * This one answers "which day did this measurement happen on" for the person
 * who ran it. `checked_at.slice(0, 10)` was doing that job and taking the UTC
 * day: a check run at 20:41 EDT is 00:41 UTC the next day, so the trend filed
 * an evening check under tomorrow and the axis printed a date that had not
 * happened yet. For a measurement, the reader's own day is the true answer.
 *
 * ⚠️ SAFE BECAUSE NOTHING RENDERS THIS ON THE SERVER. Tracking is read through
 * the browser Supabase client (see assertClient in store.ts) and drawn by a
 * client component, so there is no server-rendered copy to disagree with. Move
 * that read to the server and this becomes a hydration mismatch — the reason is
 * written down here so the constraint travels with the function.
 *
 * Zero-padded YYYY-MM-DD, because trackingFromDb's contract requires it: the
 * chart splits the string and keys its rows on it.
 */
export function localDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
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

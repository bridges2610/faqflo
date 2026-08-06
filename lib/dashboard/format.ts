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

/** Thousands separators, so 12480 doesn't read as 1248 at a glance. */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/** Percentage change, or null when there's no baseline to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

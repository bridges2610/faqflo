import { localDay } from './format';
import { ENGINES, type CitationCheck, type CitationDay, type Engine } from './types';

/*
  Turning the raw check log into the points on "Is it getting better?".

  ⚠️ ONE POINT PER RUN, AND IT USED TO BE ONE PER UTC DAY. That produced two
  faults, both reported off one screenshot:

    1. Adding a single question drew a whole second point. Asking one new
       question writes checks exactly like a sweep does, so the trend answered
       "is it getting better?" with a line through one answer.

    2. The day was the UTC day. A check run at 20:41 EDT is 00:41 UTC the next
       morning, so an evening run was filed under tomorrow and the axis printed
       a date that had not happened yet.

  ⚠️ PURE, AND IN ITS OWN MODULE, BECAUSE IT IS THE PART THAT HAS TO BE RIGHT.
  It used to be a loop inside trackingFromDb, which needs a browser Supabase
  client and a session — so the rules below could only be exercised by clicking.
  Nothing here touches the network or the clock except through the timestamps it
  is handed.
*/

/** Every engine at zero — a day's counters before anything is added. */
function blankEngines(): Record<Engine, number> {
  return Object.fromEntries(ENGINES.map((e) => [e, 0])) as Record<Engine, number>;
}

/**
 * The trend, one entry per scan.
 *
 * Takes the raw log — one row per question per engine per run — and NOT the
 * deduped `latest`. The chart is a history of what each run found; deduping
 * first would keep only each pair's most recent result, so a question checked
 * on the 1st and again on the 8th would contribute to the 8th only and the 1st
 * would silently lose its point. The trend would then always slope up towards
 * today regardless of what actually happened.
 *
 * Runs with no checks are omitted rather than zero-filled. The chart is
 * index-based, so a gap compresses the axis rather than showing a drop to zero —
 * and a zero would claim we asked and found nothing, which is not what happened
 * in a week nobody ran anything.
 *
 * Returns ascending, unique, zero-padded YYYY-MM-DD, which is trackingFromDb's
 * stated contract: the chart splits the string and keys its rows on it.
 */
export function rollUpRuns(all: CitationCheck[]): CitationDay[] {
  /* Oldest first. Every rule below — when a run started, which run a top-up
     follows, which of two answers wins — is about what came before. */
  const chronological = [...all].sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));

  /*
    When each run began.

    A sweep takes several passes and can straddle midnight, so its FIRST check
    is when it started and is the honest label for the whole thing. Dating a run
    by its last check would let a long Sunday-night run appear on Monday.
  */
  const runStart = new Map<string, string>();
  for (const check of chronological) {
    if (!check.runId) continue;
    const started = runStart.get(check.runId);
    if (!started || check.checkedAt < started) runStart.set(check.runId, check.checkedAt);
  }

  /* Run start times, ascending — what a top-up is matched against. */
  const starts = [...runStart.values()].sort((a, b) => a.localeCompare(b));

  /**
   * Which bucket a check belongs in, as a local calendar day.
   *
   * ⚠️ A NULL run_id IS A TOP-UP, AND IT JOINS THE RUN IT FOLLOWS RATHER THAN
   * OPENING ONE. That is the whole fix: "I added a question" updates the point
   * for the scan it came after instead of drawing a new one.
   *
   * ⚠️ THE FALLBACK IS THE CHECK'S OWN DAY, AND IT IS LOAD-BEARING FOR OLD
   * DATA. Rows written before migration 0025 have no run id, and if its
   * backfill has not been applied they all still read null. Folding every one of
   * them into a single bucket would collapse a month of real history into one
   * point; dating them by their own day is exactly what this did before runs
   * existed, so unstamped data keeps behaving as it always has.
   */
  const bucketFor = (check: CitationCheck): string => {
    if (check.runId) return localDay(runStart.get(check.runId) ?? check.checkedAt);

    let followed: string | null = null;
    for (const started of starts) {
      if (started <= check.checkedAt) followed = started;
      else break;
    }
    return localDay(followed ?? check.checkedAt);
  };

  /*
    ⚠️ PAIRS ARE DEDUPED WITHIN A BUCKET, WHICH IS NOT THE SAME AS DEDUPING THE
    LOG. Folding a top-up into the run it follows can put two answers for one
    question+engine in one bucket — the sweep's, and the re-ask's — and counting
    both would report two answers where one question was asked. The later answer
    is the state at the end of that period, so it wins.

    A no-op for everything written before this change: the tracking route
    refuses a pair already asked the same day, so one bucket never held a
    duplicate.
  */
  const buckets = new Map<string, Map<string, CitationCheck>>();
  for (const check of chronological) {
    const date = bucketFor(check);
    let bucket = buckets.get(date);
    if (!bucket) {
      bucket = new Map();
      buckets.set(date, bucket);
    }
    /* Chronological order means a later check simply overwrites an earlier one.

       The separator is \u0000, written as an escape and matching the pair key
       `latest` is built with in store.ts. Question text is arbitrary, so a
       printable separator could appear inside one and let two different pairs
       collide. */
    bucket.set(`${check.question}\u0000${check.engine}`, check);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, bucket]) => {
      const day: CitationDay = {
        date,
        byEngine: blankEngines(),
        checked: 0,
        cited: 0,
        mentioned: 0,
      };

      for (const check of bucket.values()) {
        day.checked += 1;
        if (check.outcome === 'cited') {
          day.byEngine[check.engine] += 1;
          day.cited += 1;
        }
        if (check.outcome === 'mentioned') day.mentioned += 1;
      }

      return day;
    });
}

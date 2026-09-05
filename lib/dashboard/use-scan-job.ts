'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient as supabaseBrowser } from '@/lib/supabase/client';

/*
  Watch one site's onboarding scan.

  ⚠️ ONE HOOK BECAUSE THERE MUST BE ONE POLL LOOP. Two components want this —
  the splash page and the strip that follows the customer around the dashboard —
  and while both are on screen they would otherwise poll separately AND poke the
  runner separately, doubling the request rate for the same information. The
  module-level cache below is what makes a second caller free.

  ⚠️ IT POKES /api/scan/tick AS WELL AS READING. The runner chains itself by
  firing an unawaited request to its own endpoint, but that is best-effort by
  design — a dropped link leaves the job claimable rather than corrupt. A poke on
  each poll turns a stall from "until somebody notices" into "a few seconds".
  Cheap: a tick with nothing claimable returns `{ idle: true }` without touching
  an engine.
*/

export type ScanJob = {
  id: string;
  /* Mirrors Stage in lib/scan/run.ts — the runner writes this column and this
     is the browser's reading of it, so the two lists have to agree. */
  stage: 'audit' | 'questions' | 'topics' | 'tracking' | 'done';
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: {
    checked?: number;
    total?: number;
    questions?: number;
    topics?: number;
    pagesRead?: number;
    /**
     * How many slices have actually been written for this job.
     *
     * ⚠️ THIS IS THE HONEST PROGRESS SIGNAL, AND IT IS WHY THE STALL CHECK USES
     * IT. The tick route increments it in the same UPDATE that advances the
     * stage, so it only moves when a write LANDED. A job spinning on a write
     * that keeps being refused leaves it frozen.
     */
    slices?: number;
  } | null;
  error: string | null;
};

const POLL_MS = 3000;

/**
 * How long a live job may sit without moving before we call it stuck.
 *
 * ⚠️ COMFORTABLY PAST THE 120s LEASE, DELIBERATELY. A crashed slice is not
 * retried until its lease expires, so anything at or under two minutes would
 * call a perfectly healthy recovery a stall. Five minutes is long enough that
 * only a genuine hang reaches it, and short enough that nobody sits in front of
 * a frozen modal wondering.
 */
const STALL_MS = 5 * 60 * 1000;

/**
 * Subscribers per site, so N components share one interval.
 *
 * Module-scoped for the same reason `activeUserId` in the store is: this is
 * client-only code and the alternative — threading a provider through — would
 * change every caller for no behavioural gain.
 */
type Watcher = {
  timer: ReturnType<typeof setInterval> | null;
  listeners: Set<(job: ScanJob | null, checked: boolean, stalled: boolean) => void>;
  last: ScanJob | null;
  checked: boolean;
  /**
   * What "not moving" is measured against: the stage plus the landed slice
   * count.
   *
   * ⚠️ NOT scan_jobs.updated_at, WHICH LOOKS RIGHT AND IS NOT. claim_scan_job()
   * sets updated_at every time it takes the job, so a row being claimed and
   * failing to advance every two minutes has a freshly-updated timestamp the
   * whole time it is going nowhere. Stage and slices only move on a write that
   * succeeded.
   */
  signature: string | null;
  /** When `signature` last changed, in client time. */
  movedAt: number;
};

const watchers = new Map<string, Watcher>();

async function readOnce(siteId: string): Promise<ScanJob | null> {
  const supabase = supabaseBrowser();
  const { data } = await supabase
    .from('scan_jobs')
    .select('id, stage, status, progress, error')
    .eq('site_id', siteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .returns<ScanJob[]>();

  return data?.[0] ?? null;
}

function isLive(job: ScanJob | null): boolean {
  return Boolean(job && job.status !== 'done' && job.status !== 'failed');
}

/**
 * The current scan for a site, or null if there isn't one.
 *
 * `checked` distinguishes "we have not looked yet" from "there is no scan" —
 * without it the strip would flash "no scan is running" at somebody whose scan
 * is running perfectly well.
 */
export function useScanJob(siteId: string | null): {
  job: ScanJob | null;
  checked: boolean;
  /**
   * The job is live but has not moved in STALL_MS.
   *
   * ⚠️ THE FIRE EXIT FOR A DOOR THAT NO LONGER OPENS. The onboarding modal is
   * not dismissible while a scan is running, which is only safe while "running"
   * means "getting somewhere". This is how it finds out that it doesn't.
   */
  stalled: boolean;
} {
  const [job, setJob] = useState<ScanJob | null>(null);
  const [checked, setChecked] = useState(false);
  const [stalled, setStalled] = useState(false);
  const mounted = useRef(true);

  const publish = useCallback((next: ScanJob | null, didCheck: boolean, isStalled: boolean) => {
    if (!mounted.current) return;
    setJob(next);
    setChecked(didCheck);
    setStalled(isStalled);
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!siteId) {
      setJob(null);
      setChecked(true);
      setStalled(false);
      return;
    }

    let watcher = watchers.get(siteId);
    if (!watcher) {
      watcher = {
        timer: null,
        listeners: new Set(),
        last: null,
        checked: false,
        signature: null,
        movedAt: Date.now(),
      };
      watchers.set(siteId, watcher);
    }
    const w = watcher;
    w.listeners.add(publish);

    const stallOf = (j: ScanJob | null) => isLive(j) && Date.now() - w.movedAt > STALL_MS;

    // Hand a late subscriber whatever the loop already knows, so the strip does
    // not sit blank for a poll interval after a page change.
    if (w.checked) publish(w.last, true, stallOf(w.last));

    const tick = async () => {
      const next = await readOnce(siteId);

      /* Forward movement resets the clock. Compared as a string because the two
         fields only matter together: a stage change with the slice count reset,
         or a slice landing inside one stage, are both progress. */
      const signature = next ? `${next.stage}:${next.progress?.slices ?? 0}` : null;
      if (signature !== w.signature) {
        w.signature = signature;
        w.movedAt = Date.now();
      }

      w.last = next;
      w.checked = true;
      const isStalled = stallOf(next);
      for (const listener of w.listeners) listener(next, true, isStalled);

      if (isLive(next)) {
        void fetch('/api/scan/tick', { method: 'POST' }).catch(() => {});
      } else if (w.timer) {
        // Nothing left to watch. Stop rather than poll a finished job forever.
        clearInterval(w.timer);
        w.timer = null;
      }
    };

    if (!w.timer) {
      void tick();
      w.timer = setInterval(() => void tick(), POLL_MS);
    }

    return () => {
      mounted.current = false;
      w.listeners.delete(publish);
      if (w.listeners.size === 0 && w.timer) {
        clearInterval(w.timer);
        w.timer = null;
      }
    };
  }, [siteId, publish]);

  return { job, checked, stalled };
}

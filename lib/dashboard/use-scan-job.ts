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
  stage: 'audit' | 'questions' | 'tracking' | 'done';
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: { checked?: number; total?: number; questions?: number; pagesRead?: number } | null;
  error: string | null;
};

const POLL_MS = 3000;

/**
 * Subscribers per site, so N components share one interval.
 *
 * Module-scoped for the same reason `activeUserId` in the store is: this is
 * client-only code and the alternative — threading a provider through — would
 * change every caller for no behavioural gain.
 */
type Watcher = {
  timer: ReturnType<typeof setInterval> | null;
  listeners: Set<(job: ScanJob | null, checked: boolean) => void>;
  last: ScanJob | null;
  checked: boolean;
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
export function useScanJob(siteId: string | null): { job: ScanJob | null; checked: boolean } {
  const [job, setJob] = useState<ScanJob | null>(null);
  const [checked, setChecked] = useState(false);
  const mounted = useRef(true);

  const publish = useCallback((next: ScanJob | null, didCheck: boolean) => {
    if (!mounted.current) return;
    setJob(next);
    setChecked(didCheck);
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!siteId) {
      setJob(null);
      setChecked(true);
      return;
    }

    let watcher = watchers.get(siteId);
    if (!watcher) {
      watcher = { timer: null, listeners: new Set(), last: null, checked: false };
      watchers.set(siteId, watcher);
    }
    const w = watcher;
    w.listeners.add(publish);

    // Hand a late subscriber whatever the loop already knows, so the strip does
    // not sit blank for a poll interval after a page change.
    if (w.checked) publish(w.last, true);

    const tick = async () => {
      const next = await readOnce(siteId);
      w.last = next;
      w.checked = true;
      for (const listener of w.listeners) listener(next, true);

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

  return { job, checked };
}

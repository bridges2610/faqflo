'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { isPro } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { useScanJob } from '@/lib/dashboard/use-scan-job';
import { ScanMeter, scanStatusLine } from './scan-meter';
import { SiteForm } from './site-form';

/*
  What the customer watches while their site is scanned for the first time.

  ⚠️ THIS PAGE IS NOT THE ENGINE, AND THAT IS THE WHOLE POINT. The work runs
  server-side against a scan_jobs row; this reads that row and pokes the runner.
  Closing the tab loses nothing, which is the difference between this and every
  other long-running thing in the product — runTracking() drives its own loop
  from the browser and says "keep this tab open" out loud.

  Polling and poking both live in useScanJob(), so this and the global strip
  share one loop rather than each running their own.
*/

/**
 * The stages, in the order the runner advances them.
 *
 * ⚠️ Answers is deliberately absent, and its absence is the honest thing here.
 * The other three are measurements — true whether or not the customer agrees.
 * Writing their answers would be authoring content in their voice, and nothing
 * in this product saves model output without a person accepting it first.
 */
const STAGES = [
  { key: 'audit', label: 'Reading your site', done: 'Read your site' },
  { key: 'questions', label: 'Finding the questions people ask', done: 'Found your questions' },
  { key: 'tracking', label: 'Asking the AI engines about you', done: 'Asked the AI engines' },
] as const;

export function ScanProgress({ siteId }: { siteId: string }) {
  const { site, user } = useDashboard();
  const pro = isPro(user);
  const { job, checked } = useScanJob(siteId);

  if (!checked) {
    return (
      <Card className="p-6 sm:p-8">
        <p className="text-slate text-sm">Checking on your scan…</p>
      </Card>
    );
  }

  if (!job) return <NoJob siteId={siteId} />;

  if (job.status === 'failed') {
    /*
      ⚠️ Says what already landed, not just what broke. The stages run in order
      and each writes as it finishes, so a failure in tracking still leaves a
      real audit and a real question list. Telling somebody only that their scan
      failed would send them looking for a dashboard they already have.
    */
    return (
      <Card className="p-6 sm:p-8">
        <h2 className="text-navy text-lg font-semibold">Your scan stopped early</h2>
        <ScanMeter job={job} className="mt-4" />
        <p className="text-slate mt-3 text-sm leading-relaxed">{job.error}</p>
        <p className="text-slate mt-3 text-sm leading-relaxed">
          Anything that finished before this is saved and waiting on your dashboard.
        </p>
        <ButtonLink href="/dashboard" className="mt-5" size="sm">
          Go to your dashboard
        </ButtonLink>
      </Card>
    );
  }

  const position = job.stage === 'done' ? STAGES.length : STAGES.findIndex((s) => s.key === job.stage);
  const finished = job.status === 'done';

  return (
    <Card className="p-6 sm:p-8">
      <h2 className="text-navy text-lg font-semibold">
        {finished ? 'Your site is ready' : 'Setting up your dashboard'}
      </h2>
      <p className="text-slate mt-2 text-sm leading-relaxed">
        {finished
          ? 'Everything below is done. Have a look at what the engines said.'
          : 'This takes a few minutes. You can close this tab — it keeps running without you.'}
      </p>

      <ScanMeter job={job} className="mt-5" />
      {/* The bar is aria-hidden, so this line is what actually carries the
          state. See the contract on meter.tsx. */}
      <p className="text-slate mt-2 text-xs">{scanStatusLine(job)}</p>

      <ol className="mt-5 space-y-3">
        {STAGES.map((stage, i) => {
          const complete = i < position;
          const active = i === position && !finished;
          return (
            <li key={stage.key} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-semibold ${
                  complete
                    ? 'bg-success-ink text-white'
                    : active
                      ? 'bg-primary animate-pulse text-white'
                      : 'bg-cloud text-slate'
                }`}
              >
                {complete ? '✓' : i + 1}
              </span>
              <p className={`text-sm ${complete || active ? 'text-navy font-medium' : 'text-slate'}`}>
                {complete ? stage.done : stage.label}
              </p>
            </li>
          );
        })}
      </ol>

      {/*
        ⚠️ ONE BUTTON ON FREE, AND IT IS NOT /dashboard/tracking. That route is
        Pro-only and redirects a free account to /dashboard, so the primary
        call to action at the end of their very first scan would have bounced
        them — and the second button beside it went to the same place, making
        the pair look like a choice that wasn't one. A free account's results
        ARE the report on /dashboard.
      */}
      {finished && (
        <div className="mt-6 flex flex-wrap gap-3">
          {pro ? (
            <>
              <ButtonLink href="/dashboard/tracking" size="sm">
                See your results
              </ButtonLink>
              <ButtonLink href="/dashboard" variant="ghost" size="sm">
                Dashboard
              </ButtonLink>
            </>
          ) : (
            <ButtonLink href="/dashboard" size="sm">
              See your report
            </ButtonLink>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * Entitled, on the setup page, and no scan exists.
 *
 * ⚠️ THIS USED TO BE A DEAD END, AND THAT COST A REAL CUSTOMER THEIR PURCHASE.
 * It said "No scan is running" and linked to the dashboard — accurate, useless,
 * and the last thing somebody sees who has just paid and whose enqueue failed
 * silently during Stripe fulfilment. Whatever the cause (a missing table, a bad
 * deploy, a dropped connection), the result was a paid account with nothing in
 * it and no way to ask again.
 *
 * So it asks again, once, by itself. The server checks entitlement, so this
 * cannot be used to obtain a scan without paying; a customer who is not
 * entitled gets the refusal and the button does not appear.
 *
 * ⚠️ The ref, not state, is the guard — the same call and the same reason as
 * checkout-start.tsx:44. React double-invokes effects in development, and a
 * state flag set inside the effect is read too late to stop the second run.
 */
function NoJob({ siteId }: { siteId: string }) {
  const { site } = useDashboard();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tried = useRef(false);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/scan/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? 'We could not start your scan.');
        setBusy(false);
        return;
      }
      // Stays busy: the poll in useScanJob will pick the new row up within a
      // few seconds and this component unmounts. Flipping to idle first would
      // flash the button at somebody whose scan has just started fine.
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }, [siteId]);

  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    void start();
  }, [start]);

  if (busy && !error) {
    return (
      <Card className="p-6 sm:p-8">
        <h2 className="text-navy text-lg font-semibold">Starting your scan</h2>
        <p className="text-slate mt-2 text-sm leading-relaxed">
          Getting {site?.name ?? 'your site'} ready. This only takes a moment.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-8">
      <h2 className="text-navy text-lg font-semibold">We couldn&rsquo;t start your scan</h2>
      <p className="text-slate mt-2 text-sm leading-relaxed">
        Your purchase is safe and nothing has been charged twice — this is only the setup run.
      </p>
      {error && <p className="text-slate mt-3 font-mono text-xs">{error}</p>}
      <Button className="mt-5" size="sm" onClick={() => void start()}>
        Try again
      </Button>
    </Card>
  );
}

/**
 * Shown when the customer lands here with no site at all.
 *
 * ⚠️ THE FORM IS HERE ON FREE, NOT A LINK TO IT. /dashboard/sites is Pro-only
 * and bounces a free account to /dashboard, whose own empty state sends them
 * back to this page — a loop, and exactly the dead end the NoJob comment above
 * says cost a real customer their purchase, rebuilt out of redirects.
 *
 * Pro keeps the link: it has a Sites page worth going to, because it can hold
 * more than one.
 */
export function ScanStartEmpty() {
  const { user } = useDashboard();

  return (
    <Card className="p-6 sm:p-8">
      <h2 className="text-navy text-lg font-semibold">Add your site to begin</h2>
      <p className="text-slate mt-2 text-sm leading-relaxed">
        We check what AI assistants say about one site at a time.
      </p>
      {isPro(user) ? (
        <ButtonLink href="/dashboard/sites" className="mt-5" size="sm">
          Add your site
        </ButtonLink>
      ) : (
        <div className="mt-5">
          <SiteForm />
        </div>
      )}
    </Card>
  );
}

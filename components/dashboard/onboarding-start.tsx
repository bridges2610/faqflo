'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { ScanStart } from './scan-start';

/*
  The step between "check my site" on the home page and a dashboard with
  something in it.

  ⚠️ THIS IS WHAT /dashboard/checkout/start USED TO BE, MINUS THE MONEY. That
  screen took a domain carried from the home page audit, created the site row if
  it did not exist, and sent the visitor to Stripe. Free signup replaced the
  purchase, so it now creates the site and starts the first check instead.

  Ideally nobody reads this screen for long. Someone who scanned their site on
  the home page has already told us everything needed, so the common path is:
  this mounts, posts once, and the scan progress takes over.

  It is a client component because the POST must not happen on GET — see the
  warning in app/api/onboarding/start/route.ts. A server component doing this
  work would run on prefetch, creating a site row and spending an Opus call
  every time a mouse crossed the link.
*/
export function OnboardingStart({ domain }: { domain: string | null }) {
  const { sites, loading } = useDashboard();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(Boolean(domain));

  /*
    ⚠️ Guards the auto-start against running twice.

    React runs effects twice on mount in development, and this one spends money:
    a crawl, an Opus discovery call and fifteen engine calls. The server is
    idempotent about it — the (user_id, domain) index catches the second site and
    the one-live-job-per-site index catches the second scan — but relying on a
    unique constraint to absorb a double-fire is a worse guard than not firing
    twice.
  */
  const started = useRef(false);

  useEffect(() => {
    if (!domain || started.current) return;
    started.current = true;

    void (async () => {
      try {
        const res = await fetch('/api/onboarding/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain }),
        });

        const payload = (await res.json()) as { url?: string; error?: string };

        if (!res.ok) {
          setError(payload.error ?? 'Could not start your check. Please try again.');
          setStarting(false);
          return;
        }

        /*
          ⚠️ A HARD NAVIGATION, NOT router.push() OR A STATE UPDATE.

          The site row was created SERVER-SIDE, so the provider — which loaded
          before this ran — does not know it exists, and ScanStart below reads
          the selected site from exactly that snapshot. Left alone it would
          render "add your site to begin" over a site that exists and a scan
          that is already running.

          Going back to the same path WITHOUT ?domain= is what makes this safe to
          land on twice: the effect above sees no domain, does not fire, and the
          page settles into watching the job. A soft navigation would keep the
          same provider instance and the same stale snapshot.
        */
        window.location.assign('/dashboard/start');
      } catch {
        setError('Could not reach the server. Check your connection and try again.');
        setStarting(false);
      }
    })();
    // Only `domain` matters here; the ref is the real guard against a re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain]);

  if (error) {
    return (
      <Card className="p-6 sm:p-8">
        <p role="alert" className="text-error-ink text-[0.9375rem] leading-relaxed">
          {error}
        </p>
        <p className="text-slate mt-3 text-sm leading-relaxed">
          You can add your site by hand from the Sites page, and the check will start from there.
        </p>
      </Card>
    );
  }

  /*
    The flash while the site is being made.

    Only shown when a domain was carried in — somebody who arrived here without
    one already has a site (or has none, which ScanStart says in words), and
    holding them behind a spinner for a request that never fired would be a
    screen that does nothing.
  */
  if (starting || (loading && sites.length === 0)) {
    return (
      <Card className="p-6 sm:p-8">
        <p className="text-slate text-[0.9375rem] leading-relaxed">
          {domain ? (
            <>
              Setting up <span className="text-navy font-semibold">{domain}</span>…
            </>
          ) : (
            'Loading your site…'
          )}
        </p>
      </Card>
    );
  }

  return <ScanStart />;
}

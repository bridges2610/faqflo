'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { normalizeDomain } from '@/lib/dashboard/domain';

/*
  The step between clicking a price and arriving at Stripe.

  Ideally nobody reads this screen. Somebody who scanned their site on the home
  page has already told us everything needed, so the common path is: this
  mounts, posts once, and the browser leaves for Stripe before the text has
  been read. The form only appears for someone who arrived cold.

  It is a client component because the POST must not happen on GET — see the
  warning in app/api/checkout/start/route.ts. A server component doing this
  work would run on prefetch, creating a site row every time a mouse crossed
  the pricing button.
*/

type PickableSite = { id: string; name: string; domain: string; bought: boolean };

export function CheckoutStart({
  domain,
  sites,
}: {
  /** Carried from the home page scan, if there was one. */
  domain: string | null;
  sites: PickableSite[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(Boolean(domain));
  const [typed, setTyped] = useState('');

  /*
    ⚠️ Guards the auto-start against running twice.

    React runs effects twice on mount in development, and this one navigates to
    a payment page. Without the ref the customer gets two Checkout Sessions —
    harmless in the sense that only one can be paid, but it litters the Stripe
    dashboard and makes a real double-charge harder to spot among the noise.
  */
  const started = useRef(false);

  async function start(body: Record<string, string>) {
    setError(null);
    setBusy(true);

    try {
      const res = await fetch('/api/checkout/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const payload = (await res.json()) as { url?: string; error?: string };

      if (!res.ok || !payload.url) {
        setError(payload.error ?? 'Could not start checkout. Please try again.');
        setBusy(false);
        return;
      }

      // Stays busy: the browser is leaving. Flipping back to idle mid-navigation
      // invites a second click and a second session.
      window.location.href = payload.url;
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!domain || started.current) return;
    started.current = true;
    void start({ domain });
    // `start` is stable enough for this one-shot; the ref is the real guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain]);

  /*
    The happy path, and the failed-happy-path.

    When a domain was carried in, this screen is a flash. If it failed, showing
    the form underneath the error is better than a dead end — they can correct
    the address rather than going back to the home page to scan again.
  */
  if (domain && busy) {
    return (
      <Card className="p-6 sm:p-8">
        <p className="text-slate text-[0.9375rem] leading-relaxed">
          Setting up checkout for <span className="text-navy font-semibold">{domain}</span>…
        </p>
        <p className="text-slate mt-2 text-sm">Taking you to Stripe.</p>
      </Card>
    );
  }

  const cleaned = normalizeDomain(typed);
  const usable = cleaned.includes('.');
  const unbought = sites.filter((s) => !s.bought);

  return (
    <Card className="p-6 sm:p-8">
      {error && (
        <p role="alert" className="text-error-ink mb-5 text-sm leading-relaxed">
          {error}
        </p>
      )}

      {unbought.length > 0 && (
        <div className="mb-6">
          <p className="text-navy text-sm font-semibold">One of your sites</p>
          <ul className="mt-3 space-y-2">
            {unbought.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void start({ siteId: s.id })}
                  className="border-line hover:border-primary text-navy w-full rounded-xl border bg-white px-4 py-3 text-left text-sm transition-colors duration-150 disabled:opacity-50"
                >
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-slate ml-2 font-mono text-xs">{s.domain}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-slate mt-4 text-xs">Or set up a new one:</p>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (usable) void start({ domain: cleaned });
        }}
      >
        <label className="block">
          <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
            Which site is this for?
          </span>
          <input
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="yourbusiness.com"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="border-line text-navy focus:border-primary rounded-input mt-1.5 w-full border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150"
          />
        </label>

        {typed.trim() && (
          <p className="text-slate mt-2 text-xs">
            Setting up <code className="text-navy font-mono">{cleaned}</code>
          </p>
        )}

        <Button type="submit" size="md" className="mt-4" disabled={busy || !usable}>
          {busy ? 'Taking you to checkout…' : 'Continue to secure checkout'}
        </Button>
      </form>

      <p className="text-slate mt-5 text-xs leading-relaxed">
        Payment is handled by Stripe — we never see your card details. Get Cited is a one-time
        charge for this site, and includes 90 days of full access.
      </p>
    </Card>
  );
}

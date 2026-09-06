'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { signOut } from '@/lib/auth/actions';
import { HELP_SCOPE_PREFIX, clearFloating } from '@/lib/floating-visibility';
import { isPro } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { PlanBadge } from './plan-badge';
import { ThemeChoice } from './theme';

/*
  Who you are signed in as, and the way out.

  The header had no account surface at all before this — no name, no email, no
  sign-out. That was defensible when the "account" was a seeded object in
  localStorage and there was nothing to sign out of. With real accounts, a
  product you cannot leave is a product people distrust, and on a shared
  computer it is a genuine problem.

  Sign-out is a form POSTing to a Server Action rather than a link to a GET
  route, deliberately. A GET that mutates state gets fired by link prefetchers,
  by antivirus scanners following links in email, and by the browser's own
  speculative loading — all of which would sign people out at random.
*/
/**
 * Cancel, change card, switch plan, download invoices — all on Stripe's side.
 *
 * Shown to everyone rather than only to customers who have bought something.
 * Knowing which is which would mean either threading the Stripe customer id
 * through the provider or firing a request every time the menu opens, and the
 * route already answers honestly when there is nothing to manage. A clear
 * sentence beats a control that silently isn't there.
 */
function ManageBilling() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    setBusy(true);

    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = (await res.json()) as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        setError(data.error ?? 'Could not open billing.');
        setBusy(false);
        return;
      }
      // Busy stays set — the browser is navigating to Stripe.
      window.location.href = data.url;
    } catch {
      setError('Could not reach the server.');
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        role="menuitem"
        onClick={open}
        disabled={busy}
        className="text-slate hover:text-navy w-full text-left text-sm font-medium transition-colors duration-150 disabled:opacity-50"
      >
        {busy ? 'Opening…' : 'Manage billing'}
      </button>
      {error && (
        <p role="alert" className="text-error-ink mt-2 text-xs leading-relaxed">
          {error}
        </p>
      )}
    </>
  );
}

export function AccountMenu() {
  const { user, seedDemoData } = useDashboard();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Escape closes, and so does clicking away. The drawer in this same file's
  // sibling makes the same promise: an overlay that traps you is a bug.
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (!user) return null;

  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();

  return (
    <div className="relative" ref={wrap}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="border-line hover:border-primary rounded-pill flex items-center gap-2 border bg-surface py-1 pr-3 pl-1 transition-colors duration-150"
      >
        <span
          className="bg-primary-soft text-primary flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold"
          aria-hidden="true"
        >
          {initial}
        </span>
        <span className="text-navy hidden max-w-32 truncate text-sm font-medium sm:block">
          {user.name}
        </span>
        <span className="sr-only">Account menu</span>
      </button>

      {open && (
        <div
          role="menu"
          className="border-line shadow-lift absolute right-0 z-50 mt-2 w-64 rounded-xl border bg-surface p-4"
        >
          <p className="text-navy truncate text-sm font-semibold">{user.name}</p>
          {/* Shown because on a shared machine "which account am I in?" is the
              question this menu exists to answer, and a name doesn't answer it. */}
          <p className="text-slate mt-0.5 truncate text-xs">{user.email}</p>

          <div className="mt-3">
            <PlanBadge />
          </div>

          {/* Sites moved here out of the sidebar. It is somewhere you go once,
              when you add a site — not one of the five places worth checking —
              and it sits with billing because both are account settings rather
              than work.

              ⚠️ PRO ONLY, because the page it opens is. A free account is
              capped at one site and /dashboard/sites redirects it to
              /dashboard, so this row would be a menu item that closes the menu
              and goes nowhere. Their one site is named in the header beside
              it. */}
          <div className="border-line mt-4 border-t pt-3">
            {isPro(user) && (
              <Link
                href="/dashboard/sites"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="text-slate hover:text-navy block text-sm font-medium transition-colors duration-150"
              >
                Your sites
              </Link>
            )}
            {/* Beside Sites rather than beside billing: this is the comparison
                and the upgrade, which is a product decision. ManageBilling below
                is the Stripe portal, which is only useful once you are paying.

                The top margin goes with Sites — on free this is the first row
                in the group, and the gap would read as a missing item. */}
            <Link
              href="/dashboard/plan"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`text-slate hover:text-navy block text-sm font-medium transition-colors duration-150 ${
                isPro(user) ? 'mt-2.5' : ''
              }`}
            >
              Your plan
            </Link>
          </div>

          {/* ⚠️ NOT A menuitem, AND THE -mx IS DELIBERATE. The rows above are
              links that close the menu and go somewhere; this is a setting you
              change in place, so it keeps its own radiogroup semantics rather
              than pretending to be a menu item. The negative margin lets the
              track run to the panel's padding edge like the dividers do. */}
          <div className="border-line -mx-1 mt-3 border-t pt-2">
            <ThemeChoice />
          </div>

          <div className="border-line mt-3 border-t pt-3">
            <ManageBilling />
          </div>

          {/* Development affordance, moved off the Overview when that became a
              worklist. It fills the local half with the demo fixture so the
              populated screens can be seen; it cannot grant an entitlement or
              invent a site, because both are Postgres rows. */}
          {process.env.NODE_ENV === 'development' && (
            <div className="border-line mt-3 border-t pt-3">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void seedDemoData();
                  setOpen(false);
                }}
                className="text-slate hover:text-navy w-full text-left text-sm font-medium transition-colors duration-150"
              >
                Fill with demo data
              </button>
            </div>
          )}

          {/*
            ⚠️ THE onSubmit IS NOT COSMETIC — IT IS HALF OF "until you sign in
            again". The help button's dismissal lives in sessionStorage, which
            survives a sign-out because the tab never closed. Without this,
            signing out and back in on the same machine lands on a dashboard
            with the button still hidden, in a session the reader plainly
            considers new.

            It runs alongside the server action rather than instead of it:
            onSubmit does not cancel the form, so the sign-out itself is
            untouched, and clearing a key we are about to stop being able to
            scope is safe even if the sign-out then fails.
          */}
          <form
            action={signOut}
            onSubmit={() => clearFloating(HELP_SCOPE_PREFIX)}
            className="border-line mt-3 border-t pt-3"
          >
            <button
              type="submit"
              role="menuitem"
              className="text-slate hover:text-navy w-full text-left text-sm font-medium transition-colors duration-150"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

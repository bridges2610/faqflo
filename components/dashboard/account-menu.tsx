'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut } from '@/lib/auth/actions';
import { useDashboard } from '@/lib/dashboard/provider';
import { PlanBadge } from './plan-badge';

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
export function AccountMenu() {
  const { user } = useDashboard();
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
        className="border-line hover:border-primary rounded-pill flex items-center gap-2 border bg-white py-1 pr-3 pl-1 transition-colors duration-150"
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
          className="border-line shadow-lift absolute right-0 z-50 mt-2 w-64 rounded-xl border bg-white p-4"
        >
          <p className="text-navy truncate text-sm font-semibold">{user.name}</p>
          {/* Shown because on a shared machine "which account am I in?" is the
              question this menu exists to answer, and a name doesn't answer it. */}
          <p className="text-slate mt-0.5 truncate text-xs">{user.email}</p>

          <div className="mt-3">
            <PlanBadge />
          </div>

          <form action={signOut} className="border-line mt-4 border-t pt-3">
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

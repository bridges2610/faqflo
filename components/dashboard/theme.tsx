'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/*
  Light, dark, or whatever the machine says — for the dashboard only.

  ⚠️ THE ATTRIBUTE GOES ON <html>, NOT ON A WRAPPER. <body> paints
  var(--color-cloud) under a fixed radial wash (app/globals.css @layer base), so
  a themed wrapper inside body would leave the real page background light and
  show it on overscroll and behind anything shorter than the viewport.

  ⚠️ AND IT IS REMOVED WHEN THE DASHBOARD UNMOUNTS, WHICH IS WHAT KEEPS
  MARKETING LIGHT. Because the attribute lives on the document rather than on a
  subtree, a client-side navigation from /dashboard to / would otherwise carry
  dark mode onto pages that have no dark palette at all.

  ⚠️ WHICH IS WHY THE LIFECYCLE LIVES IN A PROVIDER AND NOT IN THE CONTROL, AND
  THAT DISTINCTION IS A BUG FIX, NOT A PREFERENCE. All of this used to sit in a
  hook called by ThemeChoice — and ThemeChoice renders inside `{open && (…)}` in
  account-menu.tsx, so it unmounts every time the menu closes. The cleanup below
  then stripped the attribute the instant the customer clicked away: choosing
  Dark applied it, closing the menu reverted it, and re-opening re-applied it.

  The rule this encodes: the thing that owns the document attribute must live
  exactly as long as the dashboard does. A popover is not that. Do not move any
  of these effects back into a component that can unmount on its own.
*/

export type ThemePref = 'system' | 'light' | 'dark';

export const THEME_KEY = 'faqflo-theme';

const PREFS: { id: ThemePref; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemIsDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches;
}

/** Put the attribute on, or take it off. The single writer. */
function paint(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && systemIsDark());
  if (dark) document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
}

/**
 * What the browser already decided, read back.
 *
 * ⚠️ localStorage THROWS, IT DOES NOT JUST RETURN NULL. Safari in private mode
 * and any browser set to block site data raise on access, and an exception here
 * would take down the whole dashboard shell on mount. System is the safe answer
 * when we cannot know.
 */
function storedPref(): ThemePref {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
  } catch {
    return 'system';
  }
}

/** Every route in the (app) group lives under this prefix. */
const DASHBOARD_PREFIX = '/dashboard';

/*
  ⚠️ THIS RUNS BEFORE PAINT, AND THAT IS THE ENTIRE REASON IT IS A RAW STRING.

  Applying the theme from a React effect means the first frame is always light:
  the browser paints the server's HTML, then hydration flips it, and a dark-mode
  user gets a white flash on every single dashboard load. A synchronous script in
  the markup executes as the document is parsed, so the attribute is set before
  anything is painted.

  It duplicates paint() above rather than importing it — a module import cannot
  run before hydration, which is precisely the problem. Keep the two in step.

  ⚠️ IT GATES ON THE PATH BECAUSE IT LIVES IN THE ROOT LAYOUT, AND IT LIVES
  THERE BECAUSE A NESTED LAYOUT CANNOT CARRY A SCRIPT. This was rendered from
  app/(app)/layout.tsx, and React said so out loud: "Encountered a script tag
  while rendering React component. Scripts inside React components are never
  executed when rendering on the client." A nested layout DOES render on the
  client — soft-navigating from a marketing page into /dashboard — and the tag
  is inert when it does. app/layout.tsx owns <html> and is never re-rendered
  client-side, so the tag is only ever server-rendered from there.

  The move costs the scoping that came from WHERE it was mounted, so the script
  now checks the path itself. Without this line every marketing page would
  theme itself dark for anyone who had ever chosen dark in the dashboard.
*/
const NO_FLASH = `(function(){try{
if(location.pathname.indexOf('${DASHBOARD_PREFIX}')!==0)return;
var p=localStorage.getItem('${THEME_KEY}')||'system';
if(p==='dark'||(p==='system'&&matchMedia('${DARK_QUERY}').matches))
document.documentElement.dataset.theme='dark';
}catch(e){}})()`;

/**
 * The inline script.
 *
 * ⚠️ RENDERED BY app/layout.tsx — THE ROOT LAYOUT — AND NOWHERE ELSE. See the
 * note above NO_FLASH for why a nested layout cannot host it.
 */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />;
}

type ThemeContext = {
  /** null while the stored preference has not been read yet. */
  pref: ThemePref | null;
  choose: (next: ThemePref) => void;
};

const Ctx = createContext<ThemeContext>({ pref: null, choose: () => {} });

/*
  How many ThemeProviders are mounted. Module state on purpose: it has to
  outlive the component instance, which is the whole point — see the cleanup in
  ThemeProvider. In practice this is only ever 0 or 1.
*/
let mountedProviders = 0;

export function useTheme(): ThemeContext {
  return useContext(Ctx);
}

/**
 * Owns the document attribute for as long as the dashboard is mounted.
 *
 * Mounted by app/(app)/layout.tsx around AppShell. Nothing else should mount it,
 * and no other component should write `dataset.theme`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  /*
    ⚠️ null MEANS "NOT READ YET", AND IT IS LOAD-BEARING AGAINST THE FLASH.

    Starting at 'system' and applying straight away breaks the one case the
    no-flash script exists for: stored `dark` on a LIGHT machine. The script
    would set dark before paint, then this would apply 'system', see a light OS,
    remove the attribute — a white flash — and only then read `dark` back and
    reapply. While null the apply effect does nothing, so the script's answer
    stands until the real preference is known.

    ⚠️ AND IT IS NOT SEEDED BY READING localStorage DURING RENDER. That is a
    side effect in render, and it makes the control's aria-checked differ
    between the server HTML and the first client render.
  */
  const [pref, setPref] = useState<ThemePref | null>(null);

  useEffect(() => {
    setPref(storedPref());
  }, []);

  useEffect(() => {
    if (pref === null) return;

    paint(pref);

    /* Somebody whose machine switches to dark at sundown should see the
       dashboard follow without reloading. Only meaningful on 'system'. */
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      if (pref === 'system') paint('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  /*
    The scoping cleanup. Fires when the DASHBOARD unmounts — a cross-group
    navigation to a marketing page — and never when a popover closes.

    ⚠️ COUNTED AND DEFERRED, BECAUSE A BARE DELETE FLASHES IN DEVELOPMENT.
    React StrictMode mounts, tears down and remounts every effect, so a cleanup
    that deleted unconditionally removed the attribute the no-flash script had
    just set. Measured with a MutationObserver on <html>: the attribute went
    null → dark → null → dark on a single load, and that third state is a white
    flash on every dashboard page.

    The counter survives the teardown because it is module state, and the
    timeout lets the immediate remount put it back before anything is read: on
    a StrictMode cycle the count is 1 → 0 → 1 and the delete is skipped, while
    on a real navigation away it stays 0 and the delete runs.
  */
  useEffect(() => {
    mountedProviders += 1;
    return () => {
      mountedProviders -= 1;
      setTimeout(() => {
        if (mountedProviders === 0) delete document.documentElement.dataset.theme;
      }, 0);
    };
  }, []);

  function choose(next: ThemePref) {
    setPref(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* Blocked storage still themes this session; it just will not persist. */
    }
  }

  return <Ctx.Provider value={{ pref, choose }}>{children}</Ctx.Provider>;
}

/**
 * The control, for the account menu.
 *
 * ⚠️ A PURE CONSUMER — NO EFFECTS, NO CLEANUP. It is rendered inside the
 * account menu's `{open && …}`, so it mounts and unmounts constantly. Anything
 * with a lifecycle here is the bug described at the top of this file.
 *
 * ⚠️ A RADIO GROUP, NOT A SWITCH. A two-state toggle cannot express "follow the
 * machine", and that is the default — so a switch would have to either drop
 * System or lie about which state it is in.
 */
export function ThemeChoice() {
  const { pref, choose } = useTheme();

  // Before the read resolves, System is the honest thing to show: it is the
  // default, and it is what an account with no stored preference gets.
  const selected = pref ?? 'system';

  return (
    <div className="px-3 py-2">
      <p className="text-slate mb-1.5 text-xs font-semibold">Theme</p>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="bg-cloud border-line flex items-center gap-1 rounded-pill border p-1"
      >
        {PREFS.map((option) => {
          const active = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(option.id)}
              className={`flex-1 rounded-pill px-2 py-1 text-xs transition-all duration-200 ${
                active
                  ? 'bg-surface text-navy shadow-soft font-semibold'
                  : 'text-slate hover:text-navy'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

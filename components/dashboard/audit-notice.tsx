'use client';

import type { AuditPhase } from '@/lib/audit/run';
import { useDashboard } from '@/lib/dashboard/provider';

/*
  A check is running, said somewhere it cannot be mistaken for the page.

  ⚠️ THE FIRST FIXED OVERLAY IN THIS DASHBOARD, AND THAT IS A DEPARTURE. The
  house pattern for "something is running" is a bordered banner in the notice
  slot — ScanNotice and RunNotice both sit there, above the page content. This
  one is pinned to the viewport instead, for two reasons the banner could not
  meet:

    1. It read as body copy. The line lived under the greeting's description,
       two slate paragraphs of the same size stacked together, and a system
       message about work in flight is not the same kind of thing as the
       sentence explaining the page.

    2. A check takes about a minute and Home is long — tiles, a chart, a
       worklist, three blog cards. Anything at the top scrolls away, so anyone
       who scrolled while waiting lost every signal that it was still going.

  ⚠️ RENDERED BY AppShell, NOT BY A PAGE, so it follows you: start a check on
  Home, walk to the Audit page, and it comes with you. Only possible because the
  run state lives on the provider — see the note on runAudit there for why it
  had to.

  ⚠️ NO DISMISS. It leaves when the run ends. A control that hides a live
  process invites somebody to close it and then wonder whether the check is
  still going.
*/
/*
  The three phases, in the order runAudit reaches them.

  ⚠️ THE LABELS DESCRIBE THE WORK, NOT THE CODE. "fullFindings" and
  "buildPillars" mean nothing to somebody who runs a roofing company; what they
  want to know is whether we are still fetching or nearly done.

  ⚠️ AND `reading` HOLDS FOR ALMOST THE WHOLE RUN. It is network I/O across up
  to a hundred pages while the other two are local computation — see the note on
  AuditPhase in lib/audit/run.ts. The list is honest about where the function
  is; it is not a promise that the three take equal time.
*/
const PHASES: { key: AuditPhase; label: string }[] = [
  { key: 'reading', label: 'Reading your pages' },
  { key: 'checking', label: 'Checking how they’re written' },
  { key: 'scoring', label: 'Working out your score' },
];

export function AuditNotice() {
  const { site, auditBusy, auditPhase } = useDashboard();

  if (!auditBusy) return null;

  /* Before the first marker arrives the request is in flight but the server has
     not started reading — treat that as the first phase rather than showing
     nothing, since it is what happens next. */
  const at = Math.max(
    0,
    PHASES.findIndex((p) => p.key === (auditPhase ?? 'reading')),
  );

  return (
    /*
      ⚠️ z-40 EXACTLY, and the layers either side are the reason. z-30 is the
      sticky publish bar on Answers, which this has to clear; z-50 is the mobile
      drawer and the account menu, which have to clear THIS — a toast floating
      over an open menu would be the wrong way round.

      Full width with margins on a phone, a fixed card at the bottom right from
      sm up, where it sits clear of the content column.
    */
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-40 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-80 print:hidden"
    >
      {/*
        ⚠️ NAVY WITH WHITE TEXT, WHICH IS ONE OF THE TWO SANCTIONED WHITE-ON-FILL
        PAIRS IN THIS PRODUCT — 17.04:1, alongside bg-primary at 5.17:1. On a
        white page a white card had to lean on its border and shadow to be seen
        at all; a dark one is unmistakably a thing in front of the page rather
        than part of it.

        Every value below was measured against #0b1b3a rather than eyeballed:
          white       17.04:1     accent  #22d3ee   9.43:1
          white/70     8.84:1     success #22c55e   7.48:1
          white/55     5.88:1     primary #2563eb   3.30:1  ← unusable here
        `primary` is the brand blue and it is nearly invisible on navy, so the
        moving parts use `accent` instead. It stays fill-only, beside the words
        and never carrying them, as globals.css requires.
      */}
      <div className="bg-ink shadow-lift rounded-xl p-4">
        <div className="flex items-center gap-2.5">
          {/* Decoration. The heading beside it says what is happening, and the
              list below says how far along — this only signals "moving". */}
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10"
          >
            <span className="bg-accent h-2 w-2 animate-pulse rounded-full" />
          </span>
          <p className="text-sm font-semibold text-white">
            Checking {site ? site.name : 'your site'}
          </p>
        </div>

        <ol className="mt-3 space-y-2">
          {PHASES.map((p, i) => {
            const done = i < at;
            const current = i === at;
            return (
              <li key={p.key} className="flex items-center gap-2.5">
                {/* ⚠️ THE MARK IS NEVER THE MEANING. Each row carries its state
                    as a word for a screen reader, because a filled circle and a
                    hollow one are the same smudge at this size — the rule
                    components/ui/status-icon.tsx sets out. */}
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    done ? 'bg-success' : current ? 'bg-accent animate-pulse' : 'bg-white/30'
                  }`}
                />
                <span
                  className={`text-xs leading-snug ${
                    current ? 'font-medium text-white' : done ? 'text-white/70' : 'text-white/55'
                  }`}
                >
                  {p.label}
                  <span className="sr-only">
                    {done ? ' — done' : current ? ' — in progress' : ' — not started'}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        {/* ⚠️ STEPPED, NOT SMOOTH, AND SAID PLAINLY. The bar moves when the run
            crosses a real boundary and sits still between them, because that is
            the only progress the server actually reports. A bar creeping
            between steps would be a clock pretending to be a measurement. */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/15" aria-hidden="true">
          <div
            className="bg-accent h-full rounded-full transition-[width] duration-500"
            style={{ width: `${((at + 1) / PHASES.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

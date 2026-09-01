'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Sparkle } from '@/components/ui/doodle';
import type { AuditReport } from '@/lib/audit/types';
import type { Task } from '@/lib/dashboard/worklist';
import { TaskRow } from './task-row';

/*
  The work, full width at the bottom of Home.

  ⚠️ IT MOVED WHOLE, NOT SUMMARISED, AND THAT IS NOT NEGOTIABLE. buildWorklist
  is BROADER than the audit's action plan — it is report.actions plus product
  tasks like "re-paste your answers onto your site" — so no other page holds
  this list. A teaser linking elsewhere would remove the ability to act from
  Home and point at a page missing the extra items. TaskRow keeps its
  copy-to-clipboard snippets and deep links for the same reason.

  ⚠️ FULL WIDTH BECAUSE IT IS THE TALLEST THING ON THE PAGE. Five tasks with
  code blocks run past 1,200px. Beside it sat a 500px card, and the gap under
  that card was the thing Beau called boring. Nothing is parked next to this
  any more.

  ⚠️ THREE SHOWN, THE REST BEHIND A TOGGLE — AND THE ORDER IS WHAT MAKES THAT
  SAFE. buildWorklist sorts criticals first and then on impact over effort, so
  the three on screen are genuinely the three to do. Cutting an unranked list at
  three would just be hiding work.

  ⚠️ AND NOTHING IS DROPPED. The count in the button is the real remainder, so
  the page never implies there are three when there are five. Same reason the
  audit's check groups print their counts while collapsed.
*/

/** How many tasks show before the reader asks for the rest. */
const SHOWN = 3;
export function HomeWorklist({ report, tasks }: { report: AuditReport | null; tasks: Task[] }) {
  const [showAll, setShowAll] = useState(false);

  if (tasks.length > 0) {
    const shown = showAll ? tasks : tasks.slice(0, SHOWN);
    const hidden = tasks.length - shown.length;

    return (
      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[0.9375rem] font-bold tracking-normal">Do these next</h2>
          <p className="text-slate text-xs">Highest payoff for the least work, in order.</p>
        </div>

        <ul id="worklist" className="divide-line mt-2 divide-y">
          {shown.map((task, i) => (
            <TaskRow key={task.id} task={task} index={i} />
          ))}
        </ul>

        {tasks.length > SHOWN && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            aria-controls="worklist"
            className="text-primary hover:text-primary-hover border-line mt-4 w-full border-t pt-4 text-sm font-semibold transition-colors duration-150"
          >
            {showAll
              ? 'Show fewer'
              : `Show ${hidden} more ${hidden === 1 ? 'thing' : 'things'} to do`}
          </button>
        )}
      </Card>
    );
  }

  /* Nothing to do and nothing measured: a brand-new account is being walked
     through the setup checklist above, and a second empty panel under it would
     be furniture. */
  if (!report) return null;

  return (
    <Card className="p-5 sm:p-7">
      {/* The one doodle in the dashboard, and it is here because this is the one
          screen state that marks something achieved rather than something to
          do. Fill-only cyan, as globals.css requires: beside the words, never
          carrying them. */}
      <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold tracking-normal">
        <Sparkle className="text-accent h-4 w-4 shrink-0" />
        Nothing needs you right now
      </h2>
      <p className="text-slate mt-1.5 text-[0.9375rem] leading-relaxed">
        Your answers are live and current, and the last check found nothing worth fixing. Come back
        after your next round of changes to the site.
      </p>
    </Card>
  );
}

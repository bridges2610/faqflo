'use client';

import { useState } from 'react';
import { useDashboard } from '@/lib/dashboard/provider';
import { useScanJob } from '@/lib/dashboard/use-scan-job';
import { OnboardingModal } from './onboarding-modal';
import { OnboardingProfile } from './onboarding-profile';

/*
  Picks between the popup and the plain form, and is the reason there is only
  ever one of the latter.

  ⚠️ ONE MOUNT OF OnboardingProfile IN THE TREE, EVER. It holds what the
  customer has typed in local state, so a second instance — the page keeping its
  own copy while the modal renders another — would give two forms two drafts,
  and whichever one they did not press Save in would be thrown away silently.
  That is why the start page renders this and nothing else.

  ⚠️ THE MODAL IS FOR A SCAN THAT EXISTS. Somebody revisiting /dashboard/start
  after their scan finished, or landing there with no job at all, gets the form
  on the page rather than a popup celebrating work that is not happening.

  useScanJob adds no polling here: its watcher map is module-scoped so every
  consumer of one site shares a single interval.
*/
export function OnboardingExperience() {
  const { site } = useDashboard();
  const { job, stalled } = useScanJob(site?.id ?? '');
  const [dismissed, setDismissed] = useState(false);

  if (!site) return null;

  /*
    ⚠️ THE MODAL IS A HOLD NOW, AND THIS IS WHERE THAT IS DECIDED.

    It used to always take an onClose, on the reasoning that the scan runs
    server-side and scan-notice.tsx follows the customer around with its
    progress — so leaving cost nothing but patience. The scan has since grown to
    fill the dashboard: questions, a content plan, a first page, citation checks.
    Leaving early now means arriving on four screens that are empty *because the
    work is still running*, and an empty screen reads as broken rather than as
    unfinished. Every one of those blank pages out-argues the strip.

    So the way out is offered in exactly two states, and both are cases where
    waiting has stopped being worth anything:

      - `failed`  — the job has given up. There is nothing left to wait for, and
                    a modal with no exit over a dead job is a trap.
      - `stalled` — live, but nothing has landed in five minutes. useScanJob
                    measures that from the stage and the slice count rather than
                    updated_at; see the note on `signature` there for why that
                    distinction is load-bearing.

    Anything else — queued, running, done — holds. `done` holds because the modal
    moves people on by itself the moment the profile form is resolved, which is a
    handover rather than a dead end.
  */
  const mayLeave = job?.status === 'failed' || stalled;

  if (job && !dismissed) {
    return (
      <OnboardingModal
        job={job}
        stalled={stalled}
        onClose={mayLeave ? () => setDismissed(true) : undefined}
      />
    );
  }

  return <OnboardingProfile />;
}

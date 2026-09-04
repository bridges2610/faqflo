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
  const { job } = useScanJob(site?.id ?? '');
  const [dismissed, setDismissed] = useState(false);

  if (!site) return null;

  /* Dismissing hands them the same questions inline, so closing the popup is
     never the thing that loses them the chance to answer. */
  if (job && !dismissed) {
    return <OnboardingModal job={job} onClose={() => setDismissed(true)} />;
  }

  return <OnboardingProfile />;
}

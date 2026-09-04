'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { TickIcon } from './nav-icons';
import { OnboardingProfile } from './onboarding-profile';
import { ScanMeter } from './scan-meter';
import type { ScanJob } from '@/lib/dashboard/use-scan-job';

/*
  The first two minutes, with something in them.

  ⚠️ THE ANTICIPATION IS EVIDENCE ARRIVING, NOT MOTION. writing-progress.tsx
  settles this for the codebase: "what makes that bearable is not motion, it is
  seeing the thing being made". Every figure below comes off the scan job's own
  progress payload — pages crawled, questions found, engine checks completed —
  so a row landing means work landed. Nothing here runs on a timer.

  ⚠️ AND NOTHING IS SHOWN THAT WAS NOT MEASURED. Each of `pagesRead`,
  `questions`, `checked` and `total` is optional on ScanJob, and a stage that
  reports none of them shows its label alone. audit-notice.tsx and
  scan-meter.tsx both refuse invented figures for the same reason; a "0 pages"
  under a finished crawl would be a worse lie than silence.

  ⚠️ IT IS DISMISSIBLE, UNLIKE writing-modal.tsx, AND THE DIFFERENCE IS REAL.
  That panel is the only place its article ever appears, so closing it would
  lose the thing. This scan runs server-side — closing the tab entirely does not
  stop it — and scan-notice.tsx keeps reporting it on every other screen. So
  there is somewhere to dismiss to, and holding somebody still for two minutes
  is the opposite of the smoothness this was built for.
*/

const STAGES = [
  { key: 'audit', running: 'Reading your site', done: 'Read your site' },
  { key: 'questions', running: 'Finding the questions people ask', done: 'Found your questions' },
  { key: 'tracking', running: 'Asking the AI engines about you', done: 'Asked the AI engines' },
] as const;

const ORDER = ['audit', 'questions', 'tracking', 'done'] as const;

/**
 * What a finished stage has to show for itself, or null when it counted nothing.
 *
 * ⚠️ null IS A REAL ANSWER HERE. The runner writes whichever fields its stage
 * produced, and an older job or a partial write simply has none — in which case
 * the row says it finished and stops talking, rather than reaching for a zero.
 */
function evidenceFor(stage: string, job: ScanJob): string | null {
  const { pagesRead, questions, checked, total } = job.progress ?? {};

  if (stage === 'audit' && typeof pagesRead === 'number' && pagesRead > 0) {
    return `${pagesRead} ${pagesRead === 1 ? 'page' : 'pages'} read`;
  }
  if (stage === 'questions' && typeof questions === 'number' && questions > 0) {
    return `${questions} ${questions === 1 ? 'question' : 'questions'} people ask`;
  }
  if (stage === 'tracking' && typeof checked === 'number' && typeof total === 'number' && total > 0) {
    return `${checked} of ${total} asked`;
  }
  return null;
}

export function OnboardingModal({ job, onClose }: { job: ScanJob; onClose: () => void }) {
  const router = useRouter();
  const current = ORDER.indexOf(job.stage);
  const finished = job.status === 'done';
  const failed = job.status === 'failed';

  return (
    <Overlay labelledBy="onboarding-modal-title" onClose={onClose} className="max-w-lg">
      <h2 id="onboarding-modal-title" className="text-navy text-[1.25rem]">
        {finished ? 'Your dashboard is ready' : 'Setting you up'}
      </h2>
      <p className="text-slate mt-1.5 text-sm leading-relaxed">
        {finished
          ? 'Everything below is measured from your own site and from what the engines actually said.'
          : 'This takes a minute or two. You can close this — it keeps running either way.'}
      </p>

      {/* The same weighted bar the page uses, so the two can never disagree
          about how far along this is. aria-hidden by its own contract; the rows
          underneath are the text version. */}
      <ScanMeter job={job} className="mt-4" />

      <ul className="mt-4 space-y-2">
        {STAGES.map((stage, i) => {
          const isDone = finished || i < current;
          const isRunning = !finished && !failed && i === current;
          const evidence = isDone ? evidenceFor(stage.key, job) : null;

          return (
            <li
              key={stage.key}
              /* ⚠️ key BY STAGE, AND THE ANIMATION IS ON THE INNER ROW STATE.
                 Re-keying on status would remount every row on every poll and
                 replay the entrance three times a second. */
              className={`flex items-center gap-3 rounded-input px-3 py-2 ${
                isDone ? 'bg-cloud' : ''
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  isDone
                    ? 'bg-primary text-white'
                    : isRunning
                      ? 'bg-primary/20 animate-pulse'
                      : 'bg-cloud'
                }`}
                aria-hidden="true"
              >
                {isDone ? <TickIcon className="h-3 w-3" /> : null}
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm ${isDone || isRunning ? 'text-navy' : 'text-slate'}`}
                >
                  {isDone ? stage.done : stage.running}
                  {/* The word a screen reader needs, since the tick is a glyph
                      and the pulse is a colour. */}
                  <span className="sr-only">
                    {isDone ? ' — done' : isRunning ? ' — in progress' : ' — not started yet'}
                  </span>
                </span>

                {/* ⚠️ THE PAYOFF, AND ONLY WHEN IT EXISTS. motion-rise runs on
                    first paint because this line has no previous state to
                    transition from — see the keyframe's note in globals.css. */}
                {evidence ? (
                  <span className="motion-rise text-primary block text-xs font-semibold">
                    {evidence}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      {failed ? (
        <p role="alert" className="text-error-ink mt-4 text-sm leading-relaxed">
          That stopped early. Whatever finished above is saved and on your dashboard.
        </p>
      ) : null}

      {/* ⚠️ ONE MOUNT OF THE FORM IN THE WHOLE TREE. The start page renders this
          modal INSTEAD of its own copy, never as well as — two instances hold
          separate edited state and one of them silently loses what was typed. */}
      {/* No padding of its own: OnboardingProfile is a Card carrying mt-5, and
          adding pt-5 here would stack two gaps. */}
      <div className="border-line mt-5 border-t">
        <OnboardingProfile />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {finished ? (
          <Button size="sm" onClick={() => router.push('/dashboard')}>
            See my dashboard
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" type="button" onClick={onClose}>
          {finished ? 'Stay here' : 'Close and keep it running'}
        </Button>
      </div>
    </Overlay>
  );
}

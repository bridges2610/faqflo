'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { useDashboard } from '@/lib/dashboard/provider';
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
  { key: 'topics', running: 'Working out what to write', done: 'Picked what to write' },
  { key: 'tracking', running: 'Asking the AI engines about you', done: 'Asked the AI engines' },
] as const;

const ORDER = ['audit', 'questions', 'topics', 'tracking', 'done'] as const;

/**
 * What a finished stage has to show for itself, or null when it counted nothing.
 *
 * ⚠️ null IS A REAL ANSWER HERE. The runner writes whichever fields its stage
 * produced, and an older job or a partial write simply has none — in which case
 * the row says it finished and stops talking, rather than reaching for a zero.
 */
function evidenceFor(stage: string, job: ScanJob): string | null {
  const { pagesRead, questions, topics, checked, total } = job.progress ?? {};

  if (stage === 'audit' && typeof pagesRead === 'number' && pagesRead > 0) {
    return `${pagesRead} ${pagesRead === 1 ? 'page' : 'pages'} read`;
  }
  if (stage === 'questions' && typeof questions === 'number' && questions > 0) {
    return `${questions} ${questions === 1 ? 'question' : 'questions'} people ask`;
  }
  /* > 0 rather than a number check, and it matters here more than elsewhere:
     the topics stage swallows its own failures and reports 0 so the scan can
     carry on to tracking. "0 topics to write" under a ticked line would be the
     invented figure this file's header refuses. Silence is the honest render. */
  if (stage === 'topics' && typeof topics === 'number' && topics > 0) {
    return `${topics} ${topics === 1 ? 'topic' : 'topics'} to write`;
  }
  if (stage === 'tracking' && typeof checked === 'number' && typeof total === 'number' && total > 0) {
    return `${checked} of ${total} asked`;
  }
  return null;
}

export function OnboardingModal({
  job,
  onClose,
  stalled = false,
}: {
  job: ScanJob;
  /**
   * How to leave — **or `undefined`, which is what makes this modal a hold.**
   *
   * ⚠️ THIS USED TO BE MANDATORY, AND THE REVERSAL IS DELIBERATE. The note that
   * stood here argued the scan runs server-side, scan-notice.tsx reports it on
   * every other screen, and "holding somebody still for two minutes is the
   * opposite of the smoothness this was built for". That was true while the only
   * cost of leaving was impatience.
   *
   * It stopped being true when the scan started filling the whole dashboard.
   * Closing early now lands somebody on Content, Competitors and AI Mentions
   * that are empty *because the work is still running* — and an empty screen
   * does not read as "not finished", it reads as broken. The strip was never
   * going to out-argue four blank pages.
   *
   * So the caller passes this only when leaving genuinely costs nothing —
   * exactly the condition components/ui/overlay.tsx sets for the same prop.
   * onboarding-experience.tsx owns that decision; see it for the two cases.
   */
  onClose?: () => void;
  /** Live, but not moving. Never true at the same time as a failed status. */
  stalled?: boolean;
}) {
  const router = useRouter();
  const current = ORDER.indexOf(job.stage);
  const finished = job.status === 'done';
  const failed = job.status === 'failed';

  /*
    Has the person finished with the profile form below?

    ⚠️ SEEDED FROM THE SITE ROW, NOT FROM false. profileSource === 'manual' can
    only have come from a person, so somebody who answered on a previous visit
    has already resolved this and must not be made to answer again before the
    modal will let them through. OnboardingProfile returns null in that case, so
    without the seed there would be no form on screen and no way to satisfy the
    condition — a locked modal with nothing to do in it.
  */
  const { site } = useDashboard();
  const [profileResolved, setProfileResolved] = useState(site?.profileSource === 'manual');

  /*
    ⚠️ THE MOVE TO THE REPORT IS AUTOMATIC, AND IT WAITS FOR TWO THINGS.

    The scan finishing is what triggers it — that is the whole point of holding
    somebody here rather than letting them wander into a half-built dashboard.
    But the form above holds what they have typed in local state, so firing the
    moment the last stage lands would discard a half-typed industry with no
    warning. Waiting for saved-or-skipped costs nothing when they are already
    done (the seed above makes it immediate) and costs a keystroke otherwise.

    replace() rather than push(): this screen is finished with, and leaving it in
    the history means the back button returns somebody to a modal that will
    immediately try to move them forward again.
  */
  /*
    ⚠️ ONLY A SCAN THAT FINISHED WHILE SOMEBODY WATCHED IT MOVES THEM ON.

    Seeded at mount, so a job that was ALREADY done when this rendered never
    triggers the redirect. Without the guard, /dashboard/start becomes a page
    nobody can open again: every later visit finds a completed job and bounces
    straight to the report. The existing note in onboarding-experience.tsx
    describes that revisit as a real case — somebody landing there after their
    scan should get the screen, not a redirect and a celebration of work that
    finished last week.

    The handover is for the moment of completion, which is the only moment it
    means anything.
  */
  const [wasFinishedOnMount] = useState(finished);

  /*
    ⚠️ A SHORT HOLD BEFORE THE MOVE, AND IT IS NOT THE THING globals.css BANS.

    That rule is about motion "between events nobody measured — a clock
    pretending to be a measurement". This is the opposite case: every stage has
    landed, the meter is full, and the payoff state exists. Without the pause
    that state is rendered and navigated away from inside the same tick, so the
    one frame that says "your dashboard is ready" is never seen — which is the
    whole thing somebody just waited two minutes for. Nothing here claims
    progress; it holds still on a result that is already true.

    Cleared on unmount so a fast Skip cannot fire a navigation into a modal that
    has already gone.
  */
  useEffect(() => {
    if (!finished || wasFinishedOnMount || !profileResolved) return;
    const t = setTimeout(() => router.replace('/dashboard/audit'), 1200);
    return () => clearTimeout(t);
  }, [finished, wasFinishedOnMount, profileResolved, router]);

  /*
    ⚠️ max-w-2xl IS MEASURED AGAINST THE FORM'S CONTAINER QUERY, NOT PICKED FOR
    LOOKS — AND max-w-xl WOULD HAVE LOOKED WIDER WHILE CHANGING NOTHING.

    OnboardingProfile lays its fields out with `@lg:grid-cols-2`, a CONTAINER
    query, precisely because it renders both inline and in here; its own note
    records that a viewport query "laid three fields across 424px and clipped
    every placeholder". @lg is 32rem = 512px of container, and the container is
    the Card's content box, so the arithmetic decides the width:

      max-w-lg  512 − 48 (Overlay p-6) = 464 → Card inner 416px → one column
      max-w-xl  576 − 48               = 528 → Card inner 480px → STILL one
      max-w-2xl 672 − 48               = 624 → Card inner 576px → two columns

    So this is the first standard step that actually reaches the threshold. The
    payoff is not only width: two columns halve the field stack, and this modal
    cannot be closed while a scan runs, so its height is the thing somebody is
    stuck with.

    Overlay's `className` is a DEFAULT PARAMETER and its base string carries no
    max-w of its own, so this replaces rather than competes — unlike the
    `rounded-2xl` trap its line 128 warns about, where two utilities of one kind
    are resolved by stylesheet order rather than by the class attribute.
  */
  return (
    <Overlay labelledBy="onboarding-modal-title" onClose={onClose} className="max-w-2xl">
      <h2 id="onboarding-modal-title" className="text-navy text-[1.25rem]">
        {finished ? 'Your dashboard is ready' : stalled ? 'This is taking longer than it should' : 'Setting you up'}
      </h2>
      <p className="text-slate mt-1.5 text-sm leading-relaxed">
        {finished
          ? 'Everything below is measured from your own site and from what the engines actually said.'
          : stalled
            ? // ⚠️ NO INVENTED DIAGNOSIS. We know it has stopped moving and we do
              // not know why, so this says exactly that and hands back control.
              // Whatever finished is stored and is on the dashboard already.
              'Your scan has stopped moving. Whatever finished is saved and already on your dashboard — you can carry on and we’ll keep trying in the background.'
            : // ⚠️ NO LONGER OFFERS TO BE CLOSED. It cannot be, until it is done.
              'This takes a minute or two. Hang tight — we’re filling your dashboard as each part lands.'}
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
                    ? 'bg-primary text-on-primary'
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
        <OnboardingProfile onResolved={() => setProfileResolved(true)} />
      </div>

      {/* ⚠️ /dashboard/audit, NOT /dashboard — THE REPORT IS THE PAYOFF. Somebody
          who has just watched every stage tick over wants to see what they
          bought with the wait, and Home is a working surface rather than a
          result. The route suits both plans: app/(app)/dashboard/audit/page.tsx
          renders FreeHome for a free account, which app-shell's FREE_NAV already
          labels "Your report", and AuditWorkspace for Pro.

          Both of those screens carry their own link on to Home, so this is a
          detour rather than a dead end. If either loses it, this line strands
          people on a report. */}
      {/*
        ⚠️ THE BUTTON IS THE MANUAL PATH FOR A MOVE THAT ALSO HAPPENS BY ITSELF.
        The effect above navigates as soon as the scan is done and the form is
        resolved. This stays for the window in between — finished, but the
        profile still open — where there is somewhere to go and nothing is
        carrying anyone there yet. Pressing it skips the form, which is a choice
        the person is making, unlike a redirect that would have made it for them.
      */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {finished ? (
          <Button size="sm" onClick={() => router.replace('/dashboard/audit')}>
            See my report
          </Button>
        ) : null}
        {/* ⚠️ ONLY WHEN THERE IS SOMEWHERE TO GO. While the scan is genuinely
            running this renders nothing, which is what makes the modal a hold;
            onClose arrives only on a failed or stalled job. */}
        {onClose ? (
          <Button size="sm" variant="ghost" type="button" onClick={onClose}>
            {finished ? 'Stay here' : 'Carry on to my dashboard'}
          </Button>
        ) : null}
      </div>
    </Overlay>
  );
}

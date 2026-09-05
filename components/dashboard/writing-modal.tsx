'use client';

import { Overlay } from '@/components/ui/overlay';
import { WritingProgress } from './writing-progress';
import type { ArticleStreamPhase } from '@/lib/article';

/*
  The pop-up that runs while something is being written.

  ⚠️ IT TAKES OVER THE SCREEN BECAUSE THE WAIT IS THE POINT. The panel used to
  render inside the row, which was honest but easy to scroll past — and a
  thousand-word article takes most of a minute. Putting it in front means the
  headings arriving are the thing you are looking at, and there is nothing else
  to click while a monthly allowance is being spent.

  ⚠️ NO DISMISS, NO ESCAPE KEY, NO BACKDROP CLICK — the rule audit-notice.tsx
  states, and it is stronger here. The request is already in flight and the
  article will be saved whether or not this is on screen, so a close button
  would be a cancel button that does not cancel. It leaves on its own when the
  run ends, which is a promise this can keep.

  ⚠️ THAT IS EXPRESSED BY PASSING NO onClose, AND IT IS LOAD-BEARING. Overlay
  makes the scrim a real button and binds Escape only when a handler is given,
  so adding one here would hand this modal all three exits at once.

  The portal, the scroll lock and the z-55 layer live in components/ui/overlay
  now, along with the backdrop-filter containing-block trap they exist to dodge.
*/
export function WritingModal({
  phase,
  title,
  headings,
}: {
  phase: ArticleStreamPhase;
  title: string | null;
  headings: string[];
}) {
  return (
    <Overlay labelledBy="writing-modal-title">
      <h2 id="writing-modal-title" className="sr-only">
        Writing your article
      </h2>

      {/* The panel is unchanged from when it lived in the row — it already
          shows the real title and each heading as they arrive. */}
      <WritingProgress phase={phase} title={title} headings={headings} />

      <p className="text-slate mt-4 text-center text-xs">
        This takes about a minute. Hang on — we&rsquo;ll open it when it&rsquo;s done.
      </p>
    </Overlay>
  );
}

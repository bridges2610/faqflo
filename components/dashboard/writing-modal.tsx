'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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

  ⚠️ PORTALLED TO <body>, AND IT HAS TO BE — THE SAME TRAP
  components/marketing/mobile-nav.tsx FELL INTO AND DOCUMENTS. An ancestor with
  a backdrop-filter becomes the containing block for its `position: fixed`
  descendants, so `fixed inset-0` rendered in place resolves against that
  ancestor rather than the viewport.

  Measured, before the fix: the container came out 1100x1130 in an 1100x1150
  window, while a bare `position:fixed;inset:0` appended to <html> at the same
  instant measured the full 1150. Those missing 20px were real — the scrim
  stopped short and the allowance card at the bottom of the page was sitting on
  top of the overlay, unblurred and clickable, under a modal that was supposed
  to have taken the screen.

  Escaping to <body> is what makes a full-viewport overlay possible at all, and
  it is immune to whichever ancestor grows a filter next.

  ⚠️ z-[55], AND THE LAYERS EITHER SIDE ARE THE REASON. The dashboard stacks
  z-30 for the sticky publish bar, z-40 for the sticky header and the audit
  toast, z-50 for the mobile drawer and the account menu. This has to clear all
  of them or the header sits on top of a modal. It stays below marketing's
  z-[60], which is a different tree and never on screen at the same time.
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
  /*
    The page behind must not scroll while this is up.

    ⚠️ RESTORED TO WHAT IT WAS, NOT TO ''. Blanking the property would drop an
    overflow rule the page had set for its own reasons; keeping the previous
    value means this leaves the document exactly as it found it.
  */
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  /* createPortal needs a real document, and this component still renders on the
     server. Mounting on the client first is what keeps the markup identical on
     both passes instead of throwing during SSR. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 print:hidden">
      {/* Not a button and not clickable: there is nothing to dismiss to. */}
      <div className="bg-navy/40 absolute inset-0 backdrop-blur-sm" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="writing-modal-title"
        className="shadow-lift relative w-full max-w-md rounded-xl bg-white p-6"
      >
        <h2 id="writing-modal-title" className="sr-only">
          Writing your article
        </h2>

        {/* The panel is unchanged from when it lived in the row — it already
            shows the real title and each heading as they arrive. */}
        <WritingProgress phase={phase} title={title} headings={headings} />

        <p className="text-slate mt-4 text-center text-xs">
          This takes about a minute. Hang on — we&rsquo;ll open it when it&rsquo;s done.
        </p>
      </div>
    </div>,
    document.body,
  );
}

'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/*
  A full-viewport modal shell. The scrim, the portal, the scroll lock, the layer.

  ⚠️ EXTRACTED FROM writing-modal.tsx SO THE TWO TRAPS BELOW ARE STATED ONCE.
  Onboarding needed the same shell, and a second hand-rolled copy is how one of
  them quietly loses a fix the other got.

  ⚠️ PORTALLED TO <body>, AND IT HAS TO BE — THE SAME TRAP
  components/marketing/mobile-nav.tsx FELL INTO AND DOCUMENTS. An ancestor with
  a backdrop-filter becomes the containing block for its `position: fixed`
  descendants, so `fixed inset-0` rendered in place resolves against that
  ancestor rather than the viewport.

  Measured, before that fix: the container came out 1100x1130 in an 1100x1150
  window, while a bare `position:fixed;inset:0` appended to <html> at the same
  instant measured the full 1150. Those missing 20px were real — the scrim
  stopped short and the card at the bottom of the page sat on top of the
  overlay, unblurred and clickable, under a modal that was supposed to have
  taken the screen.

  Escaping to <body> is what makes a full-viewport overlay possible at all, and
  it is immune to whichever ancestor grows a filter next.

  ⚠️ z-[55], AND THE LAYERS EITHER SIDE ARE THE REASON. The dashboard stacks
  z-30 for the sticky publish bar, z-40 for the sticky header and the audit
  toast, z-50 for the mobile drawer and the account menu. This has to clear all
  of them or the header sits on top of a modal.

  ⚠️ IT STAYS BELOW MARKETING'S z-[60], AND THE REASON CHANGED. That used to be
  safe because marketing was "a different tree and never on screen at the same
  time" — which stopped being true when components/marketing/busy-button.tsx
  started opening this overlay on public pages.

  It is still correct, for a reason that now has to be maintained rather than
  assumed: mobile-nav.tsx is `fixed inset-0 z-[60]`, and the busy button sits at
  z-40 UNDER it, so an open drawer covers the trigger and the trigger cannot be
  clicked. The drawer's own opener lives in the z-50 header, which an open panel
  covers. Neither can be reached while the other is up, so the two never stack —
  but that now depends on the trigger staying below z-[60]. Anything new that
  opens this overlay from a marketing surface has to keep that property.
*/
export function Overlay({
  children,
  labelledBy,
  /**
   * Dismiss handler, or omitted for a modal there is nothing to dismiss to.
   *
   * ⚠️ OMITTING IT IS A REAL POSITION, NOT AN OVERSIGHT. writing-modal.tsx has
   * no close because the request is already in flight and the article saves
   * whether or not the panel is on screen — "a close button would be a cancel
   * button that does not cancel". Only pass this where leaving genuinely costs
   * the reader nothing.
   */
  onClose,
  className = 'max-w-md',
}: {
  children: ReactNode;
  /** id of the element naming this dialog. */
  labelledBy: string;
  onClose?: () => void;
  /** Width of the panel. Layout only. */
  className?: string;
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

  /* Escape closes it, but only where there is somewhere to close to. */
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* createPortal needs a real document, and this component still renders on the
     server. Mounting on the client first is what keeps the markup identical on
     both passes instead of throwing during SSR. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 print:hidden">
      {/* Clickable only when there is somewhere to dismiss to; otherwise it is
          decoration and must not look like an exit. */}
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="bg-scrim/40 absolute inset-0 backdrop-blur-sm"
        />
      ) : (
        <div className="bg-scrim/40 absolute inset-0 backdrop-blur-sm" aria-hidden="true" />
      )}

      {/*
        ⚠️ max-h AND overflow-y-auto TOGETHER. A panel taller than a short
        viewport — a phone in landscape, a laptop with the browser chrome open —
        would otherwise push its own actions off-screen with the page behind
        locked, which is a dead end rather than a modal.
      */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        /*
          ⚠️ rounded-2xl HERE, BECAUSE A CALLER CANNOT OVERRIDE IT. Passing
          `rounded-2xl` through className was measured and it LOST — the panel
          still computed 18px, because two radius utilities land at the same
          specificity and the winner is whichever Tailwind emits later, not
          whichever the class attribute lists last. So the radius is a property
          of the shell, and changing it changes every modal.
        */
        className={`shadow-lift relative max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-2xl bg-surface p-6 ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Check } from '@/components/ui/check';
import { ClockIcon } from '@/components/ui/icons';
import { Overlay } from '@/components/ui/overlay';
import { AUTHOR, AUTHOR_AVATAR } from '@/lib/blog/posts';

/*
  The twenty-second answer to "what is this?", for somebody who does not have
  sixty seconds to find out.

  ⚠️ THE COPY IS CONDENSED FROM THE ELEVATOR-PITCH POST, NOT WRITTEN FRESH.
  content/posts/the-60-second-faqflo-elevator-pitch.mdx makes exactly this
  argument in exactly this voice — "they open ChatGPT, type 'who's good for X
  near me' … it doesn't say 'I'm not sure.' It confidently names somebody else."
  If the pitch changes there, change it here; two versions of the same pitch
  drifting apart is worse than one that is slightly too long.

  ⚠️ ChatGPT, PERPLEXITY AND GEMINI — NEVER "AI OVERVIEWS". The last bullet is a
  tracking claim on a product surface, and ENGINES in lib/dashboard/types.ts is
  the list we can actually ask. Overviews has no API for anybody.

  ⚠️ AND NO NUMBERS AT ALL, WHICH IS DELIBERATE. A panel this short has no room
  to qualify a figure, and an unqualified figure here would be the kind of
  invented measurement the rest of this codebase refuses to print.
*/

const TITLE_ID = 'busy-panel-title';
const TRIGGER_ID = 'busy-trigger';

export function BusyButton() {
  const [open, setOpen] = useState(false);
  const everOpened = useRef(false);

  /*
    ⚠️ Overlay DOES NOT MOVE FOCUS, SO THIS DOES. It portals, locks scroll,
    closes on Escape and on the backdrop, and sets role/aria-modal — but a
    keyboard reader whose focus is still on the trigger behind the scrim has a
    dialog they cannot reach.

    ⚠️ A CALLBACK REF, NOT AN EFFECT ON `open`, AND MEASUREMENT IS WHY. Overlay
    returns null until its own mount effect has run, so the panel is NOT in the
    document on the render where `open` flips — an effect firing then finds an
    empty ref and focus never moves. Asserted: "focus is inside the dialog" came
    back false. A callback ref runs when the node actually attaches, which is
    the moment that exists.
  */
  const takeFocus = useCallback((node: HTMLDivElement | null) => {
    node?.focus();
  }, []);

  /*
    ⚠️ GUARDED, OR IT STEALS FOCUS ON PAGE LOAD. This effect also runs on the
    first mount, where `open` is false — un-guarded it pulled focus to a
    floating button in the corner the moment any marketing page finished
    hydrating, which would yank a keyboard reader out of the header before they
    had touched anything.
  */
  useEffect(() => {
    if (open) {
      everOpened.current = true;
      return;
    }
    /* ⚠️ BY id, NOT BY ref. components/ui/button.tsx takes
       ComponentPropsWithoutRef and does not forward one, and adding forwardRef
       to a button used on every screen just to restore focus in one corner is
       the wrong trade. The id is on the element either way. */
    if (everOpened.current) {
      document.getElementById(TRIGGER_ID)?.focus({ preventScroll: true });
    }
  }, [open]);

  return (
    <>
      {/*
        ⚠️ A LABELLED PILL, NOT A CIRCULAR BUBBLE. A round icon-only button in
        this corner is the universal shape of a support-chat widget, and this is
        not support — it is the pitch. The words are the control; the clock only
        decorates them.

        ⚠️ z-40 PUTS IT UNDER THE MOBILE DRAWER ON PURPOSE. mobile-nav.tsx is
        `fixed inset-0 z-[60]`, so while the drawer is open this is covered and
        unclickable — which is what keeps it and the panel from ever being on
        screen together. See the stacking note in components/ui/overlay.tsx.

        ⚠️ THE SAFE-AREA INSET IS NOT DECORATION. Without it this sits under the
        iOS home indicator on a modern iPhone, which is both hard to hit and
        covering the last line of the page.

        ⚠️ THE HOUSE Button, `dark` + `pill` — NOT HAND-ROLLED CLASSES. The first
        version was a white-to-grey gradient with a hard border AND a drop
        shadow, which is the dated combination: bevel-era styling that reads as
        a 2012 toolbar chip. A solid fill with one soft shadow and no border is
        the modern shape, and the variant for it already existed.

        Going through Button also inherits the press animation every other
        button has — `active:scale-[0.97] active:duration-75` in its BASE — which
        a bespoke element silently opts out of.

        ⚠️ `dark`, NOT `primary`. A blue pill in the corner would be a second
        primary CTA arguing with "Check my site" in the header. Ink is a
        different colour entirely, so it reads as a utility chip — and white on
        ink is 17.04:1, one of the two sanctioned white-on-fill pairs.
      */}
      <Button
        id={TRIGGER_ID}
        variant="dark"
        shape="pill"
        size="sm"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="fixed right-4 z-40 print:hidden"
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <ClockIcon className="h-4 w-4 shrink-0" />
        {/* The short label on a phone, the whole question from sm: up — so on
            most screens the button states its purpose rather than leaving the
            reader to guess from two words and a clock. */}
        <span>
          I&rsquo;m busy<span className="hidden sm:inline"> — what is this?</span>
        </span>
        {/* The accessible name is always the full sentence, whatever is
            visible. */}
        <span className="sr-only">— what is FaqFlo?</span>
      </Button>

      {open && (
        <Overlay labelledBy={TITLE_ID} onClose={() => setOpen(false)} className="max-w-lg">
          <div ref={takeFocus} tabIndex={-1} className="outline-none">
            {/* ⚠️ NOT A SECOND ICON. The trigger already carries the clock, and
                a chip repeating it at the top of the panel it opened is
                decoration explaining nothing. The headline is the entry point. */}
            <h2
              id={TITLE_ID}
              className="text-navy text-[1.375rem] leading-tight tracking-tight text-balance sm:text-2xl"
            >
              Fair enough — here&rsquo;s the short version.
            </h2>

            <p className="text-slate mt-3.5 text-[0.9375rem] leading-relaxed">
              Your customers are opening ChatGPT and typing &ldquo;who&rsquo;s good for X near
              me.&rdquo; They get two or three names back, and they call one of them. Yours
              probably isn&rsquo;t in there — not because you aren&rsquo;t good at what you do,
              but because AI can&rsquo;t find anything readable about you.
            </p>

            {/*
              ⚠️ THE ONE FIRST-PERSON LINE, AND IT IS THE POINT OF THE REWRITE.
              Beau's voice already exists in AUTHOR_BIO ("Hi, I'm Beau…") but had
              never reached a marketing surface — every panel spoke as a company.
              One sentence naming the person who built it is what makes this read
              as somebody talking rather than a product tour, and it costs a
              line. Do not grow it into an About paragraph.

              ⚠️ AUTHOR AND AUTHOR_AVATAR FROM lib/blog/posts.ts, NOT A PASTED
              PATH. The byline, the avatar and the BlogPosting schema all read
              those two constants so "the visible bio and the structured data can
              never describe different people" — a fourth copy of the filename
              here would be the first thing to go stale when the photo changes.

              ⚠️ alt="" BECAUSE THE NAME IS RIGHT THERE. Same call author-bio.tsx
              makes: a screen reader that hears "Beau" and then "photo of Beau"
              has been told twice. The photo is decoration for a line that
              already says who is speaking.
            */}
            <div className="mt-5 flex items-center gap-3">
              <Image
                src={AUTHOR_AVATAR}
                alt=""
                width={80}
                height={80}
                className="bg-cloud h-11 w-11 shrink-0 rounded-full object-cover"
              />
              <p className="text-navy text-[0.9375rem] leading-snug font-semibold">
                That&rsquo;s the whole reason I built FaqFlo.
                <span className="text-slate mt-0.5 block text-sm font-normal">
                  — {AUTHOR}, who built it
                </span>
              </p>
            </div>

            {/*
              ⚠️ THE HOUSE FEATURE-LIST TREATMENT, LIFTED FROM pricing-teaser.tsx
              — `Check` in text-primary at mt-[0.35rem], slate text, space-y-3.
              These were hand-rolled blue discs, which is a second visual
              language for "a list of things you get" in a product that already
              has one. A tick also says these are benefits; a dot says nothing.
            */}
            <ul className="border-line mt-6 space-y-3 border-t pt-6">
              {/* ⚠️ "WE" AND "YOU", NOT HEADLESS FRAGMENTS. These read
                  "Checks what AI can read…", which is how a spec sheet talks.
                  Naming who does what — we do three of these, you do one — is
                  most of what makes the list sound like a person. */}
              {[
                'We check what AI can actually read on your site',
                'We write your answers in the shape it likes to quote',
                'You paste one block onto your own site — that’s the work',
                'We tell you when ChatGPT, Perplexity and Gemini start naming you',
              ].map((line) => (
                <li key={line} className="text-slate flex gap-2.5 text-sm">
                  <Check className="text-primary mt-[0.35rem] shrink-0" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            {/* ⚠️ FULL-WIDTH CTA BELOW sm:. At 320 the button and "Not now" wrapped
                onto two ragged rows; a phone gets one obvious target and the
                dismissal underneath it. */}
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <ButtonLink
                href="/free-report"
                arrow
                onClick={() => setOpen(false)}
                className="w-full justify-center sm:w-auto"
              >
                Check my site free
              </ButtonLink>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate hover:text-navy self-center text-sm transition-colors duration-150 sm:self-auto"
              >
                Maybe later
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}

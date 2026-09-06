'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Check } from '@/components/ui/check';
import { ClockIcon, CloseIcon } from '@/components/ui/icons';
import { Overlay } from '@/components/ui/overlay';
import { AUTHOR, AUTHOR_AVATAR } from '@/lib/blog/author';
import {
  BUSY_REVEAL_DELAY_MS,
  BUSY_SCOPE,
  dismissFloating,
  hasSeenFloating,
  isFloatingDismissed,
  markFloatingSeen,
} from '@/lib/floating-visibility';

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
    ⚠️ IT ARRIVES AFTER THE READER DOES, AND null IS "NOT ASKED YET". Storage
    cannot be read while rendering — these pages are prerendered, and a server
    pass that cannot see sessionStorage would disagree with the client's, which
    is a hydration mismatch. So the answer lands an effect later, and until then
    nothing renders rather than something appearing and being taken away.
  */
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  useEffect(() => setDismissed(isFloatingDismissed(BUSY_SCOPE)), []);

  /*
    The pitch holds back for five seconds after somebody lands.

    ⚠️ ONCE PER VISIT, NOT PER PAGE. This component is mounted by the marketing
    layout, so a client-side move from the home page to a blog post never
    unmounts it and a bare timer would already survive that — the stored flag is
    what covers a full reload, which would otherwise restart the wait every time
    and, for a reader who browses in fresh tabs, mean the button is never seen.

    ⚠️ THE TIMER IS CLEARED ON UNMOUNT. It sets state when it fires, and a timer
    outliving its component sets state on something React has discarded.
  */
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (hasSeenFloating(BUSY_SCOPE)) {
      setRevealed(true);
      return;
    }
    const timer = setTimeout(() => {
      markFloatingSeen(BUSY_SCOPE);
      setRevealed(true);
    }, BUSY_REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

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

  /* Put away for this visit, or not yet known to be otherwise, or still inside
     the opening five seconds. */
  if (dismissed !== false || !revealed) return null;

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
      {/* ⚠️ motion-rise, NOT A BARE APPEARANCE. This arrives five seconds into
          somebody's reading, and a control that materialises with no transition
          in the corner of a page being read is startling in a way the same
          control easing in is not. globals.css clamps the animation for anyone
          who asked for less motion, which leaves it simply present. */}
      <div
        className="motion-rise fixed right-4 z-40 flex items-center gap-1.5 print:hidden"
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <Button
          id={TRIGGER_ID}
          variant="dark"
          shape="pill"
          size="sm"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
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

        {/*
          ⚠️ A SIBLING OF THE PILL, NEVER A CHILD OF IT. A button inside a button
          is invalid HTML and browsers recover from it however they like — the
          inner one commonly stops receiving clicks at all.

          ⚠️ ALWAYS VISIBLE, NOT ON HOVER. There is no hover on a phone, and a
          dismiss control that cannot be reached on the device most likely to
          feel crowded is not a dismiss control.

          ⚠️ AND IT SAYS "for now". The dismissal lasts the visit — see
          lib/floating-visibility.ts — so a name promising it is gone for good
          would be a promise this does not keep.
        */}
        <button
          type="button"
          onClick={() => {
            dismissFloating(BUSY_SCOPE);
            setDismissed(true);
            setOpen(false);
          }}
          aria-label="Hide this for now"
          className="border-line bg-surface text-slate hover:text-navy hover:border-primary shadow-soft flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-150"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>

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

            {/*
              ⚠️ WHAT IT IS, NOT THE SCENARIO. This used to open by acting out a
              customer typing into ChatGPT and getting somebody else's name —
              three sentences of problem before the reader learned what FaqFlo
              was. Somebody who pressed "I'm busy" has already agreed they are
              busy; making them read a story first is the opposite of the ask.

              ⚠️ AND IT DOES NOT LIST THE STEPS. "Finds the questions, writes the
              answers, puts them on your site" belongs to the ticks below, and
              saying it twice makes the panel longer without making it clearer.
              This says what the thing is and what it gets you; the list says how.
            */}
            <p className="text-slate mt-3 text-[0.9375rem] leading-relaxed sm:mt-3.5">
              FaqFlo gets your business named when someone asks an AI who to hire. It puts clear
              answers about what you do somewhere the assistants can actually read them — so when
              the question comes up, you&rsquo;re in the answer.
            </p>

            {/*
              ⚠️ THE ONE FIRST-PERSON LINE. Beau's voice already exists in
              AUTHOR_BIO ("Hi, I'm Beau…") but had never reached a marketing
              surface — every panel spoke as a company. One sentence naming the
              person who built it is what makes this read as somebody talking
              rather than a product tour, and it costs a line. Do not grow it
              into an About paragraph.

              ⚠️ IT NO LONGER STARTS WITH "That's". It read "That's the whole
              reason I built FaqFlo", where "that" pointed at a problem the
              paragraph above used to describe. That paragraph now says what
              FaqFlo IS, so the pronoun had nothing left to refer to — this line
              has to stand on its own, and does.

              ⚠️ AUTHOR AND AUTHOR_AVATAR FROM lib/blog/author.ts, NOT A PASTED
              PATH — AND NOT FROM posts.ts, WHICH IS WHERE THEY USED TO COME
              FROM. This component is a client component on every marketing
              page, and posts.ts imports all 22 MDX posts, so that import put
              261KB of post prose into the bundle for pages that render none of
              it. Measured on a production build. Same single source, no corpus. The byline, the avatar and the BlogPosting schema all read
              those two constants so "the visible bio and the structured data can
              never describe different people" — a fourth copy of the filename
              here would be the first thing to go stale when the photo changes.

              ⚠️ alt="" BECAUSE THE NAME IS RIGHT THERE. Same call author-bio.tsx
              makes: a screen reader that hears "Beau" and then "photo of Beau"
              has been told twice. The photo is decoration for a line that
              already says who is speaking.
            */}
            <div className="mt-4 flex items-center gap-3 sm:mt-5">
              <Image
                src={AUTHOR_AVATAR}
                alt=""
                width={80}
                height={80}
                className="bg-cloud h-11 w-11 shrink-0 rounded-full object-cover"
              />
              <p className="text-navy text-[0.9375rem] leading-snug font-semibold">
                I built FaqFlo for people who don&rsquo;t have time for marketing.
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
            <ul className="border-line mt-5 space-y-2.5 border-t pt-5 sm:mt-6 sm:space-y-3 sm:pt-6">
              {/* ⚠️ "WE" AND "YOU", NOT HEADLESS FRAGMENTS. These read
                  "Checks what AI can read…", which is how a spec sheet talks.
                  Naming who does what — we do three of these, you do one — is
                  most of what makes the list sound like a person. */}
              {[
                'We check what AI can actually read on your site',
                'We write your answers in the shape it likes to quote',
                /* ⚠️ "OR HAVE US DO IT" IS A REAL OFFER, NOT A FIGURE OF SPEECH
                   — /done-for-you is a monthly retainer for one site. It is worded
                   as an alternative rather than an inclusion for exactly that
                   reason: every other bullet here describes what the product
                   does, so "we can do it" sitting among them would read as
                   included. No price, because this panel carries no digits at
                   all; the link is one click away on the page behind it. */
                'You paste one block onto your own site, or have us do it for you',
                'We tell you when ChatGPT, Perplexity and Gemini start naming you',
              ].map((line) => (
                <li key={line} className="text-slate flex gap-2.5 text-sm">
                  <Check className="text-primary mt-[0.35rem] shrink-0" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            {/*
              ⚠️ THE PAYOFF LINE, AND IT BORROWS A FRAMING THAT ALREADY EXISTS.
              The bullets say what happens; this says why it is worth anything.
              "Works like a referral" is the whole argument of
              content/posts/why-getting-your-business-mentioned-by-ai-is-a-great-referral.mdx
              — "That's a referral. And a referral is the best lead in business…
              same trust, same moment, same pre-sold customer" — so the panel
              lands on the same idea the blog already makes at length.

              ⚠️ A MECHANISM, NOT A RESULT. It says what a citation IS, not what
              it will earn: no volume, no percentage, no "grow your business by".
              Nothing here has been measured, so nothing here is quantified —
              same reason the panel carries no digits anywhere.
            */}
            <p className="text-navy mt-5 text-[0.9375rem] leading-relaxed sm:mt-6">
              <span className="font-semibold">Every answer that names you works like a referral</span>{' '}
              — same trust, same pre-sold customer, and you never had to ask. That&rsquo;s more of
              the right calls, without chasing them.
            </p>

            {/* ⚠️ FULL-WIDTH CTA BELOW sm:. At 320 the button and "Not now" wrapped
                onto two ragged rows; a phone gets one obvious target and the
                dismissal underneath it. */}
            <div className="mt-5 flex flex-col gap-3 sm:mt-7 sm:flex-row sm:items-center">
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

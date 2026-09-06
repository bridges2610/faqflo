'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Overlay } from '@/components/ui/overlay';
import { CloseIcon } from '@/components/ui/icons';
import { UpgradeCard } from '@/components/dashboard/upgrade-card';
import { LockIcon } from './nav-icons';
import {
  HELP_REVEAL_DELAY_MS,
  dismissFloating,
  hasSeenFloating,
  helpScope,
  isFloatingDismissed,
  markFloatingSeen,
} from '@/lib/floating-visibility';
import { useDashboard } from '@/lib/dashboard/provider';
import { FREE_SUMMARY_CAP, summaryPagesFor } from '@/lib/dashboard/plans';
import { buildFacts, summaryPageFor } from '@/lib/dashboard/summary';
import type { PlanId } from '@/lib/dashboard/types';
import { AUTHOR, AUTHOR_AVATAR } from '@/lib/blog/author';
import { prefersReducedMotion, revealStep } from '@/lib/motion';

/*
  "What am I looking at?", answered for the screen they are on.

  The dashboard reports and does not interpret: a grid of cited / named / absent
  cells is a measurement, and a business owner still has to decide whether it is
  good news. This writes that sentence for them, about their own numbers.

  ⚠️ IT SAYS IT IS AI, IN WORDS, BESIDE BEAU'S FACE. The voice and the photo are
  his — that is the point, it is his product and his explanation — but a
  customer who thinks a person is typing to them will reply, and nobody is
  reading. The tag is not decoration and must not be removed to tidy the header.

  ⚠️ AUTHOR/AUTHOR_AVATAR COME FROM lib/blog/author.ts, NEVER lib/blog/posts.ts.
  That module exists solely because a client component importing the author from
  posts.ts dragged all twenty-odd MDX post bodies — a measured 261KB — into the
  shared client chunk. This is a client component on every dashboard page, which
  is exactly the mistake that was made last time.
*/

const TITLE_ID = 'help-panel-title';
const TRIGGER_ID = 'help-trigger';

type Status = 'idle' | 'writing' | 'done' | 'error';

export function HelpBubble({
  plan,
  summariesLeft,
  userId,
}: {
  /*
    ⚠️ A PROP FROM THE SERVER, NOT useDashboard().user, AND THE DIFFERENCE IS A
    FLASH OF THE WRONG PLAN. The provider resolves its user from the loaded
    snapshot rather than from the prop the layout hands it, so `user` is null on
    the first frame and every Pro customer would briefly be told their screen is
    locked. app/(app)/dashboard/page.tsx documents the same trap for the same
    reason.
  */
  plan: PlanId;
  /** Free summaries remaining at page load. Null for Pro — never a fake ceiling. */
  summariesLeft: number | null;
  /** Scopes the dismissal, so two accounts on one machine stay independent. */
  userId: string;
}) {
  const pathname = usePathname();
  /* ⚠️ tracking, contentPlan, faqs AND articles COME FROM THE CONTEXT, NOT FROM
     `data`. Citations in particular are never in `data` — the provider fetches
     them separately, so `data.tracking` is permanently empty. See the note on
     SummarySources. */
  const { site, tracking, contentPlan, faqs, articles, refreshTracking } = useDashboard();

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(summariesLeft);
  /* A summary that arrived whole — stored, or a reader who asked for less
     motion — fades in rather than appearing mid-blink. */
  const [instantReveal, setInstantReveal] = useState(false);
  const everOpened = useRef(false);

  /*
    Has this reader put the button away?

    ⚠️ null MEANS "NOT ASKED YET", AND THE THIRD STATE IS THE POINT. Storage
    cannot be read while rendering — AppShell is server-rendered, and a server
    pass that cannot see sessionStorage would disagree with the client's, which
    is a hydration mismatch. So the answer arrives one effect later, and until it
    does the trigger renders nothing at all rather than appearing and then
    vanishing in front of somebody who already dismissed it.
  */
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  useEffect(() => setDismissed(isFloatingDismissed(helpScope(userId))), [userId]);

  /*
    The button holds back for HELP_REVEAL_DELAY_MS on the reader's first screen.

    ⚠️ ONCE PER SESSION, NOT PER PAGE — hasSeenHelp() is what makes the wait a
    greeting rather than a tax. AppShell keeps this component mounted across
    client navigations, so a bare timer would already survive those; the stored
    flag is what covers a full reload, which otherwise restarts the wait every
    time somebody refreshes.

    ⚠️ THE TIMER IS CLEARED ON UNMOUNT. It sets state when it fires, and a
    timer outliving its component sets state on something React has discarded.
  */
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (hasSeenFloating(helpScope(userId))) {
      setRevealed(true);
      return;
    }
    const timer = setTimeout(() => {
      markFloatingSeen(helpScope(userId));
      setRevealed(true);
    }, HELP_REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [userId]);

  /*
    The reveal buffer.

    ⚠️ REFS, NOT STATE, FOR THE QUEUE. Every delta would otherwise be a render,
    which is the stutter this exists to remove — and a frame loop reading state
    would read whatever value it closed over rather than the current one. The
    queue is mutable and only the text actually on screen is state.
  */
  const pending = useRef('');
  const frame = useRef<number | null>(null);

  /* ⚠️ CANCELLED ON UNMOUNT, or a loop outlives the component that owns it and
     calls setState on something React has thrown away. */
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  /*
    Drain the queue a slice at a time, on frames.

    ⚠️ IT SCHEDULES ITSELF ONLY WHILE THERE IS WORK, and stops dead when the
    queue empties rather than idling — a permanent rAF loop on a dashboard page
    is a battery cost for nothing.
  */
  const drain = useCallback(() => {
    frame.current = requestAnimationFrame(() => {
      const step = revealStep(pending.current.length);
      if (step === 0) {
        frame.current = null;
        return;
      }
      const slice = pending.current.slice(0, step);
      pending.current = pending.current.slice(step);
      setText((prev) => prev + slice);
      drain();
    });
  }, []);

  /* Everything still queued, on screen now. Used when the stream finishes, when
     it fails, and when the panel closes — a summary must never be left holding
     back the last few characters of itself. */
  const flush = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    if (pending.current) {
      const rest = pending.current;
      pending.current = '';
      setText((prev) => prev + rest);
    }
  }, []);

  /*
    Take a chunk of streamed text.

    ⚠️ A REPLAYED SUMMARY IS NEVER PACED, and `instant` is how the server says
    so. lib/summary-generate.ts sends a stored summary as a single frame because
    nothing is being written — dripping it out would be a typewriter pretending
    to be a model, which is exactly what components/dashboard/writing-progress.tsx
    exists to forbid.

    ⚠️ AND NEITHER IS ANYTHING, FOR A READER WHO ASKED FOR LESS MOTION. The
    reduced-motion block in globals.css clamps CSS durations and cannot see this
    loop, so it has to ask — see lib/motion.ts.
  */
  const take = useCallback(
    (chunk: string, instant: boolean) => {
      if (instant || prefersReducedMotion()) {
        setInstantReveal(true);
        setText((prev) => prev + chunk);
        return;
      }
      pending.current += chunk;
      if (frame.current === null) drain();
    },
    [drain],
  );

  const page = summaryPageFor(pathname);
  const scope = summaryPagesFor(plan);
  const locked = page ? scope === 'home' && page.key !== 'home' : false;

  /*
    ⚠️ Overlay DOES NOT MOVE FOCUS, SO THIS DOES, and it is a callback ref rather
    than an effect for the reason components/marketing/busy-button.tsx:44-49
    records: Overlay returns null until its own mount effect has run, so the
    panel is not in the document on the render where `open` flips. An effect
    firing then finds an empty ref and focus never moves.
  */
  const takeFocus = useCallback((node: HTMLDivElement | null) => {
    node?.focus();
  }, []);

  /* ⚠️ GUARDED, OR IT STEALS FOCUS ON PAGE LOAD — this runs on first mount too,
     where `open` is false. By id rather than by ref because components/ui/
     button.tsx does not forward one. */
  useEffect(() => {
    if (open) {
      everOpened.current = true;
      return;
    }
    if (everOpened.current) {
      document.getElementById(TRIGGER_ID)?.focus({ preventScroll: true });
    }
  }, [open]);

  /* A route change closes the panel. Its summary is about the screen behind it,
     and one left open across a navigation would be explaining the wrong page. */
  useEffect(() => {
    setOpen(false);
    setStatus('idle');
    setText('');
    setError(null);
    /* ⚠️ THE QUEUE GOES WITH IT. Left behind, the next screen's summary would
       open with the tail of the previous one still draining into it. */
    pending.current = '';
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  }, [pathname]);

  const run = useCallback(async () => {
    if (!page || !site) return;

    setStatus('writing');
    setText('');
    setError(null);
    setInstantReveal(false);

    try {
      /*
        ⚠️ null MEANS TWO THINGS ON THE CONTEXT AND ONLY ONE OF THEM IS "none".
        The provider clears tracking to null and re-reads it whenever the site
        changes, so a panel opened during that window would be handed null and
        would faithfully report "no checks have run" to an account with
        hundreds. refreshTracking() RETURNS what it read — that is what its doc
        comment exists for — so asking directly is the only way to tell a site
        with nothing from a site that has not finished loading.

        Only when it is null: an already-loaded value needs no second query, and
        a summary is not worth a round trip it does not need.
      */
      const liveTracking = tracking ?? (await refreshTracking());

    
      const res = await fetch('/api/dashboard/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: site.id,
          page: page.key,
          facts: buildFacts(page.key, {
            site,
            tracking: liveTracking,
            contentPlan,
            faqs,
            articles,
          }),
        }),
      });

      /*
        ⚠️ EVERY REFUSAL IS PLAIN JSON AND EVERY SUCCESS IS NDJSON, which is what
        makes this one branch rather than two parsers. The route decides scope,
        ownership, allowance and rate limit before any work starts, so there is
        never a "no" inside the stream — the rule
        app/api/dashboard/article/route.ts:291-295 states.
      */
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? 'Something went wrong. Please try again.');
        setStatus('error');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let tail = '';

      /* ⚠️ BUFFERED ON NEWLINES WITH A CARRIED TAIL. A chunk is not a line: a
         frame can be split across two reads, and parsing per chunk throws on
         the half of it that arrives first. */
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        tail += decoder.decode(value, { stream: true });
        const lines = tail.split('\n');
        tail = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let frame: {
            type?: string;
            text?: string;
            error?: string;
            left?: number | null;
            instant?: boolean;
          };
          try {
            frame = JSON.parse(line);
          } catch {
            continue;
          }

          if (frame.type === 'text' && frame.text) take(frame.text, frame.instant === true);
          if (frame.type === 'error') {
            flush();
            setError(frame.error ?? 'Something went wrong. Please try again.');
            setStatus('error');
            return;
          }
          if (frame.type === 'done') {
            if (frame.left !== undefined) setLeft(frame.left);
            /* ⚠️ NOT FLUSHED HERE. The model has finished, but the reader has
               not — a few characters are usually still queued, and dumping them
               would end every summary with a visible jump. The loop is already
               draining and finishes on its own within a few frames. */
            setStatus('done');
          }
        }
      }

      /* The stream ended without a 'done' frame — the connection dropped
         mid-sentence. Say so rather than presenting a truncated summary as
         finished, and show every character that did arrive: the reader is
         being told it stopped early, so holding some of it back is worse than
         useless. */
      flush();
      setStatus((current) => (current === 'writing' ? 'error' : current));
      setError((current) =>
        current ?? (status === 'writing' ? 'That summary stopped early. Please try again.' : null),
      );
    } catch {
      flush();
      setError('Could not reach the summary service. Please try again.');
      setStatus('error');
    }
  }, [articles, contentPlan, faqs, flush, page, refreshTracking, site, status, take, tracking]);

  /*
    ⚠️ ONE CLICK, AND A REPLAY COSTS NOTHING — which is what makes opening
    straight into a generation safe on a metered feature. The route returns the
    stored summary whenever the numbers behind it have not moved, so reopening
    this on an unchanged screen never spends an allowance. A free account only
    pays again when its own data has actually changed, which is exactly when a
    new summary is worth having. See FREE_SUMMARY_CAP.
  */
  useEffect(() => {
    if (open && !locked && status === 'idle') void run();
  }, [locked, open, run, status]);

  /* Nothing to explain on Plan, Sites, Help or a single article. */
  if (!page) return null;

  /* Put away for this session, or not yet known to be otherwise. */
  if (dismissed !== false) return null;

  /* Still inside the opening wait. */
  if (!revealed) return null;

  const writing = status === 'writing';

  return (
    <>
      {/*
        ⚠️ z-40 MATCHES THE HEADER AND THE AUDIT TOAST, AND SITS UNDER BOTH THE
        MOBILE DRAWER (z-50) AND Overlay (z-55) — so it is covered while either
        is open rather than floating over them. The scale is inventoried in
        components/ui/overlay.tsx.

        ⚠️ THE SAFE-AREA INSET IS NOT DECORATION: without it this sits under the
        iOS home indicator, which is both hard to hit and covering the page.

        ⚠️ AND components/dashboard/audit-notice.tsx WAS MOVED UP TO CLEAR IT.
        That toast is pinned to this same corner at this same layer, where DOM
        order alone would have decided which one you could press.
      */}
      {/* ⚠️ motion-rise, NOT A BARE APPEARANCE. This arrives partway into
          somebody's reading, and a control that materialises with no transition
          in the corner of a page being read is startling in a way the same
          control easing in is not. globals.css clamps the animation for anyone
          who asked for less motion, which leaves it simply present. */}
      <div
        className="motion-rise fixed right-4 z-40 flex items-center gap-1.5 sm:right-6 print:hidden"
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        {/*
          ⚠️ `ghost`, NOT `dark`, AND THE MARKETING BUTTON KEEPS ITS INK. This
          was copied from components/marketing/busy-button.tsx, whose own note
          argues for a dark pill because a blue one would be a second primary
          CTA arguing with "Check my site" in the header. Nothing in this corner
          competes with anything, so all that weight bought here was the loudest
          element on a quiet page. The avatar carries the recognition; the pill
          can recede.
        */}
        <Button
          id={TRIGGER_ID}
          variant="muted"
          shape="pill"
          size="sm"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          /* ⚠️ THE NAME IS SET HERE RATHER THAN ASSEMBLED FROM THE SPANS. Below
             sm: the only visible content is a photo and possibly the word
             "Pro", which is not a sentence anybody could act on. This says the
             whole thing at every width, and it contains the visible words
             rather than replacing them with different ones. */
          aria-label={locked ? 'Explain this screen — part of Pro' : 'Explain this screen'}
          className="gap-2 pl-1.5"
        >
          <Image
            src={AUTHOR_AVATAR}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 rounded-full object-cover"
          />
          {/* ⚠️ THE PHOTO IS NEVER THE MESSAGE. A face alone in this corner is
              the universal shape of a support widget, and it would tell
              somebody who cannot see it nothing at all. */}
          <span className="hidden sm:inline">Explain this screen</span>

          {/*
            ⚠️ THE LOCK AND THE WORD TRAVEL TOGETHER, AND THE WORD IS THE ONE
            THAT MATTERS. components/ui/status-icon.tsx states the rule this
            follows: a 14px padlock is a smudge, and on its own it says
            "broken" at least as readily as it says "paid". "Pro" shows at every
            width — it is short enough to survive the breakpoint that hides the
            label, which is exactly where a free account is most likely to press
            this and be refused.
          */}
          {locked ? (
            /*
              ⚠️ bg-navy/10 WITH text-navy, AND BOTH SIDES FLIP TOGETHER. This
              was bg-white/15 + text-white while the pill was slate — correct
              then, unreadable the moment the pill became light grey, because
              white on a near-white wash is about 1.1:1. The faint-wash-with-
              matching-text pattern is the one app/globals.css singles out as
              surviving inversion on its own: in dark mode navy IS the pale
              colour, so a pale wash under pale text stays right without a
              second rule.
            */
            <span className="rounded-pill bg-navy/10 text-navy flex items-center gap-1 px-1.5 py-0.5 text-[0.6875rem] font-semibold">
              <LockIcon className="h-3 w-3 shrink-0" />
              Pro
            </span>
          ) : null}
        </Button>

        {/*
          ⚠️ A SIBLING OF THE PILL, NEVER A CHILD OF IT. A button inside a button
          is invalid HTML and browsers recover from it however they like — the
          inner one commonly stops receiving clicks at all.

          ⚠️ AND ALWAYS VISIBLE, NOT ON HOVER. There is no hover on a phone, and
          a dismiss control that cannot be reached on the device most likely to
          feel crowded is not a dismiss control.
        */}
        <button
          type="button"
          onClick={() => {
            dismissFloating(helpScope(userId));
            setDismissed(true);
            setOpen(false);
          }}
          /* ⚠️ IT SAYS FOR HOW LONG. A bare × promises to make something go
             away, and this one only makes it go away until the next sign-in —
             a control that overpromises is one somebody presses twice. */
          aria-label="Hide this until you sign in again"
          className="border-line bg-surface text-slate hover:text-navy hover:border-primary shadow-soft flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-150"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {open && (
        <Overlay labelledBy={TITLE_ID} onClose={() => setOpen(false)} className="max-w-lg">
          <div ref={takeFocus} tabIndex={-1} className="outline-none">
            <div className="flex items-center gap-3">
              <Image
                src={AUTHOR_AVATAR}
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0">
                <h2 id={TITLE_ID} className="text-navy text-base font-semibold">
                  {AUTHOR} on {page.label}
                </h2>
                {/* ⚠️ THE LABEL, NOT A FLOURISH. See the note at the top of this
                    file: the voice is Beau's and the typing is not. */}
                {/* ⚠️ THE SUBTITLE MUST NOT PROMISE WHAT THE PANEL IS ABOUT TO
                    REFUSE. "reading your actual numbers" is the whole pitch, and
                    on a locked screen nothing is being read — saying it there
                    makes the UpgradeCard underneath read as a failure rather
                    than a price. The AI label survives both versions, because
                    that one is not decoration. */}
                <p className="text-slate text-xs">
                  {locked ? 'AI assistant · part of Pro' : 'AI assistant · reading your actual numbers'}
                </p>
              </div>
            </div>

            {/*
              ⚠️ A FLOOR UNDER THE TEXT, AND IT MATTERS MORE THAN THE PACING
              DOES. Overlay centres its panel, so without this every character
              appended grows the box and nudges the whole dialog upward — the
              text creeps away from the reader the entire time it writes. A
              reserved height means the panel settles once and the words fill
              into a box that is already the right size.

              Sized just under a typical summary at this width, not above it: a
              floor taller than the content would leave the panel padded out
              with empty space.

              ⚠️ AND ONLY WHERE SOMETHING IS ACTUALLY BEING WRITTEN. The locked
              state is an UpgradeCard that arrives whole and never grows, so a
              floor under it is not reserved space, just a gap.
            */}
            <div className={`mt-5 ${locked ? '' : 'min-h-40'}`}>
              {locked ? (
                <UpgradeCard
                  title={`${page.label} is part of Pro`}
                  body={`Free covers your home screen ${FREE_SUMMARY_CAP} times. Pro explains this screen and the rest, and rewrites them whenever your numbers move.`}
                  compact
                />
              ) : (
                <>
                  {/* ⚠️ HIDDEN FROM ASSISTIVE TECH WHILE IT IS BEING WRITTEN. A
                      live region that grows by a word at a time re-announces on
                      every delta, which is unusable. The status line below says
                      when it starts and when it is ready; this becomes readable
                      the moment it stops moving. */}
                  {text && (
                    <p
                      aria-hidden={writing}
                      className={`text-navy text-[0.9375rem] leading-relaxed whitespace-pre-line ${
                        instantReveal ? 'motion-rise' : ''
                      }`}
                    >
                      {text}
                    </p>
                  )}

                  {writing && !text && (
                    /* ⚠️ NO BAR AND NO PERCENTAGE. A model call reports neither,
                       and components/dashboard/writing-progress.tsx states the
                       rule: a bar moving between events nobody measured is a
                       clock pretending to be a measurement. The words arriving
                       are the progress. */
                    <p className="text-slate text-sm">Having a look at your numbers…</p>
                  )}

                  {/* ⚠️ text-error-ink, NOT text-red-600. `dark:` is not wired in this app —
                      the theme swaps TOKENS under html[data-theme='dark'], so a
                      dark: class never matches and the red stayed at its light
                      value on a dark page. The token is measured for both:
                      6.47:1 light, 6.08:1 dark. */}
                  {error && <p className="text-error-ink text-sm">{error}</p>}

                  <p role="status" className="sr-only">
                    {writing ? 'Writing a summary of this screen.' : ''}
                    {status === 'done' ? 'Summary ready.' : ''}
                  </p>
                </>
              )}
            </div>

            <div className="border-line mt-5 flex items-center justify-between gap-4 border-t pt-4">
              {/* ⚠️ THE NUMBER IS PRINTED AS TEXT, not drawn as a meter — the
                  rule components/dashboard/meter.tsx carries. Null is Pro, and
                  Pro is told nothing rather than told "unlimited", which would
                  be a ceiling nobody measured. */}
              {/* ⚠️ NOT SHOWN ON A LOCKED SCREEN. "3 of 3 free summaries left"
                  under a card saying this screen is Pro invites somebody to
                  spend one here, which is not a thing they can do — their three
                  are for Home. Null is Pro, and Pro is told nothing rather than
                  told "unlimited", which would be a ceiling nobody measured. */}
              <p className="text-slate text-xs">
                {locked || left === null
                  ? ''
                  : `${left} of ${FREE_SUMMARY_CAP} free summaries left${left === 0 ? '' : ' — opening one you\u2019ve already had costs nothing'}`}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}

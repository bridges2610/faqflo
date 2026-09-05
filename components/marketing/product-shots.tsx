import Image, { type StaticImageData } from 'next/image';
import answersShot from '@/public/screenshots/dashboard-answers.png';
import auditShot from '@/public/screenshots/dashboard-audit.png';
import competitorsShot from '@/public/screenshots/dashboard-competitors.png';
import overviewShot from '@/public/screenshots/dashboard-overview.png';
import resultsShot from '@/public/screenshots/dashboard-results.png';

/*
  What the product actually looks like.

  ⚠️ THE FIRST THING ON THIS SITE THAT SHOWS THE REAL APP. Everything else is
  illustration and says so: the hero is a drawn story about an assistant citing
  someone (its header comment insists it stays "an illustration of the outcome,
  not a fake product UI"), HowItWorks draws a code editor that has never
  existed, and the generator runs live but on a SAMPLE constant. A visitor
  could read the whole page and never see a screen they would be paying for.

  ⚠️ THESE ARE GENERATED, NOT PASTED IN. Every file here comes out of
  `npm run shots`, which drives app/(dev)/shots — the real workspace components
  rendered against lib/dashboard/seed.ts. Re-run it after any dashboard layout
  change rather than editing these files or replacing them by hand; the whole
  point of the pipeline is that the marketing images cannot quietly rot a year
  behind the product.

  ⚠️ THE NUMBERS ARE A FIXTURE AND THE SECTION SAYS SO OUT LOUD. Summit Roofing
  is not a customer and 3-of-15 citations is not a result anybody got. This
  site's own /about page says plainly that anyone guaranteeing citations is
  selling something, and components/generator/faq-generator.tsx labels its
  sample output "Example" for the same reason. A screenshot full of invented
  metrics presented as somebody's outcome is exactly that failure with better
  art direction — so the line under the heading is not decoration, and it does
  not get cut for brevity.

  ⚠️ THE SECTION IS DARK, AND THE REASON IS ARITHMETIC RATHER THAN TASTE. It was
  bg-white, holding a bg-white frame, holding a near-white screenshot of a
  near-white product — three whites stacked, with shadow-hero as the only thing
  separating them. The screenshots blended into the page because there was
  nothing for them to contrast against.

  bg-ink is the surface that fixes it, and it is the only section on the
  marketing site using it, so it borrows nobody's idiom. The page now runs
  tint-cyan (HowItWorks) → ink (here) → white (WhatIsAeo): the product reveal is
  the darkest moment on the page, which is where the eye should land.

  ⚠️ EVERY COLOUR IN HERE HAD TO BE RE-PICKED, NOT JUST THE BACKGROUND. Against
  #0b1b3a the old eyebrow (text-primary) measures 3.30:1 — below AA — and both
  text-slate and the default heading navy are near-invisible. The replacements
  are the on-ink palette free-home.tsx already uses for its report masthead:
  text-accent at 9.43:1, white at 17.04:1, white/80 at 11.15:1, white/70 at
  8.84:1, white/60 at 6.79:1. Anything added here later gets measured the same
  way; text-slate in particular will look fine in an editor and vanish on screen.

  Static imports rather than string paths: next/image then knows the intrinsic
  2400x1720 and can generate a blur placeholder, which these earn at ~280KB
  each. It is the first placeholder="blur" on the site.
*/

type Shot = {
  src: StaticImageData;
  /** The screen's own name in the product, so the two vocabularies match. */
  screen: string;
  title: string;
  body: string;
};

/*
  ⚠️ HOME LEADS, AND IT USED TO BE LAST. The order was HowItWorks' loop — audit,
  answer, track — with Overview at the end "as the thing that holds them". That
  reads well as an argument and badly as a reveal: the first screen a visitor
  sees of the product should be the one they actually land on, not a diagnostic.
  Home first, then the loop in its original sequence, then Competitors.

  AI Mentions sits third, promoted from fourth: it is the payoff screen — the
  one that says whether any of this worked — and burying it behind the two
  screens about doing the work made the sequence read as chores first, proof
  later.

  Competitors is last because it is the only screen about somebody else. It
  answers the question AI Mentions provokes — "then who IS getting cited?" — so
  it has to come after it.
*/
const SHOTS: Shot[] = [
  {
    src: overviewShot,
    screen: 'Home',
    title: 'And a short list of what to do next',
    body: 'Not a wall of metrics. The few things that would move your visibility most, in order, with the work each one takes.',
  },
  {
    src: auditShot,
    screen: 'Your site',
    title: 'What an AI crawler sees when it reads you',
    body: '44 checks across your whole site, scored and sorted so the thing costing you the most sits at the top. Written in plain English, not audit-speak.',
  },
  {
    src: resultsShot,
    /* ⚠️ "AI Mentions", NOT "Results" — the product renamed this screen and the
       caption did not follow. `screen` holds the screen's own name in the
       product so the two vocabularies match, which is this field's whole job.

       The FILE is still dashboard-results.png: that key is a three-file
       contract with scripts/shots.mjs and app/(dev)/shots, and renaming it to
       match would be churn on something no reader ever sees. */
    screen: 'AI Mentions',
    title: 'Every question, every engine, side by side',
    /* The three outcomes in the product's own words — tracking-workspace.tsx
       says "cited you, named you without a link, or pointed somewhere else".
       A fourth vocabulary for the same three states is how a marketing page and
       a dashboard stop describing the same thing. */
    body: 'Your questions down the left, ChatGPT, Perplexity and Gemini across the top. Every cell says what that one actually did: cited you, named you without a link, or pointed somewhere else.',
  },
  {
    src: answersShot,
    screen: 'Answers',
    title: 'Answers written to be quoted, page by page',
    body: 'A question with a direct reply underneath — the shape assistants actually lift. Each page of your site gets its own set and its own block of code to paste.',
  },
  {
    src: competitorsShot,
    screen: 'Competitors',
    title: 'And who gets cited when it is not you',
    body: 'Every website the engines pointed to, split between you, the rival businesses and the directories that soak up the rest. Each citation a rival takes is a question you could have answered.',
  },
];

export function ProductShots() {
  return (
    /* ⚠️ NO HORIZONTAL PADDING ON THE SECTION ANY MORE. It moved onto the
       heading wrapper and onto the scroll track below, because the track has to
       reach both viewport edges — a gallery that stops short of the edge reads
       as a clipped grid rather than something that scrolls. The heading keeps
       the measure it always had. */
    <section id="inside" className="bg-ink scroll-mt-24 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          {/* text-accent, not text-primary: the blue is 3.30:1 on this ground.
              Same pairing free-home.tsx uses for its own ink masthead. */}
          <p className="text-accent text-xs font-bold tracking-[0.14em] uppercase">Inside FaqFlo</p>
          {/* Explicit text-white — the global h2 colour is navy and would be
              all but invisible here. */}
          <h2 className="mt-4 text-[2rem] text-balance text-white sm:text-[2.5rem]">
            Here&rsquo;s what you actually get
          </h2>
          {/* ⚠️ Load-bearing. See the note at the top of this file — without it
              the invented metrics below read as a customer's results. */}
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-white/70">
            Real screens from the product, filled with example data for a roofing company that
            doesn&rsquo;t exist.
          </p>
        </div>

      </div>

      {/*
        A snapping horizontal gallery, built entirely in CSS.

        ⚠️ NO JAVASCRIPT, AND THAT IS WHY THIS FILE IS STILL A SERVER COMPONENT.
        Swipe on a touch screen, two fingers on a trackpad, and arrow keys once
        the container has focus are all native to overflow-x plus scroll-snap.
        A carousel library — or even a `use client` boundary for a pair of arrow
        buttons — would ship JavaScript to the homepage to reproduce behaviour
        the browser already has.

        ⚠️ THE PEEK IS THE AFFORDANCE. Cards are deliberately narrower than the
        viewport so the next one is visibly cut off at the edge; that overhang is
        what tells a reader this scrolls. Widen them to 100% and the section
        silently becomes a slideshow with no way to know there is more.

        ⚠️ THE SCROLLBAR STAYS — STYLED, NOT HIDDEN. Hiding it is the reflex for
        a carousel and would be wrong here: with no arrow buttons it is the only
        control a desktop reader on a mouse has. The peek tells them there is
        more; the scrollbar is how they get it. So it is dressed to match the
        dark ground rather than removed.

        ⚠️ THE STANDARD PROPERTIES, NOT ::-webkit-scrollbar. Tailwind's
        scrollbar-thin / scrollbar-thumb-* / scrollbar-track-* compile to
        `scrollbar-width` and `scrollbar-color`, which is the specified way to do
        this. The webkit pseudo-elements are the older trick and they OVERRIDE
        the standard properties in browsers that support both, so mixing the two
        buys worse behaviour in current browsers to style older ones. Anything
        that does not support these (Chrome before 121, Safari before 18.2) gets
        its default scrollbar — still visible, still draggable, which is the only
        property this element actually depends on.

        ⚠️ NOT TOO FAINT. white/25 is deliberate rather than the prettier
        white/10: this bar is a control, not a decoration, and a reader who
        cannot find it cannot reach cards two through five. It brightens on
        hover so it confirms itself under the pointer.

        ⚠️ tabIndex AND aria-label ARE NOT OPTIONAL. A div that scrolls is not
        focusable by default, so without the first a keyboard user cannot reach
        the other four screens at all; without the second the region is
        announced as nothing. This is the one accessibility requirement the
        no-JavaScript version adds rather than removes.

        ⚠️ motion-safe:, NOT A BARE scroll-smooth. The reduced-motion block in
        globals.css sets scroll-behavior: auto on `html` ONLY — it does not
        reach an element that sets its own. Without the variant this animates
        for somebody who explicitly asked it not to.

        The mask is the eye candy, and it is one property: cards dissolve into
        the ink at both ends instead of being guillotined by the viewport edge.
      */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Screens from inside FaqFlo"
        className="mt-14 snap-x snap-mandatory overflow-x-auto pb-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/25 hover:scrollbar-thumb-white/40 motion-safe:scroll-smooth sm:mt-16 mask-[linear-gradient(to_right,transparent,black_1.25rem,black_calc(100%-1.25rem),transparent)]"
      >
        <div className="flex w-max gap-6 px-5 sm:px-8">
          {SHOTS.map((shot) => (
            <figure
              key={shot.screen}
              /* snap-start rather than snap-center: a card then lands flush with
                 the same left edge the heading uses, and the peek is always on
                 the right where the next card is. Centring would leave the first
                 and last cards floating against uneven gutters. */
              className="w-[86vw] shrink-0 snap-start sm:w-[68vw] lg:w-4xl"
            >
              {/*
                A plain framed panel, deliberately not the navy traffic-light
                chrome from how-it-works.tsx. That idiom means "here is a file",
                it is used by the section directly above this one, and repeating
                it here would make both read as decoration rather than either
                one meaning anything.

                No .grain either: it is a mix-blend-mode overlay on ::after, so
                it would sit on top of the screenshot and tint the UI inside it.
              */}
              {/* ⚠️ A LIGHT RING, NOT border-line. That token is a pale grey
                  picked to be almost invisible against white; on ink it
                  disappears entirely and the panel loses its edge. A white ring
                  at low opacity does on a dark ground what the hairline does on
                  a light one.

                  bg-white stays, and is now the whole point: the white panel is
                  what pops off the dark section. */}
              <div className="shadow-hero overflow-hidden rounded-2xl bg-white ring-1 ring-white/15">
                <Image
                  src={shot.src}
                  /* Not lower-cased: doing that to build one sentence turned
                     "AI" into "ai" in the audit shot's alt text. */
                  alt={`The ${shot.screen} screen in FaqFlo — ${shot.title}`}
                  placeholder="blur"
                  /* ⚠️ THE CARD'S WIDTH, NOT THE PAGE'S. This said
                     "(min-width: 1152px) 72rem, 100vw" when each shot spanned
                     the container. The breakpoints below mirror the figure's
                     own classes exactly — get them out of step and Next serves
                     a file for a slot that does not exist, on the heaviest
                     images on the site. */
                  sizes="(min-width: 1024px) 56rem, (min-width: 640px) 68vw, 86vw"
                  className="w-full"
                />
              </div>

              <figcaption className="mx-auto mt-6 max-w-2xl text-center">
                <p className="font-mono text-xs tracking-wide text-white/60 uppercase">
                  {shot.screen}
                </p>
                <h3 className="mt-2 text-xl text-white">{shot.title}</h3>
                <p className="mt-2 text-[1.0625rem] leading-relaxed text-white/80">{shot.body}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

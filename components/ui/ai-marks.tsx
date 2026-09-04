/*
  The AI companies' own marks.

  Every AI channel in this product used to be a bare word — "GPTBot", "Gemini",
  "PerplexityBot" — on pages whose whole subject is which AI systems can see
  your site. A reader scanning the crawler band or the "By engine" card should
  know who is involved before reading a word.

  NOMINATIVE USE, AND NOTHING MORE. Each mark identifies the actual product
  being measured, sitting beside that product's name as text. No call site
  places one where it could read as a partnership, an endorsement or a customer
  logo — that is why there is no logo strip under the hero and never should be.
  Adding one of these to a new surface means asking that question again.

  Lives here rather than in components/dashboard/ for the same reason
  components/ui/icons.tsx does: both components/marketing/ and
  components/dashboard/ import it, and a marketing file reaching into
  components/dashboard/ would imply the two share more than a logo.

  ⚠️ THESE DO NOT TAKE `currentColor`. Unlike icons.tsx and nav-icons.tsx —
  our own drawings, which inherit whatever colour they sit in — every path here
  carries a fixed `fill` because it is someone else's mark. `className` is for
  SIZE ONLY. A text-colour utility on the wrapper will not tint them, and that
  is deliberate.

  ⚠️ SIZED BY THE CALLER, PADDED BY THE VIEWBOX. Each mark keeps its own path
  data untouched and is balanced by widening its viewBox instead — the marks
  that come drawn edge-to-edge in a 24×24 box get `-1.5 -1.5 27 27`, which
  insets them without touching a single coordinate. This matters because they
  are otherwise wildly different weights at the same h-4 w-4: a solid four-point
  star fills its box, a thin outlined glyph does not, and the eye reads the
  first as much bigger. Change a viewBox here and check it against the other
  four at 16px — bounding boxes are not optical sizes.

  PROVENANCE: Anthropic's, Perplexity's and Gemini's paths are the official
  marks as published by simple-icons (the SVG data is CC0; the marks themselves
  remain their owners' trademarks, which is what the nominative-use note above
  is about). Google's came from the sign-in button it has always been on.
  OpenAI's is drawn here — simple-icons no longer carries it.

  ⚠️ DO NOT REDRAW ONE BY HAND. The first version of this file had a
  hand-authored Perplexity glyph that typechecked, built, and rendered a
  garbled asterisk that looked nothing like the mark. Nothing in the toolchain
  catches a wrong path — only looking at it does.
*/

import type { Engine } from '@/lib/dashboard/types';

type MarkProps = { className?: string };

/**
 * OpenAI's knot.
 *
 * Does double duty: the GPTBot row on the homepage, where the owner is OpenAI,
 * and the ChatGPT engine in the dashboard. One company, one mark — ChatGPT's
 * own glyph IS the OpenAI knot, so splitting them would be two names for the
 * same paths.
 */
export function OpenAiMark({ className = '' }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="var(--color-mark-openai)"
        d="M21.55 10.02a5.42 5.42 0 0 0-.47-4.46 5.5 5.5 0 0 0-5.91-2.63A5.45 5.45 0 0 0 11.09 1.2a5.5 5.5 0 0 0-5.24 3.8 5.43 5.43 0 0 0-3.63 2.64 5.5 5.5 0 0 0 .68 6.44 5.42 5.42 0 0 0 .46 4.46 5.5 5.5 0 0 0 5.92 2.63 5.43 5.43 0 0 0 4.08 1.83 5.5 5.5 0 0 0 5.24-3.81 5.43 5.43 0 0 0 3.63-2.64 5.5 5.5 0 0 0-.68-6.43Zm-8.19 11.45a4.07 4.07 0 0 1-2.62-.95l.13-.07 4.34-2.51a.7.7 0 0 0 .36-.61v-6.13l1.83 1.06a.07.07 0 0 1 .04.05v5.07a4.09 4.09 0 0 1-4.08 4.09ZM4.58 17.7a4.07 4.07 0 0 1-.49-2.73l.13.08 4.34 2.5a.71.71 0 0 0 .71 0l5.3-3.05v2.11a.07.07 0 0 1-.03.06l-4.39 2.53a4.09 4.09 0 0 1-5.57-1.5ZM3.44 8.26a4.07 4.07 0 0 1 2.13-1.79v5.16a.7.7 0 0 0 .35.61l5.28 3.05-1.83 1.06a.07.07 0 0 1-.07 0L4.92 13.8a4.09 4.09 0 0 1-1.48-5.55Zm15.07 3.5-5.29-3.06 1.83-1.05a.07.07 0 0 1 .06 0l4.39 2.53a4.09 4.09 0 0 1-.62 7.37v-5.17a.7.7 0 0 0-.37-.62Zm1.83-2.74-.13-.08-4.34-2.53a.71.71 0 0 0-.72 0l-5.29 3.06V7.35a.07.07 0 0 1 .03-.06l4.39-2.53a4.09 4.09 0 0 1 6.06 4.24ZM9.87 12.79l-1.83-1.06a.07.07 0 0 1-.04-.05V6.61a4.09 4.09 0 0 1 6.7-3.14l-.13.07-4.34 2.51a.7.7 0 0 0-.36.61v6.13Zm1-2.14 2.36-1.36 2.36 1.36v2.72l-2.36 1.36-2.36-1.36v-2.72Z"
      />
    </svg>
  );
}

/**
 * Claude's starburst, in Anthropic's clay.
 *
 * Crawler row only. ⚠️ Anthropic is NOT an engine — ClaudeBot fetches pages,
 * but we do not put questions to Claude, and ENGINE_MARKS below must never gain
 * a Claude entry. See the warning on ENGINES in lib/dashboard/types.ts.
 */
export function AnthropicMark({ className = '' }: MarkProps) {
  return (
    <svg viewBox="-0.6 -0.6 25.2 25.2" className={className} aria-hidden="true">
      <path
        fill="#D97757"
        d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"
      />
    </svg>
  );
}

/**
 * Google's mark, in its own colours — it must not be recoloured.
 *
 * Moved here verbatim from components/auth/google-button.tsx, which now imports
 * it. Two copies of the same nine hundred characters of path data is exactly
 * the drift this file exists to prevent.
 *
 * The homepage row it appears on is Google-Extended, the crawler token that
 * gates Gemini and AI Overviews. Gemini the engine gets GeminiMark below; they
 * are different marks because they are different things.
 */
export function GoogleMark({ className = '' }: MarkProps) {
  return (
    <svg viewBox="-1.3 -1.3 20.6 20.6" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/** Perplexity's mark, in its own teal. */
export function PerplexityMark({ className = '' }: MarkProps) {
  return (
    <svg viewBox="-0.6 -0.6 25.2 25.2" className={className} aria-hidden="true">
      <path
        fill="#20808D"
        d="M22.3977 7.0896h-2.3106V.0676l-7.5094 6.3542V.1577h-1.1554v6.1966L4.4904 0v7.0896H1.6023v10.3976h2.8882V24l6.932-6.3591v6.2005h1.1554v-6.0469l6.9318 6.1807v-6.4879h2.8882V7.0896zm-3.4657-4.531v4.531h-5.355l5.355-4.531zm-13.2862.0676 4.8691 4.4634H5.6458V2.6262zM2.7576 16.332V8.245h7.8476l-6.1149 6.1147v1.9723H2.7576zm2.8882 5.0404v-3.8852h.0001v-2.6488l5.7763-5.7764v7.0111l-5.7764 5.2993zm12.7086.0248-5.7766-5.1509V9.0618l5.7766 5.7766v6.5588zm2.8882-5.0652h-1.733v-1.9723L13.3948 8.245h7.8478v8.087z"
      />
    </svg>
  );
}

/*
  Gemini's spark uses a gradient, and a gradient needs an id.

  ⚠️ A CONSTANT ID, NOT useId(). The mark renders at most twice on any one page
  (the "By engine" card and the chart legend), and both <defs> are byte-identical
  — a browser resolving url(#…) to the first of two identical gradients paints
  exactly the right thing. useId() would be the textbook answer and is the wrong
  one here: it is a hook, so it would make this a Client Component, dragging all
  five marks into the bundle to solve a problem no reader can see.
*/
const GEMINI_GRADIENT_ID = 'faqflo-gemini-spark';

/**
 * Gemini's spark.
 *
 * Not the same thing as GoogleMark. Google-Extended is a crawler token on the
 * homepage; Gemini is an engine we actually put questions to. Using the "G" for
 * both would blur a distinction the copy on both surfaces is careful about.
 *
 * Full bleed, alone among the five: a four-point star with concave sides puts
 * very little ink near its bounding box, so the viewBox padding that balances
 * the others left this one reading a size smaller than them.
 */
export function GeminiMark({ className = '' }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={GEMINI_GRADIENT_ID} x1="3" y1="21" x2="21" y2="3">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="45%" stopColor="#7C6BF5" />
          <stop offset="100%" stopColor="#C063E8" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${GEMINI_GRADIENT_ID})`}
        d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"
      />
    </svg>
  );
}

/*
  Which mark goes with which engine.

  ⚠️ TYPED AS Record<Engine, …> ON PURPOSE. lib/dashboard/types.ts warns that
  renaming an engine means renaming it in three places — the ENGINES tuple, the
  colour map in components/dashboard/citation-chart.tsx, and the seed fixture.
  This is a fourth. A full Record makes a rename fail `npm run typecheck`
  instead of silently rendering no mark, which is the one failure mode nobody
  would catch in review.

  ⚠️ THREE ENTRIES, AND ONLY EVER THESE THREE. No Claude (we do not ask it), no
  Google AI Overviews (it has no API, so a row for it would promise a
  measurement that cannot be taken). Both warnings are stated at length on
  ENGINES itself.
*/
const ENGINE_MARKS: Record<Engine, (props: MarkProps) => React.ReactElement> = {
  ChatGPT: OpenAiMark,
  Perplexity: PerplexityMark,
  Gemini: GeminiMark,
};

/**
 * Whichever mark belongs to this engine.
 *
 * A component rather than an exported map, because every dashboard call site is
 * inside an `ENGINES.map(…)` with a concise arrow body. Reading the map there
 * means naming the component first — `const Mark = ENGINE_MARKS[engine]`, since
 * JSX only treats a capitalised identifier as a component — which forces the
 * arrow into a block body and re-indents the whole row for one lookup. This
 * does the lookup one level down, where a block body costs nothing.
 *
 * `className` is required and takes no default: the three surfaces that use
 * this deliberately size it differently, and a default would let a fourth
 * inherit a size nobody chose for it.
 */
export function EngineMark({ engine, className }: { engine: Engine; className: string }) {
  const Mark = ENGINE_MARKS[engine];

  return <Mark className={className} />;
}

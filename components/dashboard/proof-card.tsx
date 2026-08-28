import { EngineMark } from '@/components/ui/ai-marks';
import { MAX_EXCERPT_CHARS } from '@/lib/dashboard/types';
import { linkIsRival, type Proof } from '@/lib/dashboard/proof';
import { AnswerText } from './answer-text';

/**
 * Does this excerpt end mid-thought?
 *
 * The same cheap heuristic tracking-workspace.tsx uses, and deliberately a copy
 * rather than a shared import: it decides whether to print a caveat, never what
 * the data means, and the two pages caveat differently. Answers stored before
 * the word-boundary cut landed simply stop at 600 characters with no flag on
 * the row to consult.
 */
function looksTruncated(excerpt: string): boolean {
  const end = excerpt.trimEnd().slice(-1);
  return excerpt.length >= MAX_EXCERPT_CHARS - 1 && !'.!?"”)'.includes(end);
}

/*
  One real answer, quoted.

  ⚠️ THIS IS THE PAGE. Everything above it is setup and everything below is
  follow-through: the score says how readable the site is, the checks say why,
  and this says what actually happened when somebody asked. A number can be
  argued with. A verbatim answer that names somebody else cannot.

  ⚠️ WE SAY WHAT HAPPENED AND CLAIM NO CATEGORY. `citedInstead` is the top
  source in the engine's own ranking that isn't the customer's domain — which is
  a lead-generation directory at least as often as it is a rival business. So
  the line is "AI cited angi.com instead of you", never "your competitor". The
  first is true whatever that domain turns out to be; the second is wrong on a
  large share of local-services accounts, and being confidently wrong in the one
  place this page is most emphatic would cost the reader's trust in all of it.

  ⚠️ THE HIGHLIGHT IS A BONUS; THE CHIP CARRIES THE POINT. We can mark the rival
  where the engine LINKED it, because a link token has an href to match against.
  A rival merely named in the prose cannot be found — nothing on the row stores
  a business name — so the chip below the quote states it either way rather than
  the section quietly failing to make its point. See linkIsRival().
*/
export function ProofCard({ proof, siteName }: { proof: Proof; siteName: string }) {
  const { check, citedInstead } = proof;
  const named = check.outcome === 'cited' || check.outcome === 'mentioned';

  /*
    ⚠️ NO CARD, DESPITE THE NAME. This sits inside a numbered section of a
    report, and a white panel with a shadow floating in a flat document is the
    card metaphor globals.css argues against for anything meant to be read
    rather than worked in.

    ⚠️ THE OUTCOME LEADS, AND IT DID NOT USED TO. The order was question →
    engine → six hundred characters of grey prose → what it meant. Everything
    the reader came for was underneath the longest, least scannable thing on the
    page, so the section read as a wall of text with a conclusion hidden at the
    bottom. Now the finding is the first line, the quote is the evidence for it,
    and somebody who reads one sentence and stops has still read the point.
  */
  return (
    <div>
      {/* The finding, in one line, at the top. */}
      {named ? (
        <p className="text-navy text-[1.0625rem] leading-snug font-semibold">
          <span className="text-success-ink">{check.engine} named {siteName}.</span>
        </p>
      ) : citedInstead ? (
        <p className="text-navy text-[1.0625rem] leading-snug font-semibold">
          {check.engine} answered — and pointed at{' '}
          <span className="bg-warn-soft text-warn-ink rounded px-1.5 py-0.5 font-mono text-[0.9375rem]">
            {citedInstead}
          </span>
          , not you.
        </p>
      ) : (
        /* No usable source in the answer. "Nobody in particular" is the honest
           reading — not an empty chip, and not a rival we did not find. */
        <p className="text-navy text-[1.0625rem] leading-snug font-semibold">
          {check.engine} answered, and didn&rsquo;t mention you at all.
        </p>
      )}

      {/* What was asked, and of whom. The engine is named because the answer is
          its answer, not ours, and the disclosure the Results page makes applies
          here too: we ask the API, not the chat window. */}
      <p className="text-slate mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        <EngineMark engine={check.engine} className="h-3.5 w-3.5 shrink-0" />
        <span>We asked:</span>
        <span className="text-navy font-medium">&ldquo;{check.question}&rdquo;</span>
      </p>

      {/*
        The evidence itself, on its own surface.

        ⚠️ A TINT AND A RULE, NOT A CARD. The panel is bg-cloud with an accent
        edge — flat, no shadow — so it reads as a quotation inside the document
        rather than as a floating widget on top of it. Bigger type than the old
        13px too: this is the longest passage on the page and it was set
        smallest, which is backwards.
      */}
      <blockquote className="border-accent bg-cloud mt-3 rounded-r-lg border-l-[3px] px-4 py-3">
        {/* ⚠️ The child selector is deliberate and load-bearing. AnswerText puts
            `text-sm` on every paragraph it renders and takes className on the
            wrapper, so a size passed plainly would lose to it. `[&>p]` is one
            specificity step higher and wins. Bumping the size matters here
            because this is the longest passage on the page and it was set
            smallest of anything on it. */}
        <AnswerText
          text={check.excerpt!}
          className="[&>p]:text-[0.9375rem]"
          highlightLink={(href) => linkIsRival(href, citedInstead)}
        />
        {looksTruncated(check.excerpt!) && (
          <p className="text-slate/70 mt-2 text-xs">
            Excerpt — we store the first {MAX_EXCERPT_CHARS} characters of each answer.
          </p>
        )}
      </blockquote>
    </div>
  );
}

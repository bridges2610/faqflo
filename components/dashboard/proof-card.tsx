import { Card } from '@/components/ui/card';
import { EngineMark } from '@/components/ui/ai-marks';
import { MAX_EXCERPT_CHARS } from '@/lib/dashboard/types';
import { linkIsRival, type Proof } from '@/lib/dashboard/proof';
import { AnswerText } from './answer-text';
import { MicroLabel } from './micro-label';

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

  return (
    <Card className="p-5 sm:p-7">
      <MicroLabel>What AI said about you</MicroLabel>

      <p className="text-navy mt-2 text-[1.0625rem] font-semibold">
        &ldquo;{check.question}&rdquo;
      </p>

      <p className="text-slate mt-1 flex items-center gap-1.5 text-xs">
        {/* The engine is named because the answer is its answer, not ours, and
            the disclosure the Results page makes applies here too: we ask the
            API, not the chat window. */}
        <EngineMark engine={check.engine} className="h-3.5 w-3.5 shrink-0" />
        asked on {check.engine}
      </p>

      {/* The evidence itself. Left rule rather than quote marks — the text
          already contains its own punctuation and often its own quotes. */}
      <div className="border-line mt-4 border-l-2 pl-4">
        <AnswerText
          text={check.excerpt!}
          highlightLink={(href) => linkIsRival(href, citedInstead)}
        />
        {looksTruncated(check.excerpt!) && (
          <p className="text-slate/70 mt-2 text-xs">
            Excerpt — we store the first {MAX_EXCERPT_CHARS} characters of each answer.
          </p>
        )}
      </div>

      {named ? (
        <p className="text-success-ink mt-4 text-sm font-semibold">
          It named {siteName}.
        </p>
      ) : citedInstead ? (
        <p className="text-navy mt-4 text-sm">
          AI cited <span className="font-mono font-semibold">{citedInstead}</span> instead of you.
        </p>
      ) : (
        /* No usable source in the answer. "Nobody in particular" is the honest
           reading — not an empty chip, and not a rival we did not find. */
        <p className="text-navy mt-4 text-sm">It didn&rsquo;t mention you at all.</p>
      )}
    </Card>
  );
}

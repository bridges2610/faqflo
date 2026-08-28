import { STATUS_CHIP, STATUS_WORD, StatusIcon } from '@/components/ui/status-icon';
import { plainFor } from '@/lib/audit/plain';
import { QUICK_FINDING_IDS, type AuditReport, type Finding } from '@/lib/audit/types';

type QuickId = (typeof QUICK_FINDING_IDS)[number];

/*
  Can AI read your site — the three checks, as boxes.

  ⚠️ THE THREE IDS ARE NAMED, NOT FILTERED BY STATUS. Every other plain-English
  view of an audit drops the passes and lists the problems, which is right for
  prose: nobody wants a paragraph about what is fine. A checklist is the
  opposite. Its whole value is that the reader can count the boxes and see three
  of three, and a list that silently omits what passed cannot be counted — two
  green ticks reads as "one check is still loading", not as "one thing failed".

  ⚠️ SO isHiddenInSummary() IS DELIBERATELY NOT USED HERE. It exists to drop
  findings whose plain entry is an empty string — "true, but not worth a
  business owner's attention" — and applying it would let a row vanish from a
  fixed list of three. QUICK_FINDING_IDS is exactly what a free audit scores
  (see lib/audit/types.ts), so asking for those three by name gives a list whose
  length does not depend on the result.

  ⚠️ AND THE ROWS CAN STILL BE FEWER THAN THREE. A finding that never ran is not
  in the report at all, and inventing a row for it would claim a check we did
  not take. Missing ids are skipped; the count above says how many were read.
*/

/**
 * The question each check answers, in the reader's words.
 *
 * ⚠️ NOT `finding.label`, WHICH IS THE TECHNICAL NAME. Those read "Raw HTML
 * content" and "Crawler access" — accurate, and the vocabulary of the audit
 * screen rather than of somebody who runs a roofing company. The first two are
 * lifted from the pricing page's own free-plan bullets so the promise and the
 * result are worded the same way.
 */
const ASKS: Record<QuickId, string> = {
  'raw-html': 'Can AI read your pages, or does it see a blank page?',
  crawlers: 'Are the AI assistants allowed in?',
  'qa-markup': 'Can AI tell which text answers what?',
};

/**
 * The three findings, in order, skipping any the report does not hold.
 *
 * Exported so the caller can gate the section heading on `.length` — a
 * "Can AI read your site?" heading over nothing would promise a check we never
 * took. See the same argument on nextStepsFor().
 */
export function readabilityRows(report: AuditReport): Finding[] {
  const byId = new Map(report.pillars.flatMap((p) => p.findings).map((f) => [f.id, f]));
  return QUICK_FINDING_IDS.map((id) => byId.get(id)).filter((f): f is Finding => f !== undefined);
}

export function ReadabilityChecklist({ rows }: { rows: Finding[] }) {
  const clear = rows.filter((f) => f.status === 'pass').length;

  return (
    <>
      {/* The count in text, above the boxes. The ticks are a second reading of
          this number, not the only place it exists. */}
      <p className="text-slate text-sm">
        <span className="text-navy font-semibold tabular-nums">
          {clear} of {rows.length}
        </span>{' '}
        clear.
      </p>

      <ul className="divide-line mt-3 divide-y">
        {rows.map((f) => (
          <li key={f.id} className="flex gap-3 py-3.5 first:pt-0">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${STATUS_CHIP[f.status]}`}
            >
              <StatusIcon status={f.status} />
            </span>
            <div className="min-w-0">
              <p className="text-navy text-[0.9375rem] font-semibold">
                {ASKS[f.id as QuickId] ?? f.label}
                {/* The glyph is aria-hidden and the chip is a colour, so this
                    span is the only place the outcome is actually readable. */}
                <span className="sr-only"> — {STATUS_WORD[f.status]}</span>
              </p>
              <p className="text-slate mt-1 text-sm leading-relaxed">{plainFor(f)}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

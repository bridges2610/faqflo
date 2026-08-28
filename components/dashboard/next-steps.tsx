'use client';

import { Button } from '@/components/ui/button';
import { buildActionPlan } from '@/lib/audit/actions';
import { plainAction } from '@/lib/audit/plain';
import type { ActionItem, AuditReport } from '@/lib/audit/types';
import { useCopy } from '@/lib/dashboard/use-copy';
import { Disclosure } from '@/components/ui/disclosure';
import { CopyIcon, TickIcon } from './nav-icons';

/** At most this many. "Show opportunities, but limit this." */
const LIMIT = 3;

/*
  What to do next, on a page with nowhere to send anybody.

  ⚠️ report.actions IS EMPTY ON FREE, STRUCTURALLY, so this builds its own.
  lib/audit/run.ts line 104 reads `actions: depth === 'quick' ? [] : buildActionPlan(...)`
  and lib/scan/run.ts gives free `depth: 'quick'`. Reading report.actions here
  would render nothing, forever, on every free account — and it would look like
  a site with no problems rather than a field that was never filled.

  ⚠️ GATED LINKS LOSE THEIR BUTTON, THEY DO NOT LOSE THE STEP — AND THE FIRST
  VERSION OF THIS FILE GOT THAT WRONG. Several recipes point at /dashboard/faqs
  and /dashboard/publish, which redirect a free account back to this page, so
  they were filtered out entirely. Back when a quick audit kept only three
  findings that emptied the section completely on the commonest free result
  there is: a site whose only fault is `qa-markup` fires exactly those two
  recipes and nothing else.

  The advice was never the part that was gated. "Publish a set of question-and-
  answer content" is true and worth reading whether or not we hand over a
  button, so the step stays and the action is dropped to `none`. What the button
  would have opened is the upgrade, and UpgradeCard at the foot of the report
  makes that case once, properly, instead of as a broken link here.

  ⚠️ NOT TaskRow, AND NOT BY OVERSIGHT. audit-summary.tsx explains: TaskRow
  prints "+N points" and an effort band, which is the vocabulary of the
  technical report. This reader is not reasoning about points.
*/
/**
 * The steps, derived — exported so the caller can decide whether to draw a
 * heading at all.
 *
 * ⚠️ NOTHING TO DO IS A REAL OUTCOME, AND AN EMPTY SECTION IS NOT HOW TO SAY
 * IT. A site can genuinely pass everything a single page can be asked, and this
 * returns []. Were the emptiness decided inside the component, the report would
 * render "What to do next" over a blank space — a heading promising content
 * that does not exist, which reads as a loading bug rather than as good news.
 * The caller gates the whole section on `.length`, so the derivation has to be
 * available before the render.
 */
export function nextStepsFor(report: AuditReport): ActionItem[] {
  const findings = report.pillars.flatMap((p) => p.findings);

  /*
    The hrefs are required by the type and never rendered: every link action is
    flattened to `none` below. They point at the plan page rather than at the
    gated routes so that a future change which stops flattening fails safe —
    landing on the upgrade page rather than in a redirect loop.
  */
  const plan = buildActionPlan(findings, {
    domain: report.domain,
    faqsHref: '/dashboard/plan',
    publishHref: '/dashboard/plan',
    questionsHref: '/dashboard/plan',
  });

  return plan
    .map(
      (item): ActionItem =>
        item.action.kind === 'link' ? { ...item, action: { kind: 'none' } } : item,
    )
    .slice(0, LIMIT);
}

export function NextSteps({ steps }: { steps: ActionItem[] }) {
  return (
    <>
      <ol className="divide-line divide-y">
        {steps.map((item, i) => (
          <StepRow key={item.id} item={item} index={i} />
        ))}
      </ol>

      {/*
        The other way out, said ONCE under the list.

        ⚠️ IT WAS PER-STEP AND THAT WAS WORSE. Rendering it on every row put the
        same sentence on screen three times in a column, which reads as nagging
        rather than as help — and it is the same offer each time, so repeating
        it adds nothing. Once, at the end, is where somebody who has read the
        list and decided it is not for them actually is.

        ⚠️ AND IT COVERS THE STEPS WITH NO CODE, WHICH IS THE POINT. A step with
        a snippet is one somebody might attempt. "Get your words into the page
        itself" is one they almost certainly cannot do alone — its own `why`
        already ends "your web developer will know what this means" — and it has
        no snippet to sit under.
      */}
      <p className="text-slate mt-4 text-[0.9375rem] leading-relaxed">
        Not sure about any of these? Send them to whoever looks after your website.
      </p>
    </>
  );
}

function StepRow({ item, index }: { item: ActionItem; index: number }) {
  const { copied, copy } = useCopy();
  const { what, why, label, where } = plainAction(item);

  return (
    <li className="py-4 first:pt-0">
      <div className="flex gap-3.5">
        <span className="bg-primary-soft text-primary font-display mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-navy text-[1.0625rem] leading-snug font-semibold">{what}</h3>
            <span className="text-slate text-xs">about {item.effort}</span>
          </div>
          <p className="text-slate mt-1.5 text-[0.9375rem] leading-relaxed">{why}</p>

          {/*
            ⚠️ THE CODE IS BEHIND A DOOR, AND THE DOOR IS WHAT MAKES THE JARGON
            LEGAL. audit-summary.tsx allows exactly one exception to the plain
            rule — "text the customer has to paste somewhere, which has to be
            exact" — but on a page read by a roofer, a raw <meta> tag sitting
            open in the flow is the thing that makes the whole report feel like
            it was written for somebody else. Opening a drawer marked "the code"
            is consent to see code, so `where` and the snippet can be precise
            once you are inside it.

            Closed, every step reads as a plain sentence and a time estimate.
            That is the page a business owner should be able to finish.
          */}
          {item.action.kind === 'copy' && (
            <div className="mt-3">
              <Disclosure label="Show me the code">
                <p className="text-slate text-sm leading-relaxed">{where}</p>
                <pre className="border-line bg-cloud mt-2 overflow-auto rounded-lg border p-3">
                  <code className="text-navy font-mono text-[0.6875rem] leading-relaxed whitespace-pre">
                    {item.action.snippet}
                  </code>
                </pre>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => copy(item.action.kind === 'copy' ? item.action.snippet : '')}
                >
                  {copied ? <TickIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                  {copied ? 'Copied' : label}
                </Button>
              </Disclosure>
            </div>
          )}

        </div>
      </div>
    </li>
  );
}

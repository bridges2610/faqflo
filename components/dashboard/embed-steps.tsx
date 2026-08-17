import { Fragment } from 'react';

import { Badge } from '@/components/ui/badge';
import type { EmbedGuide, EmbedStep } from '@/lib/dashboard/export';
import { MicroLabel } from './micro-label';

/*
  One platform's paste instructions, rendered.

  ⚠️ NO 'use client', NO HOOKS, AND THAT IS THE POINT. Two callers:
  embed-instructions.tsx, a client island with a picker, and help-workspace.tsx,
  the app's only SERVER workspace, which renders all six at once and cannot hold
  state. A hook here would fork those two into separate renderers — and the
  reason the instructions live in lib/dashboard/export.ts as plain data is so
  that cannot happen.

  Heading level is a prop rather than SectionTitle because the two callers nest
  it at different depths: h3 under the Publish card's h2, h4 under Help's "Where
  it goes on your platform" h3. SectionTitle only offers h2 and h3.
*/

/** Prose, control labels and literal markup, in the order they were written. */
function StepText({ parts }: { parts: EmbedStep }) {
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {typeof part === 'string' ? (
            part
          ) : part.kind === 'ui' ? (
            // A thing they will see on their own screen, in their builder.
            // Bolded rather than quoted so it can be found by scanning.
            <strong className="text-navy font-semibold">{part.label}</strong>
          ) : (
            <code className="text-navy font-mono text-xs">{part.text}</code>
          )}
        </Fragment>
      ))}
    </>
  );
}

export function EmbedStepList({
  guide,
  headingAs = 'h3',
  headingId,
}: {
  guide: EmbedGuide;
  headingAs?: 'h3' | 'h4';
  /** Set when a caller labels a region with this heading. */
  headingId?: string;
}) {
  const Heading = headingAs;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Heading id={headingId} className="text-navy text-[0.9375rem] font-semibold">
          {guide.platform}
        </Heading>
        {guide.warning && <Badge tone="neutral">Read this one</Badge>}
      </div>

      <p
        className={`mt-1 text-sm leading-relaxed ${guide.warning ? 'text-error-ink' : 'text-slate'}`}
      >
        {guide.summary}
      </p>

      {/*
        A real <ol>, with list-none and a drawn number.

        The visible circle is aria-hidden and the count comes from the list
        semantics, so a screen reader announces "3 of 5" once rather than
        hearing the number twice. Tailwind's marker styling cannot reach this
        treatment, and swapping the <ol> for a <div> would throw the count away.
      */}
      <ol className="mt-3 list-none space-y-2.5">
        {guide.steps.map((step, i) => (
          <li key={i} className="text-slate flex gap-3 text-sm leading-relaxed">
            <span
              aria-hidden="true"
              className="bg-cloud text-navy mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[0.6875rem] font-semibold"
            >
              {i + 1}
            </span>
            <span className="min-w-0">
              <StepText parts={step} />
            </span>
          </li>
        ))}
      </ol>

      {guide.gotcha && (
        <div className="mt-4">
          {/* Labelled rather than buried in a fifth step: it is not something
              to do, it is what to look at when the four above appear to have
              worked and the page still says nothing. */}
          <MicroLabel>If it looks wrong</MicroLabel>
          <p className="text-slate mt-1 text-sm leading-relaxed">
            <StepText parts={guide.gotcha} />
          </p>
        </div>
      )}
    </div>
  );
}

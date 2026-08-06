'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import {
  buildFaqPageSchema,
  readinessChecks,
  schemaToString,
  type CheckStatus,
} from '@/lib/dashboard/schema';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';

/** Pass / warn / fail marks. Shape differs as well as colour, so the state is
    readable without relying on hue. */
function CheckMark({ status }: { status: CheckStatus }) {
  const styles: Record<CheckStatus, string> = {
    pass: 'bg-success/12 text-success-ink',
    warn: 'bg-accent-soft text-teal-ink',
    fail: 'bg-error/12 text-error-ink',
  };

  return (
    <span
      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${styles[status]}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
      >
        {status === 'pass' && <polyline points="3 8.5 6.5 12 13 4.5" />}
        {status === 'warn' && <path d="M8 4v5M8 11.5h.01" />}
        {status === 'fail' && <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />}
      </svg>
    </span>
  );
}

const STATUS_WORD: Record<CheckStatus, string> = {
  pass: 'Ready',
  warn: 'Worth a look',
  fail: 'Needs fixing',
};

export function AeoWorkspace() {
  const { site, faqs } = useDashboard();
  const [copied, setCopied] = useState(false);

  if (!site) {
    return (
      <>
        <PageHeader title="AEO" description="The schema answer engines read." />
        <EmptyState
          title="Add a site first"
          body="Schema is generated per site from its published FAQs."
          action={<ButtonLink href="/dashboard/setup">Go to setup</ButtonLink>}
        />
      </>
    );
  }

  const schema = buildFaqPageSchema(faqs);
  const json = schemaToString(schema);
  const checks = readinessChecks(site, faqs);
  const failing = checks.filter((c) => c.status === 'fail').length;
  const warning = checks.filter((c) => c.status === 'warn').length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard refused — the JSON is on screen and selectable.
    }
  }

  return (
    <>
      <PageHeader
        title="AEO"
        description="Your published answers, in the format Google and AI assistants read. This is what makes you quotable rather than just findable."
      />

      <div className="space-y-5">
        <Card className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg">Readiness</h2>
            <Badge tone={failing > 0 ? 'neutral' : warning > 0 ? 'cyan' : 'success'}>
              {failing > 0
                ? `${failing} to fix`
                : warning > 0
                  ? `${warning} to review`
                  : 'All clear'}
            </Badge>
          </div>

          <ul className="divide-line mt-4 divide-y">
            {checks.map((check) => (
              <li key={check.id} className="flex gap-3 py-3.5">
                <CheckMark status={check.status} />
                <div className="min-w-0">
                  <p className="text-navy text-[0.9375rem] font-semibold">
                    {check.label}
                    <span className="sr-only"> — {STATUS_WORD[check.status]}</span>
                  </p>
                  <p className="text-slate mt-0.5 text-sm leading-relaxed">{check.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg">FAQPage schema</h2>
              <p className="text-slate mt-1 text-sm">
                {schema.mainEntity.length} published{' '}
                {schema.mainEntity.length === 1 ? 'question' : 'questions'} · published on{' '}
                <span className="font-mono text-xs">{site.domain}</span> by the widget
              </p>
            </div>
            <button
              onClick={copy}
              className="text-primary hover:text-primary-hover text-sm font-medium transition-colors duration-150"
            >
              {copied ? 'Copied ✓' : 'Copy JSON-LD'}
            </button>
          </div>

          {schema.mainEntity.length === 0 ? (
            <p className="text-slate mt-4 text-sm">
              Nothing is published, so there&rsquo;s no schema to emit yet. Publish an answer on the
              FAQs page and it appears here.
            </p>
          ) : (
            /* Fixed height with its own scrollbar: this can run to hundreds of
               lines, and a page that grows without limit as FAQs are added
               makes everything below it unreachable. */
            <pre className="bg-navy mt-4 max-h-96 overflow-auto rounded-xl p-4">
              <code className="font-mono text-[0.75rem] leading-relaxed whitespace-pre text-white/90">
                {json}
              </code>
            </pre>
          )}
        </Card>

        <Card tone="cloud" className="p-5 sm:p-7">
          <p className="text-slate font-mono text-xs tracking-wide uppercase">Why this matters</p>
          <h3 className="mt-3 text-lg">Structure is what makes an answer quotable</h3>
          <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">
            An assistant reading your page has to work out which text is a question and which is the
            answer to it. This markup tells it outright, so a two-sentence answer can be lifted into
            a response with your name attached — which is the whole difference between being indexed
            and being quoted.
          </p>
        </Card>
      </div>
    </>
  );
}

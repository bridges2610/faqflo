'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { canRunFullAudit } from '@/lib/dashboard/plans';
import { timeAgo } from '@/lib/dashboard/format';
import { scoreBand } from '@/lib/audit/score';
import type { AuditResult, CheckStatus } from '@/lib/audit/types';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';
import { UpgradeCard } from './upgrade-card';

const STATUS_CHIP: Record<CheckStatus, string> = {
  pass: 'bg-success/12 text-success-ink',
  warn: 'bg-accent-soft text-teal-ink',
  fail: 'bg-error/12 text-error-ink',
  locked: 'bg-cloud text-slate border border-line',
};

const STATUS_WORD: Record<CheckStatus, string> = {
  pass: 'Pass',
  warn: 'Needs a look',
  fail: 'Problem',
  locked: 'Not checked',
};

function StatusIcon({ status }: { status: CheckStatus }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      {status === 'pass' && <polyline points="3 8.5 6.5 12 13 4.5" />}
      {status === 'warn' && <path d="M8 4v5M8 11.5h.01" />}
      {status === 'fail' && <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />}
      {status === 'locked' && (
        <>
          <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
          <path d="M5.8 7V5.6a2.2 2.2 0 0 1 4.4 0V7" />
        </>
      )}
    </svg>
  );
}

export function AuditWorkspace() {
  const { site } = useDashboard();
  const [result, setResult] = useState<AuditResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!site) {
    return (
      <>
        <PageHeader title="Audit" description="What AI can and can't see on your site." />
        <EmptyState
          title="Add a site first"
          body="The audit runs against a site's live pages, so there needs to be one."
          action={<ButtonLink href="/dashboard/sites">Go to sites</ButtonLink>}
        />
      </>
    );
  }

  const full = canRunFullAudit(site);
  const stored = site.lastAudit;

  async function run() {
    if (!site) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: site.domain }),
      });
      const data = (await res.json()) as AuditResult | { error: string };
      if (!res.ok || 'error' in data) {
        setError('error' in data ? data.error : 'That check failed.');
        return;
      }
      setResult(data);
    } catch {
      setError('Could not run the check. Try again.');
    } finally {
      setBusy(false);
    }
  }

  // The stored audit is the last full run; `result` is a fresh technical check
  // just triggered. Showing the fresh one when it exists keeps the page honest
  // about which numbers are current.
  const shown = result
    ? { score: result.score, checkedAt: result.checkedAt, checks: result.checks }
    : stored;
  const band = shown ? scoreBand(shown.score) : null;

  return (
    <>
      <PageHeader
        title="Audit"
        description={`What an AI crawler sees when it fetches ${site.domain}.`}
        action={
          <Button size="sm" variant="ghost" onClick={run} disabled={busy}>
            {busy ? 'Checking…' : 'Re-run technical checks'}
          </Button>
        }
      />

      <div className="space-y-5">
        {error && (
          <p role="alert" className="text-error-ink text-sm">
            {error}
          </p>
        )}

        {shown && band ? (
          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-display text-navy text-[2.5rem] leading-none font-extrabold tabular-nums">
                    {shown.score}
                  </span>
                  <span className="text-slate text-sm">out of 100</span>
                  <Badge tone={shown.score >= 85 ? 'success' : shown.score >= 60 ? 'cyan' : 'neutral'}>
                    {band.label}
                  </Badge>
                </div>
                <p className="text-slate mt-2 max-w-xl text-[0.9375rem] leading-relaxed">
                  {band.summary}
                </p>
              </div>
              <p className="text-slate text-xs">Checked {timeAgo(shown.checkedAt)}</p>
            </div>

            <ul className="divide-line border-line mt-6 divide-y border-t pt-2">
              {shown.checks.map((check) => (
                <li key={check.id} className="flex gap-3 py-3.5">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      STATUS_CHIP[check.status]
                    }`}
                  >
                    <StatusIcon status={check.status} />
                  </span>
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
        ) : (
          <EmptyState
            title="No audit yet"
            body="Run the technical checks to see whether your content is readable and whether the AI crawlers are allowed in."
            action={<Button onClick={run}>Run the checks</Button>}
          />
        )}

        {!full && (
          <UpgradeCard
            entitlement="get_cited"
            siteName={site.name}
            title="The full audit"
            body="The technical checks above are free and always will be. The full audit adds the expensive half: asking ChatGPT, Perplexity and Google AI Overviews what they actually say about your business today, and who they name instead of you."
          />
        )}
      </div>
    </>
  );
}

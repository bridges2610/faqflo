'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Underline } from '@/components/ui/doodle';
import { ScoreDial } from '@/components/ui/score-dial';
import { scoreBand } from '@/lib/audit/score';
import type { AuditReport, CheckStatus, Finding } from '@/lib/audit/types';

/*
  The lead hook: type an address, find out whether AI can read your site.

  Everything shown here was measured, except the citation row, which is drawn
  as locked and says why. That distinction is the whole credibility of the
  tool — a free checker that guesses is worth less than no checker.
*/

const STATUS_STYLES: Record<CheckStatus, { chip: string; word: string }> = {
  pass: { chip: 'bg-success/12 text-success-ink', word: 'Pass' },
  warn: { chip: 'bg-accent-soft text-teal-ink', word: 'Needs a look' },
  fail: { chip: 'bg-error/12 text-error-ink', word: 'Problem' },
  locked: { chip: 'bg-cloud text-slate border border-line', word: 'Not checked' },
  na: { chip: 'bg-cloud text-slate border border-line', word: 'Not applicable' },
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

/** The report groups findings by pillar; the teaser shows them as one list. */
function findingsOf(report: AuditReport): Finding[] {
  return report.pillars.flatMap((p) => p.findings);
}

function CheckRow({ check }: { check: Finding }) {
  const style = STATUS_STYLES[check.status];

  return (
    <li className="flex gap-3 py-3.5">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${style.chip}`}
      >
        <StatusIcon status={check.status} />
      </span>
      <div className="min-w-0">
        <p className="text-navy text-[0.9375rem] font-semibold">
          {check.label}
          <span className="sr-only"> — {style.word}</span>
        </p>
        <p className="text-slate mt-0.5 text-sm leading-relaxed">{check.detail}</p>
      </div>
    </li>
  );
}

export function VisibilityAudit() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditReport | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as AuditReport | { error: string };

      if (!res.ok || 'error' in data) {
        setError('error' in data ? data.error : 'That check failed. Try again.');
        setResult(null);
        return;
      }
      setResult(data);
    } catch {
      setError('Could not run the check. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const band = result ? scoreBand(result.score) : null;

  return (
    <section id="audit" className="scroll-mt-24 bg-white px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-4xl">
        <div className="mx-auto max-w-2xl text-center">
          <Badge tone="success">Free · No signup</Badge>
          <h2 className="mt-5 text-[2rem] text-balance sm:text-[2.5rem]">
            Can AI{' '}
            <span className="relative inline-block">
              read
              <Underline className="text-accent absolute -bottom-2 left-0 h-3.5 w-full" />
            </span>{' '}
            your site?
          </h2>
          <p className="text-slate mt-4 text-[1.0625rem] leading-relaxed">
            Enter your address. We&rsquo;ll fetch it the way an AI crawler does — no JavaScript —
            and tell you what it can and can&rsquo;t see.
          </p>
        </div>

        <form onSubmit={run} className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row">
          <label htmlFor="audit-url" className="sr-only">
            Your website address
          </label>
          <input
            id="audit-url"
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="yourbusiness.com"
            className="border-line bg-cloud text-navy focus:border-primary min-w-0 flex-1 rounded-input border px-4 py-3 text-[0.9375rem] outline-none transition-colors duration-150"
          />
          <Button type="submit" size="lg" disabled={busy || !url.trim()}>
            {busy ? 'Checking…' : 'Check my site'}
          </Button>
        </form>

        {error && (
          <p role="alert" className="text-error-ink mt-4 text-center text-sm">
            {error}
          </p>
        )}

        {result && band && (
          <Card className="mt-8 p-5 sm:p-7">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
              <ScoreDial score={result.score} />
              <div className="min-w-0 text-center sm:text-left">
                <p className="text-slate font-mono text-xs tracking-wide uppercase">
                  {result.domain}
                </p>
                <h3 className="mt-2 text-xl">{band.label}</h3>
                <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">{band.summary}</p>
                {/* Said plainly, next to the number: the locked row didn't drag
                    the score down. A score that quietly penalises what we chose
                    not to measure would be selling, not diagnosing. */}
                <p className="text-slate mt-3 text-xs leading-relaxed">
                  Scored on the {result.scoredCount} checks we ran. The citation check is part of
                  the full audit and isn&rsquo;t counted here either way.
                </p>
              </div>
            </div>

            <ul className="divide-line mt-6 divide-y border-t border-line pt-2">
              {findingsOf(result).map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}
            </ul>

            {/* Names what the paid audit adds, without pretending this was it. */}
            <p className="border-line text-slate mt-6 border-t pt-5 text-sm leading-relaxed">
              This is the quick check on one page. The full audit reads your other pages too —
              structure, titles, identity and trust — and turns what it finds into a ranked list of
              what to fix first.{' '}
              <a href="#pricing" className="text-primary hover:text-primary-hover font-semibold">
                See what it covers →
              </a>
            </p>

            {/*
              The domain they just scanned, carried into checkout.

              This is the step that makes buying one click instead of three:
              they have already typed their address, so asking again on the
              other side of sign-up is asking them to repeat themselves at the
              exact moment they are deciding whether to pay. encodeURIComponent
              because the value came from a text field, not from us.
            */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <ButtonLink
                href={`/dashboard/checkout/start?domain=${encodeURIComponent(result.domain)}`}
                size="md"
                arrow
              >
                Get {result.domain} set up
              </ButtonLink>
              <span className="text-slate text-xs">$129 once · includes 30 days full access</span>
            </div>
          </Card>
        )}
      </div>
    </section>
  );
}

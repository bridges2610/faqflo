'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Underline } from '@/components/ui/doodle';
import { ScoreDial } from '@/components/ui/score-dial';
import { Disclosure } from '@/components/ui/disclosure';
import { STATUS_CHIP, STATUS_WORD, StatusIcon } from '@/components/ui/status-icon';
import { scoreBand } from '@/lib/audit/score';
import type { AuditReport, Finding } from '@/lib/audit/types';

/*
  The lead hook: type an address, find out whether AI can read your site.

  Everything shown here was measured, except the citation row, which is drawn
  as locked and says why. That distinction is the whole credibility of the
  tool — a free checker that guesses is worth less than no checker.
*/

/* The chip, the word and the glyph moved to components/ui/status-icon.tsx when
   the free report needed a third copy of them. Two things changed with the
   move, both of them fixes: `warn` is amber rather than the brand cyan it
   shared with the Pro-lock chip, and its word is "Worth a look" — this file
   said "Needs a look" and the dashboard said "Worth a look", so one finding
   described itself two ways depending on whether the reader had signed up. */

/** The report groups findings by pillar; the teaser shows them as one list. */
function findingsOf(report: AuditReport): Finding[] {
  return report.pillars.flatMap((p) => p.findings);
}

function CheckRow({ check }: { check: Finding }) {
  return (
    <li className="flex gap-3 py-3.5">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${STATUS_CHIP[check.status]}`}
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

  /*
    Problems in full, passes behind a count, not-applicable dropped.

    ⚠️ `na` IS NOT A PROBLEM AND NOT A PASS, SO IT IS NEITHER. Its own type says
    "doesn't apply to this site, so counting it either way would be wrong", and
    the scorer already leaves it out of the denominator entirely. A first pass
    here filtered on `status !== 'pass'`, which put eight "not applicable" rows
    at the top of a stranger's first result — the loudest position on the page,
    spent on checks we deliberately did not count. plain.ts's isHiddenInSummary()
    draws the same line for the dashboard's plain view.

    ⚠️ THE LOCKED CITATION ROW DOES STAY WITH THE PROBLEMS. It is the one row
    selling the paid audit — "are you cited today?" — and hiding it behind
    "checks you already pass" would bury the pitch and imply we had checked and
    found nothing. It says out loud that it was not measured.
  */
  const all = result ? findingsOf(result) : [];
  const working = all.filter((f) => f.status === 'pass');
  const problems = all
    .filter((f) => f.status === 'fail' || f.status === 'warn' || f.status === 'locked')
    .sort((a, b) => (a.status === b.status ? b.weight - a.weight : a.status === 'fail' ? -1 : 1));

  /*
    No id and no scroll-mt on the section any more. Both existed so that
    /#audit could scroll to this band on the home page; it has its own URL now,
    so there is nothing to scroll to and nothing to offset under the sticky
    header.
  */
  return (
    <section className="bg-white px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-4xl">
        <div className="mx-auto max-w-2xl text-center">
          <Badge tone="success">Free · No signup</Badge>
          {/* ⚠️ AN <h1>, BECAUSE THIS IS A PAGE NOW.

              It was an <h2> while this was one band among ten on the home page,
              under the hero's h1. It renders at app/(marketing)/free-report and
              nowhere else, with nothing above it — so an h2 would leave that
              page with no top-level heading at all. Put this component back
              inside another page and this has to go back to an h2.

              "Can AI read your site?" moved to the home page hero, which now
              asks the question and starts the check. This names what the page
              hands back instead. */}
          <h1 className="mt-5 text-[2rem] text-balance sm:text-[2.5rem]">
            See what AI{' '}
            <span className="relative inline-block">
              sees
              <Underline className="text-accent absolute -bottom-2 left-0 h-3.5 w-full" />
            </span>{' '}
            on your site
          </h1>
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
          {/* The idle label names the thing you get; the pending one describes
              what is happening. "Free Report…" would read as a noun with an
              ellipsis stuck on it. */}
          <Button type="submit" size="lg" shape="pill" disabled={busy || !url.trim()}>
            {busy ? 'Checking…' : 'Free Report'}
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

            {/*
              ⚠️ SPLIT, BECAUSE THIS LIST GOT MUCH LONGER. A quick audit used to
              keep three findings; it now keeps everything one page can be
              asked, which is around twenty. Rendered flat that is a wall a
              stranger scrolls past — and the three or four rows that are
              actually wrong would be buried among the passes.

              Same shape audit-summary.tsx uses for the same reason: the
              problems in full, the passes behind a count. Worst first, fails
              before warnings, which is the order somebody should read them in.
            */}
            <ul className="divide-line border-line mt-6 divide-y border-t pt-2">
              {problems.map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}
            </ul>

            {working.length > 0 && (
              <Disclosure
                label={`Show the ${working.length} ${working.length === 1 ? 'check' : 'checks'} you already pass`}
                className="mt-4"
              >
                <ul className="divide-line divide-y">
                  {working.map((check) => (
                    <CheckRow key={check.id} check={check} />
                  ))}
                </ul>
              </Disclosure>
            )}

            {/* Names what the paid audit adds, without pretending this was it. */}
            <p className="border-line text-slate mt-6 border-t pt-5 text-sm leading-relaxed">
              This is the quick check on one page. The full audit reads your other pages too, and
              adds the two things a single page cannot answer — whether AI cites you today, and
              whether the web treats you as a real business. It turns what it finds into a ranked
              list of what to fix first.{' '}
              <a href="#pricing" className="text-primary hover:text-primary-hover font-semibold">
                See what it covers →
              </a>
            </p>

            {/*
              The domain they just scanned, carried into checkout.

              This is the step that makes signing up one click instead of three:
              they have already typed their address, so asking again on the
              other side of sign-up is asking them to repeat themselves at the
              exact moment they are deciding whether to bother.
              encodeURIComponent because the value came from a text field, not
              from us.

              ⚠️ /dashboard/start, not a checkout. Nothing is being sold here any
              more — the domain is carried into a FREE account's first scan, and
              the page is protected so a signed-out arrival gets sign-up first
              and lands back here automatically.
            */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <ButtonLink
                href={`/dashboard/start?domain=${encodeURIComponent(result.domain)}`}
                size="md"
                shape="pill"
                arrow
              >
                Check {result.domain} properly
              </ButtonLink>
              <span className="text-slate text-xs">Free · no card needed</span>
            </div>
          </Card>
        )}
      </div>
    </section>
  );
}

/**
 * Turning checks into a number.
 *
 * The one rule that matters: a `locked` check is excluded from the denominator
 * entirely. Scoring an unrun check as a failure would drag every free result
 * down and make the paid tier look necessary — which is a sales tactic wearing
 * a diagnostic's clothes. If we didn't measure it, it doesn't count against
 * anyone.
 */

import type { AuditCheck } from './types';

const CREDIT: Record<Exclude<AuditCheck['status'], 'locked'>, number> = {
  pass: 1,
  warn: 0.5,
  fail: 0,
};

export function scoreOf(checks: AuditCheck[]): number {
  const scored = checks.filter((c) => c.status !== 'locked');
  const total = scored.reduce((sum, c) => sum + c.weight, 0);
  if (total === 0) return 0;

  const earned = scored.reduce(
    (sum, c) => sum + c.weight * CREDIT[c.status as Exclude<AuditCheck['status'], 'locked'>],
    0,
  );

  return Math.round((earned / total) * 100);
}

/** Plain-language banding, so the number arrives with a meaning attached. */
export function scoreBand(score: number): { label: string; summary: string } {
  if (score >= 85) {
    return {
      label: 'Readable',
      summary: 'AI crawlers can reach and read this site. The next question is whether they quote it.',
    };
  }
  if (score >= 60) {
    return {
      label: 'Partly readable',
      summary: 'Some of what an answer engine needs is here, and some of it is missing.',
    };
  }
  if (score >= 30) {
    return {
      label: 'Hard to read',
      summary: 'An assistant reading this site would struggle to find a quotable answer.',
    };
  }
  return {
    label: 'Invisible',
    summary: 'As far as an AI crawler is concerned, there is very little here to quote.',
  };
}

/**
 * Turning findings into numbers.
 *
 * The rule that matters, applied at both levels: a `locked` or `na` finding
 * leaves the denominator entirely. Scoring something we didn't measure as a
 * failure would drag every result down and make the paid tier look necessary —
 * a sales tactic wearing a diagnostic's clothes. If we didn't measure it, it
 * doesn't count against anyone, and the UI says how many checks the number is
 * actually based on.
 */

import { PILLARS, type Finding, type PillarId, type PillarResult } from './types';

const CREDIT: Record<'pass' | 'warn' | 'fail', number> = { pass: 1, warn: 0.5, fail: 0 };

function scored(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.status !== 'locked' && f.status !== 'na');
}

/** 0–100 for one set of findings, or null when none of them counted. */
export function scoreOf(findings: Finding[]): number | null {
  const counted = scored(findings);
  const total = counted.reduce((sum, f) => sum + f.weight, 0);
  if (total === 0) return null;

  const earned = counted.reduce(
    (sum, f) => sum + f.weight * CREDIT[f.status as 'pass' | 'warn' | 'fail'],
    0,
  );
  return Math.round((earned / total) * 100);
}

export function buildPillars(findings: Finding[]): PillarResult[] {
  return PILLARS.map((pillar) => {
    const mine = findings.filter((f) => f.pillar === pillar.id);
    return {
      id: pillar.id,
      label: pillar.label,
      weight: pillar.weight,
      score: scoreOf(mine),
      findings: mine,
      scoredCount: scored(mine).length,
    };
  }).filter((p) => p.findings.length > 0);
}

/**
 * Overall score: the weighted mean of the pillars that produced one.
 *
 * A pillar with nothing scoreable (AI visibility while locked) drops out of the
 * weighting rather than counting as zero, so the overall stays a statement
 * about what was actually examined.
 */
export function overallScore(pillars: PillarResult[]): number {
  const counted = pillars.filter((p) => p.score !== null);
  const total = counted.reduce((sum, p) => sum + p.weight, 0);
  if (total === 0) return 0;

  const earned = counted.reduce((sum, p) => sum + p.weight * (p.score as number), 0);
  return Math.round(earned / total);
}

/**
 * What the overall score would become if these findings all passed.
 *
 * This is how an action item's "+N points" is derived rather than invented: fix
 * the finding in a copy of the data, re-run the same arithmetic, take the
 * difference.
 */
export function scoreIfFixed(findings: Finding[], fixIds: string[]): number {
  const fixed = findings.map((f) =>
    fixIds.includes(f.id) && (f.status === 'fail' || f.status === 'warn')
      ? { ...f, status: 'pass' as const }
      : f,
  );
  return overallScore(buildPillars(fixed));
}

/** Plain-language banding, so the number arrives with a meaning attached. */
export function scoreBand(score: number): { label: string; summary: string } {
  if (score >= 85) {
    return {
      label: 'Strong',
      summary:
        'The foundations are in place. What is left is depth — more questions answered, and more of them cited.',
    };
  }
  if (score >= 60) {
    return {
      label: 'Workable',
      summary: 'An assistant can read this site. It just has to work harder than it should to quote it.',
    };
  }
  if (score >= 30) {
    return {
      label: 'Hard to quote',
      summary: 'Enough is missing that an assistant reading this site would struggle to find a quotable answer.',
    };
  }
  return {
    label: 'Invisible',
    summary: 'As far as an AI crawler is concerned, there is very little here it can use.',
  };
}

export function pillarBand(score: number | null): 'good' | 'mixed' | 'poor' | 'none' {
  if (score === null) return 'none';
  if (score >= 80) return 'good';
  if (score >= 50) return 'mixed';
  return 'poor';
}

export function pillarWeight(id: PillarId): number {
  return PILLARS.find((p) => p.id === id)?.weight ?? 0;
}

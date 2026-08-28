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

/**
 * Evidence lines repeat far more than they used to.
 *
 * At five pages a duplicate was a curiosity; at a hundred it's the norm — the
 * same heading, the same missing tag, the same complaint over and over — and a
 * list showing one example four times is worse than useless, because it looks
 * like four findings. Deduped once here rather than at each of the forty places
 * a finding gets built.
 */
function dedupeEvidence(finding: Finding): Finding {
  if (!finding.evidence || finding.evidence.length < 2) return finding;
  const unique = [...new Set(finding.evidence)];
  return unique.length === finding.evidence.length ? finding : { ...finding, evidence: unique };
}

export function buildPillars(findings: Finding[]): PillarResult[] {
  return PILLARS.map((pillar) => {
    const mine = findings.filter((f) => f.pillar === pillar.id).map(dedupeEvidence);
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

/**
 * Plain-language banding, so the number arrives with a meaning attached.
 *
 * ⚠️ READ BY THREE SURFACES, ONE OF THEM A STRANGER'S FIRST IMPRESSION. The
 * free report, Pro's audit page, and the marketing teaser all print these, so a
 * word changed here changes all three — which is the point, not a hazard. They
 * had drifted out of the register lib/audit/plain.ts sets for exactly this
 * audience: "AI crawler" and "cited" are the vocabulary of the technical
 * report, and the Invisible summary is the sentence somebody reads about their
 * own site in the worst case.
 */
export function scoreBand(score: number): { label: string; summary: string } {
  if (score >= 85) {
    return {
      label: 'Strong',
      summary:
        'The foundations are in place. What is left is depth — more questions answered, and more of them quoted.',
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
    summary: 'As far as an AI assistant is concerned, there is very little here it can use.',
  };
}

export function pillarBand(score: number | null): 'good' | 'mixed' | 'poor' | 'none' {
  if (score === null) return 'none';
  if (score >= 80) return 'good';
  if (score >= 50) return 'mixed';
  return 'poor';
}

/**
 * Plain-language banding for how often AI names you.
 *
 * ⚠️ THIS BANDS A RATE, NOT A SCORE, AND THE DIFFERENCE IS THE WHOLE POINT.
 * scoreBand() above reads a weighted 0-100 built from findings. This reads a
 * plain ratio — questions where an engine named you, over questions we asked —
 * with both halves printed beside it wherever it is shown. Nothing is weighted,
 * modelled or combined, which is what keeps it from being the "second scoring
 * system that would disagree with the audit's" that
 * components/dashboard/tracking-workspace.tsx rules out.
 *
 * It lives here, beside the other two vocabularies, so all the banding this
 * product does is in one file and a fourth one is obviously a fourth one.
 *
 * ⚠️ THE THRESHOLDS ARE A JUDGEMENT, AND THE LABELS SAY ONLY WHAT THE RATIO
 * SAYS. "Emerging" describes how often you were named. It does not promise a
 * trend, predict anything, or claim a comparison against anybody else — there
 * is no benchmark data behind it and inventing one would be exactly the kind of
 * figure this product strips out of its own marketing.
 *
 * `tone` maps to Badge's tones. `dial` is the stroke for the ring, and both
 * always travel with the label — colour never carries this alone.
 */
export function namedBand(rate: number): {
  label: string;
  headline: string;
  tone: 'success' | 'cyan' | 'neutral';
  dial: string;
} {
  if (rate >= 60) {
    return {
      label: 'Established',
      headline: 'You are the answer more often than not',
      tone: 'success',
      dial: 'var(--color-success)',
    };
  }
  if (rate >= 30) {
    return {
      label: 'Emerging',
      headline: 'You are starting to show up',
      tone: 'cyan',
      dial: 'var(--color-accent)',
    };
  }
  if (rate > 0) {
    return {
      label: 'Barely there',
      headline: 'You are barely on the radar',
      tone: 'neutral',
      dial: 'var(--color-sky)',
    };
  }
  return {
    label: 'Not showing up',
    headline: 'AI is not naming you yet',
    tone: 'neutral',
    dial: 'var(--color-line)',
  };
}

export function pillarWeight(id: PillarId): number {
  return PILLARS.find((p) => p.id === id)?.weight ?? 0;
}

/**
 * AI-visibility audit — the free lead hook.
 *
 * The question the audit answers is narrow and literal: can the systems that
 * write AI answers actually read this site? Everything here is either measured
 * from the page itself or explicitly marked as not measured.
 */

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'locked';

export type AuditCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  /** One sentence a non-technical owner can act on. */
  detail: string;
  /**
   * Share of the score this check carries. A `locked` check keeps its weight
   * in the type but is excluded from the maths — see scoreOf().
   */
  weight: number;
};

export type AuditResult = {
  /** The URL as fetched, after redirects. */
  url: string;
  domain: string;
  /** 0–100 across the checks that actually ran. */
  score: number;
  checks: AuditCheck[];
  checkedAt: string;
};

/** Crawlers worth naming, in the order the report lists them. */
export const AI_CRAWLERS = [
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
  'PerplexityBot',
] as const;

export type AiCrawler = (typeof AI_CRAWLERS)[number];

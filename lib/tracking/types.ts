import 'server-only';

import type { Engine } from '@/lib/dashboard/types';

/*
  The one shape every engine adapter returns.

  The point of normalising here is that nothing downstream — the classifier, the
  route, the storage — ever learns which vendor produced a row. Perplexity
  returns citations as a first-class array, OpenAI hangs them off message
  annotations, and Gemini buries them in groundingMetadata; all three of those
  quirks stop at the edge of this module.
*/

/** What one engine said when asked one question. */
export type EngineAnswer = {
  engine: Engine;
  /** The answer text, as returned. Used for the name match and the excerpt. */
  text: string;
  /**
   * Every source the answer cited, as absolute URLs.
   *
   * ⚠️ ORDER IS THE ENGINE'S, AND IT MATTERS. When our customer is absent we
   * report the first of these as who was cited instead, and "first" means the
   * engine's own ranking rather than ours.
   */
  sources: string[];
};

/**
 * Why an engine produced nothing.
 *
 * Modelled rather than thrown because one engine failing is not a failed run:
 * asking three engines and hearing back from two is a partial answer worth
 * storing, and losing Perplexity's result because Gemini's key expired would be
 * a worse outcome than reporting the gap. The route records which engines
 * answered and says so.
 */
export type EngineFailure = {
  engine: Engine;
  reason: 'not-configured' | 'unauthorized' | 'rate-limited' | 'unreachable' | 'error';
  detail: string;
};

export type EngineResult =
  | { ok: true; answer: EngineAnswer }
  | { ok: false; failure: EngineFailure };

/**
 * Every adapter is this function, so the caller can hold them in a list.
 *
 * ⚠️ `country` is honoured by ChatGPT and Perplexity and IGNORED BY GEMINI —
 * not by choice, but because that API rejects a location outright. An adapter
 * accepting the argument is not a promise that it uses it; see the note at the
 * top of gemini.ts before assuming otherwise.
 */
export type EngineAdapter = (question: string, country?: string) => Promise<EngineResult>;

/** Per-call ceiling. An engine that hasn't answered by now costs us the run. */
export const ENGINE_TIMEOUT_MS = 25_000;

/*
  MAX_EXCERPT_CHARS moved to lib/dashboard/types.ts — the Results page needs it
  too, to tell a truncated excerpt from an engine that stopped talking, and this
  module is `server-only`. Re-exported so server-side callers here are unchanged.
*/
export { MAX_EXCERPT_CHARS } from '@/lib/dashboard/types';

/** Sources beyond this add storage without adding evidence. */
export const MAX_SOURCES = 20;

/**
 * Map an HTTP status onto the failure reasons above.
 *
 * Shared because all three vendors use the same status codes for the same
 * things, and three copies of this ladder would drift.
 */
export function classifyStatus(status: number): EngineFailure['reason'] {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'rate-limited';
  return 'error';
}

/** Turn a thrown fetch error into a failure, distinguishing a timeout. */
export function failureFromThrow(engine: Engine, err: unknown): EngineResult {
  const timedOut = err instanceof Error && err.name === 'TimeoutError';
  return {
    ok: false,
    failure: {
      engine,
      reason: 'unreachable',
      detail: timedOut ? 'Timed out' : err instanceof Error ? err.message : 'Unknown error',
    },
  };
}

/**
 * Keep only absolute http(s) URLs, de-duplicated, in the engine's order.
 *
 * Engines return relative fragments, `vertexaisearch` redirector links and the
 * occasional empty string. A malformed entry that reached the classifier would
 * silently never match anyone's domain, which looks exactly like "you were not
 * cited" — a wrong answer rather than a missing one.
 */
export function cleanSources(raw: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of raw) {
    if (typeof value !== 'string' || !value) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      const normalised = url.toString();
      if (seen.has(normalised)) continue;
      seen.add(normalised);
      out.push(normalised);
      if (out.length >= MAX_SOURCES) break;
    } catch {
      // Not a URL. Nothing to match a domain against, so nothing is lost.
    }
  }

  return out;
}

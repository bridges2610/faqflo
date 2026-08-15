import 'server-only';

import type { Engine } from '@/lib/dashboard/types';
import { classify, type Classified } from './classify';
import { askGemini } from './gemini';
import { askChatGpt } from './openai';
import { askPerplexity } from './perplexity';
import type { EngineAdapter, EngineFailure } from './types';

/*
  One question, every engine, in parallel.

  ⚠️ HOW BIG A SLICE CAN RUN IN ONE REQUEST IS THE CONSTRAINT THAT SHAPES THIS
  WHOLE FEATURE. A full period is 25 prompts × 3 engines = 75 search-backed
  calls, and this app self-imposes a ~60s ceiling (lib/audit/limits.ts) because
  that is roughly the platform's. `after()` does not help — it runs after the
  response but inside the same invocation, so it shares the ceiling. There is no
  queue in this project and adding one is a separate change.

  So a run is a bounded slice, repeated. The route reports what remains and the
  client asks again, the same way the crawler spends a page budget and says
  where it stopped rather than pretending it saw the whole site.
*/

/**
 * Questions per request.
 *
 * Five questions across three engines is fifteen concurrent outbound calls,
 * finishing in about the time the slowest single engine takes rather than the
 * sum. That leaves comfortable room under the ceiling even when one engine is
 * having a bad day and burns its full timeout.
 */
export const PROMPTS_PER_RUN = 5;

const ADAPTERS: Record<Engine, EngineAdapter> = {
  ChatGPT: askChatGpt,
  Perplexity: askPerplexity,
  Gemini: askGemini,
};

export type CheckOutcome = Classified & {
  question: string;
  engine: Engine;
  sources: string[];
};

export type RunResult = {
  outcomes: CheckOutcome[];
  /**
   * Engines that produced nothing, and why.
   *
   * ⚠️ Reported rather than thrown. One engine failing is not a failed run:
   * hearing back from two of three is a partial answer worth keeping, and
   * discarding Perplexity's result because Gemini's key expired would be the
   * worse outcome. The route surfaces this so the UI can say which engines
   * answered instead of quietly showing a low number.
   */
  failures: EngineFailure[];
};

/**
 * Ask every engine one question and classify each answer.
 *
 * Engines run concurrently and independently — `Promise.all` over adapters that
 * never reject, so a failure is a value rather than something that takes the
 * other two down with it.
 */
export async function checkQuestion(
  question: string,
  site: { domain: string; name: string },
): Promise<RunResult> {
  const engines = Object.keys(ADAPTERS) as Engine[];

  const results = await Promise.all(engines.map((engine) => ADAPTERS[engine](question)));

  const outcomes: CheckOutcome[] = [];
  const failures: EngineFailure[] = [];

  for (const result of results) {
    if (!result.ok) {
      failures.push(result.failure);
      continue;
    }

    const verdict = classify(result.answer, site);
    outcomes.push({
      ...verdict,
      question,
      engine: result.answer.engine,
      sources: result.answer.sources,
    });
  }

  return { outcomes, failures };
}

/**
 * A slice of questions, all engines each.
 *
 * Questions run concurrently too. The cap above is what keeps that from being
 * an unbounded fan-out at somebody else's rate limit — five questions is
 * fifteen calls, which every vendor here tolerates comfortably.
 */
export async function checkBatch(
  questions: string[],
  site: { domain: string; name: string },
): Promise<RunResult> {
  const runs = await Promise.all(questions.map((q) => checkQuestion(q, site)));

  return {
    outcomes: runs.flatMap((r) => r.outcomes),
    // De-duplicated: five questions failing on the same misconfigured engine is
    // one problem, and listing it five times would read as five.
    failures: dedupeFailures(runs.flatMap((r) => r.failures)),
  };
}

function dedupeFailures(failures: EngineFailure[]): EngineFailure[] {
  const seen = new Map<string, EngineFailure>();
  for (const failure of failures) {
    const key = `${failure.engine}:${failure.reason}`;
    if (!seen.has(key)) seen.set(key, failure);
  }
  return [...seen.values()];
}

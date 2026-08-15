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

  ⚠️ THE UNIT OF WORK IS A QUESTION × ENGINE PAIR, NOT A QUESTION. An engine can
  fail on its own — a 429 from one vendor while the other two answer — and the
  pair it missed is still owed. The route works out which pairs are outstanding
  and passes each question with only the engines it still needs, so pressing the
  button again fills the gap instead of re-asking, and re-billing, the engines
  that already answered.
*/

/**
 * Questions per request.
 *
 * Five questions across three engines is fifteen concurrent outbound calls,
 * finishing in about the time the slowest single engine takes rather than the
 * sum. That leaves comfortable room under the ceiling even when one engine is
 * having a bad day and burns its full timeout.
 *
 * Still counted in questions rather than pairs now that engines are selectable:
 * this bounds wall-clock, a question owed one engine costs less than one owed
 * three, and five-questions-worth remains the widest a slice can get.
 */
export const PROMPTS_PER_RUN = 5;

const ADAPTERS: Record<Engine, EngineAdapter> = {
  ChatGPT: askChatGpt,
  Perplexity: askPerplexity,
  Gemini: askGemini,
};

export const ALL_ENGINES = Object.keys(ADAPTERS) as Engine[];

/**
 * Minimum gap between the START of one Perplexity call and the next.
 *
 * ⚠️ PERPLEXITY ALLOWS ONE REQUEST AT A TIME. Not a guess — every response
 * carries `x-ratelimit-limit: 1` with `x-ratelimit-reset` one second out, and a
 * probe confirmed the shape: five sequential calls all returned 200, including
 * two back to back, while two calls merely in flight together return
 * `429 request_rate_limit_exceeded`. It is a concurrency limit wearing a rate
 * limit's name.
 *
 * ⚠️ SO DO NOT MAKE THESE PARALLEL AGAIN, AND DO NOT REACH FOR A SMALLER BATCH
 * INSTEAD. Shrinking PROMPTS_PER_RUN does nothing here: a smaller slice still
 * fires its Perplexity calls simultaneously. Spacing is the only thing that
 * works.
 *
 * Serialising alone is not quite enough either — observed calls returned in
 * 770–1450ms, so a fast one would let the next start inside the same second.
 * Hence a floor on the interval rather than just a width of one.
 *
 * Budget: a request asks at most PROMPTS_PER_RUN (5) questions, so ~5 Perplexity
 * calls at ~1.1s each is ~6s, with ChatGPT and Gemini still fully parallel
 * alongside. Comfortably inside the ~60s ceiling described above.
 */
const PERPLEXITY_MIN_INTERVAL_MS = 1_100;

/**
 * One call at a time, never closer together than `minIntervalMs`.
 *
 * Tasks queue onto a chain rather than racing, so ordering is arrival order and
 * only one is ever in flight. No dependency for this — it is a promise chain and
 * a timestamp.
 */
function createRateGate(minIntervalMs: number) {
  let chain: Promise<unknown> = Promise.resolve();
  let lastStart = 0;

  return function run<T>(task: () => Promise<T>): Promise<T> {
    const result = chain.then(async () => {
      const wait = lastStart + minIntervalMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastStart = Date.now();
      return task();
    });

    // The chain must never reject, or one failed engine call would poison every
    // call queued behind it. The caller still sees the real result.
    chain = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  };
}

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

/** One question and the engines still owed an answer for it. */
export type QuestionSlice = { question: string; engines: Engine[] };

/** Gate Perplexity through the shared limiter; let the others run free. */
function ask(
  engine: Engine,
  question: string,
  gate: <T>(task: () => Promise<T>) => Promise<T>,
) {
  const call = () => ADAPTERS[engine](question);
  return engine === 'Perplexity' ? gate(call) : call();
}

/**
 * Ask the given engines one question and classify each answer.
 *
 * Engines run concurrently and independently — `Promise.all` over adapters that
 * never reject, so a failure is a value rather than something that takes the
 * other two down with it.
 *
 * `engines` defaults to all three, so asking about a question nobody has covered
 * behaves exactly as it always did. The route narrows it to what is outstanding.
 * `gate` defaults to a limiter of its own, which is only right for a standalone
 * call — a batch passes one in, because a per-question limiter would not bound
 * anything across the questions running alongside it.
 */
export async function checkQuestion(
  question: string,
  site: { domain: string; name: string },
  engines: Engine[] = ALL_ENGINES,
  gate: <T>(task: () => Promise<T>) => Promise<T> = createRateGate(PERPLEXITY_MIN_INTERVAL_MS),
): Promise<RunResult> {
  const results = await Promise.all(engines.map((engine) => ask(engine, question, gate)));

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
 * A slice of questions, each asking only the engines it still needs.
 *
 * Questions run concurrently and `PROMPTS_PER_RUN` keeps that from being an
 * unbounded fan-out — except for Perplexity, which takes one call at a time.
 * Its gate is created once HERE and shared by every question in the batch: a
 * per-question gate would serialise nothing, because the collisions are between
 * the questions running alongside each other.
 */
export async function checkBatch(
  items: QuestionSlice[],
  site: { domain: string; name: string },
): Promise<RunResult> {
  const gate = createRateGate(PERPLEXITY_MIN_INTERVAL_MS);

  const runs = await Promise.all(
    items.map((item) => checkQuestion(item.question, site, item.engines, gate)),
  );

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

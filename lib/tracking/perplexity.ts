import 'server-only';

import {
  classifyStatus,
  cleanSources,
  ENGINE_TIMEOUT_MS,
  failureFromThrow,
  type EngineResult,
} from './types';

/*
  Perplexity, via the Sonar API.

  The cleanest of the three: search is what the model is for, so every answer
  comes back with a `search_results` array and there is no tool to enable or
  grounding block to dig through.

  `fetch` rather than a package, following lib/email/client.ts. The whole
  contract is one POST and two fields of the response; a dependency for that
  would be the ninth in a project that has chosen eight, one at a time.
*/

const ENDPOINT = 'https://api.perplexity.ai/chat/completions';

/**
 * The smallest search-backed model.
 *
 * We are not asking it to reason — we are asking what it says and who it cites,
 * which is a retrieval question. A larger model would cost more per check
 * without changing the source list, and the source list is the measurement.
 */
const MODEL = 'sonar';

export async function askPerplexity(question: string): Promise<EngineResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey || apiKey.startsWith('pplx-your-')) {
    return {
      ok: false,
      failure: {
        engine: 'Perplexity',
        reason: 'not-configured',
        detail: 'PERPLEXITY_API_KEY is not set.',
      },
    };
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        // No system prompt, deliberately. We are measuring what someone asking
        // this question would be told; steering the answer toward or away from
        // any business would make the number we report our own doing.
        messages: [{ role: 'user', content: question }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        failure: {
          engine: 'Perplexity',
          reason: classifyStatus(res.status),
          detail: `HTTP ${res.status}: ${body.slice(0, 200)}`,
        },
      };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      // Newer responses carry `search_results`; older ones a flat `citations`
      // array of URL strings. Both are read so a rollout can't blank the
      // sources — and empty sources classify as "not cited", which would be a
      // wrong answer rather than a missing one.
      search_results?: { url?: string }[];
      citations?: string[];
    };

    const text = data.choices?.[0]?.message?.content ?? '';
    const urls = data.search_results?.length
      ? data.search_results.map((r) => r.url)
      : (data.citations ?? []);

    return {
      ok: true,
      answer: { engine: 'Perplexity', text, sources: cleanSources(urls) },
    };
  } catch (err) {
    return failureFromThrow('Perplexity', err);
  }
}

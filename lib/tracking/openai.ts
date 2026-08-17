import 'server-only';

import {
  classifyStatus,
  cleanSources,
  ENGINE_TIMEOUT_MS,
  failureFromThrow,
  type EngineResult,
} from './types';

/*
  ChatGPT, via the OpenAI Responses API with its web search tool.

  ⚠️ THIS IS THE API, NOT chatgpt.com, AND THE DIFFERENCE IS REAL. No system
  prompt of theirs, no memory, no personalisation, and a retrieval stack that
  need not match the consumer product's. It is the closest thing to "what would
  ChatGPT say about this business" that can be measured at all, which is why it
  is worth measuring — but the UI says which it is, and so does ENGINES in
  lib/dashboard/types.ts.

  Sources arrive as `url_citation` annotations hanging off the output text
  rather than as a list, so they have to be walked out of the content blocks.
*/

const ENDPOINT = 'https://api.openai.com/v1/responses';

/** Small and search-backed: we want the retrieval, not the reasoning. */
const MODEL = 'gpt-4.1-mini';

type OutputBlock = {
  type?: string;
  content?: {
    type?: string;
    text?: string;
    annotations?: { type?: string; url?: string }[];
  }[];
};

export async function askChatGpt(question: string, country?: string): Promise<EngineResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.startsWith('sk-your-')) {
    return {
      ok: false,
      failure: {
        engine: 'ChatGPT',
        reason: 'not-configured',
        detail: 'OPENAI_API_KEY is not set.',
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
        input: question,
        // Without this the model answers from training data and cites nobody,
        // which would record every customer as uncited on every run.
        //
        // ⚠️ `user_location` genuinely changes the answer, so it is not
        // decoration: asked as GB this returns .co.uk roofing directories and
        // as US it returns US ones, with ZERO overlap between the two source
        // lists. Omitted when the customer has not set a country, which leaves
        // the vendor's own default — the behaviour every check before this had.
        tools: [
          {
            type: 'web_search',
            ...(country ? { user_location: { type: 'approximate', country } } : {}),
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        failure: {
          engine: 'ChatGPT',
          reason: classifyStatus(res.status),
          detail: `HTTP ${res.status}: ${body.slice(0, 200)}`,
        },
      };
    }

    const data = (await res.json()) as { output?: OutputBlock[]; output_text?: string };

    /*
      Walk the output for text and annotations in one pass.

      `output_text` is a convenience field the SDK synthesises and the raw API
      does not always send, so it is a fallback rather than the source of truth
      — and it carries no annotations at all, which are the half we actually
      need.
    */
    const parts: string[] = [];
    const urls: string[] = [];

    for (const block of data.output ?? []) {
      for (const item of block.content ?? []) {
        if (typeof item.text === 'string') parts.push(item.text);
        for (const note of item.annotations ?? []) {
          if (note.type === 'url_citation' && note.url) urls.push(note.url);
        }
      }
    }

    const text = parts.join('\n').trim() || (data.output_text ?? '');

    return {
      ok: true,
      answer: { engine: 'ChatGPT', text, sources: cleanSources(urls) },
    };
  } catch (err) {
    return failureFromThrow('ChatGPT', err);
  }
}

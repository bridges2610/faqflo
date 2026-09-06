import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { SUMMARY_MAX_WORDS } from '@/lib/dashboard/summary';

/*
  The model call behind the help panel.

  ⚠️ server-only, AND ITS PROMPT IS NOT IN HERE. lib/dashboard/summary.ts holds
  the registry, the fact builders and buildSummaryPrompt(), because the browser
  builds the facts and the server sends them — the same split
  lib/questions.ts / lib/questions-generate.ts draws, for the reason that file
  states: a module a workspace imports must never be able to pull the Anthropic
  SDK into the browser bundle.

  ⚠️ THIS IS THE FIRST CALL IN THE APP THAT ASKS FOR PROSE RATHER THAN A JSON
  SCHEMA, and that makes streaming SIMPLER here than it is for an article. The
  article route streams half-written JSON and needs completedStrings() to pull
  finished values out of it (lib/article.ts:214). A paragraph is already the
  thing being read, so a text_delta goes straight to the client.
*/

/*
  ⚠️ SONNET, PER THE TAXONOMY ALREADY WRITTEN DOWN. app/api/dashboard/article/
  route.ts:37-49 sets it out: transcription is Haiku's, prose about a real
  business is Sonnet's, judgment and strategy are Opus's. This is a short piece
  of prose about a real business, and it is read by the customer as if a person
  wrote it — Haiku's summaries of the same numbers came back flatter and more
  willing to pad. Opus would be paying strategy prices to describe a screen.
*/
const MODEL = 'claude-sonnet-5';

/*
  Headroom over what a summary actually costs, measured rather than guessed.

  ⚠️ IT WAS 700 AND THAT WAS NOT ENOUGH. Sampled across all five screens on a
  real account: 210-255 output tokens typically, but the AI Mentions screen came
  back at 520 on one run and 238 on the next from an identical prompt. The
  spread is the model's, not the input's — and at 700 the long tail of that
  spread hit the ceiling, which a customer saw as "That summary came back too
  long to finish."

  1500 is roughly three times the worst run observed. It costs nothing to raise:
  nobody is billed for tokens the model does not write, and the word limit is
  enforced by the prompt, which is where a length rule belongs.
*/
const MAX_TOKENS = 1500;

/** Shortest salvage worth showing, in characters — about one line of prose. */
const MIN_SALVAGE = 40;

/**
 * The text up to its last finished sentence.
 *
 * ⚠️ FOR SALVAGE, NOT FOR TIDINESS. A response that hits the token ceiling has
 * already been written and already been paid for — and a free account has
 * already been charged one of three. Throwing all of it away to show an error
 * is the most expensive possible response to "it ran slightly long", so if what
 * arrived ends in a complete sentence's worth of prose, that is what the reader
 * gets.
 *
 * Returns null when there is no sentence boundary at all, which means the cut
 * landed inside the opening sentence. There is nothing to salvage there, and a
 * dangling fragment presented as a summary would be worse than saying so.
 *
 * Exported only so the boundary cases can be tested directly — an off-by-one
 * here either discards summaries that were fine or shows a fragment as if it
 * were finished, and neither is visible from the outside.
 */
export function toLastSentence(text: string): string | null {
  /* ⚠️ ONE lastIndexOf, NOT THREE. This looked for '. ', '.\n' and '.' and took
     the greatest — but a bare '.' matches wherever the other two do, so the
     first two could never win and only made the rule look more careful than it
     was. Paragraph breaks are covered because the full stop before them is a
     full stop like any other. */
  const end = text.lastIndexOf('.');

  /* ⚠️ AND WHAT SURVIVES HAS TO BE WORTH SHOWING. A cut that lands after one
     short opening line leaves a sentence, not a summary — "Here's where you
     stand today." is true, useless, and would be handed over as if it were the
     answer. MIN_SALVAGE is about a line of prose. */
  if (end < MIN_SALVAGE) return null;
  return text.slice(0, end + 1).trim();
}

export type SummaryStreamResult =
  /** Refusals decided before any work starts stay plain JSON — see the route. */
  | { ok: false; error: string; status: number }
  | { ok: true; stream: ReadableStream<Uint8Array> };

/**
 * Stream one page summary as NDJSON.
 *
 * Frames are `{type:'text', text}` per delta and `{type:'done'}` at the end, or
 * `{type:'error', error}` if the model call falls over after the stream has
 * opened. `onComplete` receives the finished text so the caller can store it —
 * it runs inside the stream, after `finalMessage()`, and only on success.
 */
export function streamSummary(input: {
  prompt: string;
  /** Summaries left after this one. Null for Pro — never a fabricated ceiling. */
  left: number | null;
  onComplete?: (text: string) => Promise<void>;
}): SummaryStreamResult {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  /* Same guard as every other generator: an unset or placeholder key is a
     deployment mistake, not a customer error, so it never reaches the model. */
  if (!apiKey || apiKey === 'sk-ant-your-key-here') {
    return {
      ok: false,
      status: 500,
      error: 'The summary service is not configured. Please try again later.',
      };
  }

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));

      try {
        const modelStream = client.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          messages: [{ role: 'user', content: input.prompt }],
        });

        for await (const event of modelStream) {
          if (event.type !== 'content_block_delta' || event.delta.type !== 'text_delta') {
            continue;
          }
          send({ type: 'text', text: event.delta.text });
        }

        const message = await modelStream.finalMessage();

        /* ⚠️ stop_reason IS CHECKED BEFORE THE TEXT IS TRUSTED, the same order
           lib/content-generate.ts:138-147 uses. A refusal still has content. */
        if (message.stop_reason === 'refusal') {
          send({ type: 'error', error: 'Claude declined to summarise this page.' });
          return;
        }
        const raw = message.content.find((block) => block.type === 'text')?.text?.trim();

        /*
          ⚠️ A LONG SUMMARY IS SALVAGED, NOT REFUSED. This used to return an
          error the moment stop_reason was max_tokens, which discarded a
          complete-looking summary the customer had already paid for — and on a
          free account, one of three. Trimming to the last finished sentence
          keeps everything that was actually written and drops only the half
          sentence the ceiling cut through.

          Nothing is invented by doing this: every word shown came from the
          model. Only when the cut landed inside the first sentence is there
          genuinely nothing to show.
        */
        const text =
          message.stop_reason === 'max_tokens' && raw ? toLastSentence(raw) : (raw ?? null);

        if (!text) {
          send({
            type: 'error',
            error:
              message.stop_reason === 'max_tokens'
                ? 'That summary came back too long to finish. Please try again.'
                : 'That summary came back empty. Please try again.',
          });
          return;
        }

        /*
          ⚠️ STORED BEFORE 'done' IS SENT, so a panel that shows the text has
          always had it saved. The other order would let a customer read a
          summary, reload, and find their allowance spent on something that was
          never written down.

          A failed write is logged and swallowed rather than turned into an
          error frame: they are looking at the finished summary. Telling them it
          failed, when the only casualty is that the next visit rewrites it,
          would be reporting our problem as their failure.
        */
        if (input.onComplete) {
          try {
            await input.onComplete(text);
          } catch (err) {
            console.error('Could not store page summary:', err);
          }
        }

        send({ type: 'done', left: input.left, replayed: false });
      } catch (err) {
        /*
          ⚠️ THE TAXONOMY COLLAPSES TO ONE MESSAGE HERE, AND ONLY HERE. Once the
          stream is open there is no status code left to send — the 200 went out
          with the headers — so the distinctions the other generators draw
          (AuthenticationError → 500, RateLimitError → 429) have nowhere to go.
          The console keeps the real one; the customer gets a sentence that is
          true whichever it was.
        */
        console.error('Summary stream failed:', err);
        send({ type: 'error', error: 'Something went wrong writing that. Please try again.' });
      } finally {
        controller.close();
      }
    },
  });

  return { ok: true, stream };
}

/**
 * Hand back a summary that was already written, in the same frames a fresh one
 * arrives in.
 *
 * ⚠️ ONE SUCCESS SHAPE, AND THAT IS WHY THIS EXISTS RATHER THAN A JSON REPLY.
 * app/api/dashboard/article/route.ts:291-295 makes the case for its own split:
 * "a client that has to parse two shapes for 'no' is a client that will get one
 * wrong." The same holds for yes. Refusals stay plain JSON; every success —
 * stored or just written — arrives as NDJSON.
 *
 * ⚠️ SENT AS ONE FRAME, NOT DRIPPED OUT. The panel reveals a replay instantly
 * because nothing is being written: staging it word by word would be a
 * typewriter pretending to be a model, which is the thing
 * components/dashboard/writing-progress.tsx exists to forbid.
 */
export function replayStream(text: string, left: number | null): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      /* ⚠️ `instant` IS AN INSTRUCTION TO THE PANEL, NOT A DESCRIPTION. It tells
         the client not to pace this text out: nothing is being written, so a
         staged reveal would be a typewriter imitating a model. See the reveal
         buffer in components/dashboard/help-bubble.tsx. */
      send({ type: 'text', text, instant: true });
      send({ type: 'done', left, replayed: true });
      controller.close();
    },
  });
}

/** Headers for the NDJSON response. Kept beside the producer so the two agree. */
export const SUMMARY_STREAM_HEADERS = {
  'Content-Type': 'application/x-ndjson; charset=utf-8',
  'Cache-Control': 'no-store',
  /* Proxies that buffer would hold every word back until the summary finished,
     which is the whole thing this mode exists to avoid. */
  'X-Accel-Buffering': 'no',
} as const;

/* Re-exported so a caller sizing a textarea or a skeleton does not have to
   import the client-safe module as well. */
export { SUMMARY_MAX_WORDS };

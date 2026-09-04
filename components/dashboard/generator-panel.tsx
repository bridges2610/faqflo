'use client';

import { useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { LockIcon } from './nav-icons';
import { Card } from '@/components/ui/card';
import {
  LANGUAGES,
  MAX_FAQ_COUNT,
  MAX_FAQ_COUNT_PRO,
  DEFAULT_FAQ_COUNT_PRO,
  MIN_FAQ_COUNT,
  TONES,
  type Faq,
  type Language,
  type Tone,
} from '@/lib/faq';
import { useDashboard } from '@/lib/dashboard/provider';
import { FREE_GENERATED_FAQ_SET_CAP, isPro } from '@/lib/dashboard/plans';
import { SectionTitle } from './section-title';

/*
  The dashboard generator.

  Same two inputs as the homepage tool — paste text or hand it a URL — but it
  posts to /api/dashboard/generate, which allows more questions per run. The
  result isn't saved directly: it goes to the caller as a set of candidates for
  review, because a paid dashboard shouldn't silently append twelve unreviewed
  answers to a live site.
*/

type Mode = 'text' | 'url';

/*
  How many answers this account may ask for in one go.

  ⚠️ THE DROPDOWN MUST NOT OFFER WHAT THE SERVER WILL CLAMP. Free is capped at
  MAX_FAQ_COUNT per call in app/api/dashboard/generate/route.ts, so a fixed
  1–12 list would let a free user choose twelve, receive five, and have nothing
  on screen explain the difference.

  ⚠️ THIS COMMENT USED TO CLAIM "generation is open to every plan now", AND THE
  SERVER NEVER AGREED. app/api/dashboard/generate/route.ts refuses a free
  account outright — `if (!canGenerate(user)) fail('Writing answers is part of
  Pro.', 403)` — so the panel was describing a policy that did not exist, and a
  free account clicking Generate got exactly the failure the paragraph above
  says this file was rewritten to remove. It stayed invisible only because free
  could not navigate here.

  Both halves now say the same thing: free sees the panel and what it produces,
  and the control is a lock rather than a button that 403s. The ceiling below
  still matters for Pro, where the dropdown must not offer more than the server
  will return.
*/
function countsFor(pro: boolean): number[] {
  const max = pro ? MAX_FAQ_COUNT_PRO : MAX_FAQ_COUNT;
  return Array.from({ length: max - MIN_FAQ_COUNT + 1 }, (_, i) => MIN_FAQ_COUNT + i);
}

/**
 * What a run was, beyond the answers themselves.
 *
 * `topic` is the model's own name for the set — "Roof replacement costs". It is
 * stored on every answer in the batch, which is what lets the Answers list show
 * one row per topic instead of a flat pile. Empty when the model returned
 * nothing usable; the list buckets those separately rather than showing a blank
 * row.
 */
export type GenerationMeta = { tone: Tone; language: Language; topic: string };

export function GeneratorPanel({
  onGenerated,
  disabled = false,
}: {
  onGenerated: (faqs: Faq[], meta: GenerationMeta) => void;
  disabled?: boolean;
}) {
  const { site, user } = useDashboard();
  const pro = isPro(user);

  /*
    ⚠️ WHAT IS LEFT, NOT WHETHER THEY MAY. Free writes
    FREE_GENERATED_FAQ_SET_CAP sets in this tab, ever, so the question changed
    from "is this account Pro" to "is there a set left". The count is read off
    the profile row, which the owner may SELECT and nobody but the service role
    may UPDATE (0021) — showable without being worth forging.

    ⚠️ SETS, NOT ANSWERS, AND THAT IS WHY THE COUNT PICKER IS UNTOUCHED BELOW.
    An earlier version counted answers, which forced this to filter the dropdown
    to what remained and left a 2-answer remainder that no run could spend —
    clampCount()'s floor turns a request for 2 into the maximum. Counting runs
    means every set may be as large as the plan allows.
  */
  const setsLeft = pro
    ? Number.POSITIVE_INFINITY
    : Math.max(0, FREE_GENERATED_FAQ_SET_CAP - (user?.freeFaqSetsUsed ?? 0));

  const counts = countsFor(pro);
  const spent = setsLeft === 0;

  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  /* Clamped for the same reason the list is: the Pro default is above free's
     ceiling, and an initial value the dropdown cannot show would submit a
     number the server then quietly reduces. */
  /* ⚠️ counts IS EMPTY WHEN THE ALLOWANCE IS SPENT, and Math.min(n, undefined)
     is NaN — which is precisely the "initial value the dropdown cannot show"
     the note above warns about, arriving by a different route. The fallback is
     never submitted (the control is a lock by then); it exists so the state is
     a number whatever happens. */
  const [count, setCount] = useState<number>(
    Math.min(DEFAULT_FAQ_COUNT_PRO, counts[counts.length - 1]),
  );
  const [tone, setTone] = useState<Tone>('Professional');
  const [language, setLanguage] = useState<Language>('English');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);

    let content = text.trim();

    if (mode === 'url') {
      if (!url.trim()) {
        setError('Add the address of a page to read.');
        return;
      }
      setBusy(true);
      try {
        const res = await fetch('/api/fetch-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim() }),
        });
        const data = (await res.json()) as { content?: string; error?: string };
        if (!res.ok || !data.content) {
          setError(data.error ?? 'Could not read that page.');
          setBusy(false);
          return;
        }
        content = data.content;
      } catch {
        setError('Could not reach that page. Check the address and try again.');
        setBusy(false);
        return;
      }
    } else if (content.length < 40) {
      setError('Add a bit more — a paragraph or two gives it something to work with.');
      return;
    }

    setBusy(true);
    try {
      /* siteId comes from context rather than a prop, for the same reason
         UpgradeCard reads it there: this panel already renders inside the
         selected site's workspace, and the server needs it to check the
         entitlement. A prop would be one more chance to pass the wrong one. */
      const res = await fetch('/api/dashboard/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, count, tone, language, siteId: site?.id }),
      });
      const data = (await res.json()) as { faqs?: Faq[]; topic?: string; error?: string };
      if (!res.ok || !data.faqs) {
        setError(data.error ?? 'Generation failed. Please try again.');
        return;
      }
      onGenerated(data.faqs, { tone, language, topic: data.topic ?? '' });
    } catch {
      setError('Could not reach the generator. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle>Generate FAQs</SectionTitle>

        {/* Same segmented control as the homepage generator and the pricing
            billing toggle — one input-switching idiom across the product. */}
        <div
          className="bg-cloud border-line inline-flex items-center gap-1 rounded-full border p-1"
          role="group"
          aria-label="Source"
        >
          {(['text', 'url'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`flex min-h-11 items-center rounded-full px-4 py-1.5 text-sm transition-all duration-200 sm:min-h-0 ${
                mode === m
                  ? 'text-navy shadow-soft bg-white font-semibold'
                  : 'text-slate hover:text-navy'
              }`}
            >
              {m === 'text' ? 'Describe it' : 'Use a URL'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {mode === 'text' ? (
          <>
            <label htmlFor="gen-text" className="sr-only">
              What this page is about
            </label>
            <textarea
              id="gen-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Describe what you do, or paste the page you want FAQs for — an about page, a service page, a product description…"
              className="border-line bg-cloud text-navy focus:border-primary w-full resize-y rounded-input border p-4 text-[0.9375rem] leading-relaxed outline-none transition-colors duration-150"
            />
            <p className="text-slate mt-2 text-xs">Around 200 words or more works best.</p>
          </>
        ) : (
          <>
            <label htmlFor="gen-url" className="sr-only">
              Page address
            </label>
            <input
              id="gen-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yoursite.com/services"
              className="border-line bg-cloud text-navy focus:border-primary w-full rounded-input border p-4 text-[0.9375rem] outline-none transition-colors duration-150"
            />
            <p className="text-slate mt-2 text-xs">
              We&rsquo;ll read the page and write questions from what&rsquo;s on it.
            </p>
          </>
        )}
      </div>

      {/* All four controls in one grid. They carry equal weight, so laying the
          destination out differently from the other three made it read as a
          separate kind of thing. */}
      {/* ⚠️ THREE COLUMNS, NOT FOUR. This was sm:grid-cols-2 lg:grid-cols-4 when
          the panel had a fourth control — "Add to" — and it has been leaving a
          hole at the end of the row ever since that one was removed. */}
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {/* ⚠️ NO "ADD TO" SELECT, AND ITS OWN OLD COMMENT ARGUED FOR ONE. It
            said "where it lands is chosen before generating, not after",
            because an answer's page decides where it may claim to live. That
            is still true — the choice just moved to where somebody actually
            knows the answer. Each run now makes its own set, and the page it
            goes on is asked for when it is pasted. See SetPublish. */}

        <label className="block">
          <span className="text-slate font-mono text-xs tracking-wide uppercase sm:text-[0.6875rem]">
            How many
          </span>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="border-line text-navy focus:border-primary mt-1.5 min-h-11 w-full rounded-input border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150 sm:min-h-0"
          >
            {counts.map((n) => (
              <option key={n} value={n}>
                {n} questions
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-slate font-mono text-xs tracking-wide uppercase sm:text-[0.6875rem]">
            Tone
          </span>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as Tone)}
            className="border-line text-navy focus:border-primary mt-1.5 min-h-11 w-full rounded-input border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150 sm:min-h-0"
          >
            {TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-slate font-mono text-xs tracking-wide uppercase sm:text-[0.6875rem]">
            Language
          </span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="border-line text-navy focus:border-primary mt-1.5 min-h-11 w-full rounded-input border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150 sm:min-h-0"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        {/* ⚠️ LOCKED IS NOT DISABLED. A greyed-out Generate would make a free
            account hunt for why; a lock that names the plan and links to it
            answers the question in the control itself. The form above stays
            live and fillable on purpose — seeing what you would be asking for
            is the taste, and nothing is spent until this is pressed. */}
        {/* ⚠️ THE LOCK IS NOW ABOUT THE ALLOWANCE, NOT THE PLAN. It used to read
            "Writing needs Pro" for every free account; free writes now, and what
            runs out is the allowance. LOCKED IS NOT DISABLED either way — the
            control says what it needs and goes somewhere.

            ⚠️ SHORT LABEL, BECAUSE BUTTON LABELS DO NOT WRAP. BASE sets
            whitespace-nowrap; "Writing answers is part of Pro" measured 286px
            and pushed a 320px page sideways. */}
        {spent ? (
          <ButtonLink href="/dashboard/plan" variant="ghost">
            <LockIcon className="h-4 w-4" />
            Get more with Pro
          </ButtonLink>
        ) : (
          <Button onClick={generate} disabled={busy || disabled}>
            {busy ? 'Writing…' : 'Generate'}
          </Button>
        )}
        {error && (
          <p role="alert" className="text-error-ink text-sm">
            {error}
          </p>
        )}

        {/* ⚠️ FREE ONLY, AND IT COUNTS ANSWERS RATHER THAN RUNS. Pro has no
            answer allowance, so there is no number to show it — and printing
            one would be a limit nothing enforces. */}
        {!pro && (
          <p className="text-slate text-sm">
            {spent
              ? `You've used all ${FREE_GENERATED_FAQ_SET_CAP} sets on the free plan.`
              : `${setsLeft} of ${FREE_GENERATED_FAQ_SET_CAP} free sets left. Each one writes up to ${counts[counts.length - 1]} answers.`}
          </p>
        )}
      </div>
    </Card>
  );
}

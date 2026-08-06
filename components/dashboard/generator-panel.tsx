'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  LANGUAGES,
  MAX_FAQ_COUNT_PAID,
  DEFAULT_FAQ_COUNT_PAID,
  MIN_FAQ_COUNT,
  TONES,
  type Faq,
  type Language,
  type Tone,
} from '@/lib/faq';
import type { FaqGroup } from '@/lib/dashboard/types';

/*
  The dashboard generator.

  Same two inputs as the homepage tool — paste text or hand it a URL — but it
  posts to /api/dashboard/generate, which allows more questions per run. The
  result isn't saved directly: it goes to the caller as a set of candidates for
  review, because a paid dashboard shouldn't silently append twelve unreviewed
  answers to a live site.
*/

type Mode = 'text' | 'url';

const COUNTS = Array.from(
  { length: MAX_FAQ_COUNT_PAID - MIN_FAQ_COUNT + 1 },
  (_, i) => MIN_FAQ_COUNT + i,
);

export type GenerationMeta = { tone: Tone; language: Language };

export function GeneratorPanel({
  onGenerated,
  groups,
  targetGroupId,
  onTargetChange,
  disabled = false,
}: {
  onGenerated: (faqs: Faq[], meta: GenerationMeta) => void;
  /** Where the generated set will land. */
  groups: FaqGroup[];
  targetGroupId: string | null;
  onTargetChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [count, setCount] = useState<number>(DEFAULT_FAQ_COUNT_PAID);
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
      const res = await fetch('/api/dashboard/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, count, tone, language }),
      });
      const data = (await res.json()) as { faqs?: Faq[]; error?: string };
      if (!res.ok || !data.faqs) {
        setError(data.error ?? 'Generation failed. Please try again.');
        return;
      }
      onGenerated(data.faqs, { tone, language });
    } catch {
      setError('Could not reach the generator. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg">Generate FAQs</h2>

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
              className={`rounded-full px-4 py-1.5 text-sm transition-all duration-200 ${
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
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Where it lands is chosen before generating, not after: the group
            decides which page these answers get pasted onto. With one group
            there's nothing to choose, and a one-option select is a control that
            does nothing — so it states the destination instead. */}
        {groups.length > 1 ? (
          <label className="block">
            <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
              Add to
            </span>
            <select
              value={targetGroupId ?? ''}
              onChange={(e) => onTargetChange(e.target.value)}
              className="border-line text-navy focus:border-primary mt-1.5 w-full truncate rounded-input border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {g.path}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="block">
            <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
              Add to
            </span>
            <p className="text-navy border-line mt-1.5 truncate rounded-input border border-dashed px-3 py-2 text-sm">
              {groups[0]?.name ?? '—'}
            </p>
          </div>
        )}

        <label className="block">
          <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
            How many
          </span>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150"
          >
            {COUNTS.map((n) => (
              <option key={n} value={n}>
                {n} questions
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
            Tone
          </span>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as Tone)}
            className="border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150"
          >
            {TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
            Language
          </span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150"
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
        <Button onClick={generate} disabled={busy || disabled}>
          {busy ? 'Writing…' : 'Generate'}
        </Button>
        {error && (
          <p role="alert" className="text-error-ink text-sm">
            {error}
          </p>
        )}
      </div>
    </Card>
  );
}

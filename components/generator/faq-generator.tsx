'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FaqItem } from '@/components/ui/faq-item';
import {
  DEFAULT_FAQ_COUNT,
  LANGUAGES,
  MAX_FAQ_COUNT,
  MIN_FAQ_COUNT,
  TONES,
  type Faq,
  type Language,
  type Tone,
} from '@/lib/faq';

type Mode = 'text' | 'url';

const COUNTS = Array.from(
  { length: MAX_FAQ_COUNT - MIN_FAQ_COUNT + 1 },
  (_, i) => MIN_FAQ_COUNT + i,
);

/*
  A worked example, shown in exactly the component that renders real output —
  so what a first-time visitor sees is literally what they'll get.
*/
const SAMPLE: Faq[] = [
  {
    q: 'How long does setup take?',
    a: 'About two minutes. Add your questions, copy the one-line snippet, and paste it into your site — no developer needed.',
  },
  {
    q: 'Will this help me show up in ChatGPT?',
    a: 'That’s the idea. Assistants answer questions, so content already shaped as a question and a short answer is the easiest thing for them to pick up and cite.',
  },
  {
    q: 'Do I need to know how to code?',
    a: 'Nope. If you can paste a line of text into your site’s settings, you can install FaqFlo.',
  },
];

const SELECT_CLASS =
  'border-line text-navy focus:border-primary h-10 cursor-pointer rounded-[10px] border bg-white px-3 text-sm outline-none transition-colors duration-150';

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data as T;
}

export function FaqGenerator() {
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [count, setCount] = useState(DEFAULT_FAQ_COUNT);
  const [tone, setTone] = useState<Tone>('Professional');
  const [language, setLanguage] = useState<Language>('English');

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [faqs, setFaqs] = useState<Faq[] | null>(null);
  const [copied, setCopied] = useState(false);

  const busy = status !== null;
  const shown = faqs ?? SAMPLE;

  async function generate() {
    setError(null);

    let content = text.trim();
    if (mode === 'text') {
      if (content.length < 50) {
        setError('Paste a bit more — at least a paragraph gives us something to work with.');
        return;
      }
    } else {
      const target = url.trim();
      if (!target) {
        setError('Pop a URL in first.');
        return;
      }
      try {
        const { protocol } = new URL(target);
        if (protocol !== 'https:' && protocol !== 'http:') throw new Error();
      } catch {
        setError("That doesn't look like a valid URL — it should start with https://");
        return;
      }
      setStatus('Reading your page');
      try {
        content = (await postJson<{ content: string }>('/api/fetch-url', { url: target })).content;
      } catch (err) {
        setStatus(null);
        setError(err instanceof Error ? err.message : 'Could not fetch that URL.');
        return;
      }
    }

    setStatus('Writing your FAQs');
    try {
      const data = await postJson<{ faqs: Faq[] }>('/api/generate', {
        content,
        count,
        tone,
        language,
      });
      setFaqs(data.faqs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setStatus(null);
    }
  }

  async function copyAll() {
    const payload = shown.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setError('Could not copy to the clipboard.');
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-8">
      {/* Input */}
      <div className="border-line shadow-card rounded-2xl border bg-white p-5 sm:p-7">
        <div className="bg-cloud inline-flex rounded-full p-1" role="tablist" aria-label="Content source">
          {(['text', 'url'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`rounded-full px-4 py-1.5 text-sm transition-all duration-200 ${
                mode === m ? 'text-navy shadow-soft bg-white font-semibold' : 'text-slate hover:text-navy'
              }`}
            >
              {m === 'text' ? 'Paste text' : 'Use a URL'}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {mode === 'text' ? (
            <>
              <label htmlFor="gen-content" className="sr-only">
                Your content
              </label>
              <textarea
                id="gen-content"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste a page from your site — an about page, a product page, anything that explains what you do…"
                rows={7}
                className="border-line bg-cloud text-navy focus:border-primary w-full resize-y rounded-input border p-4 text-[0.9375rem] leading-relaxed outline-none transition-colors duration-150"
              />
              <p className="text-slate mt-2 text-xs">
                Around 200 words or more works best.
              </p>
            </>
          ) : (
            <>
              <label htmlFor="gen-url" className="sr-only">
                Page URL
              </label>
              <input
                id="gen-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yoursite.com/about"
                className="border-line bg-cloud text-navy focus:border-primary h-12 w-full rounded-input border px-4 text-[0.9375rem] outline-none transition-colors duration-150"
              />
              <p className="text-slate mt-2 text-xs">We&rsquo;ll read the page for you.</p>
            </>
          )}
        </div>

        <div className="border-line mt-5 space-y-4 border-t pt-5">
          <div className="flex items-center gap-3">
            <span className="text-slate w-20 shrink-0 text-sm">Questions</span>
            <div className="bg-cloud flex gap-0.5 rounded-full p-1">
              {COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  aria-pressed={count === n}
                  className={`h-7 w-7 rounded-full text-[0.8125rem] tabular-nums transition-all duration-200 ${
                    count === n
                      ? 'bg-primary font-semibold text-white'
                      : 'text-slate hover:text-navy'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-slate w-20 shrink-0 text-sm">Style</span>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as Tone)}
              aria-label="Tone"
              className={SELECT_CLASS}
            >
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              aria-label="Output language"
              className={SELECT_CLASS}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Button onClick={generate} disabled={busy} size="lg" arrow={!busy} className="mt-5 w-full">
          {busy && (
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
              aria-hidden="true"
            />
          )}
          {busy ? `${status}…` : 'Write my FAQs'}
        </Button>

        <div aria-live="polite">
          {error && (
            <p className="text-error-ink bg-error/10 mt-3 rounded-[10px] px-3 py-2.5 text-[0.8125rem] leading-relaxed">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* Output */}
      <div className="border-line shadow-card rounded-2xl border bg-white p-5 sm:p-7">
        <div className="mb-1 flex items-center justify-between gap-3">
          <Badge tone={faqs ? 'success' : 'neutral'}>
            {faqs ? `${faqs.length} ready to use` : 'Example'}
          </Badge>
          <button
            onClick={copyAll}
            className="text-primary hover:text-primary-hover text-sm font-medium transition-colors duration-150"
          >
            {copied ? 'Copied ✓' : 'Copy all'}
          </button>
        </div>

        <div className={`divide-line divide-y ${busy ? 'opacity-40 transition-opacity' : ''}`}>
          {shown.map((faq, i) => (
            <FaqItem key={`${i}-${faq.q}`} question={faq.q} answer={faq.a} defaultOpen={i === 0} />
          ))}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DFY_GET_CITED_STATES,
  DFY_PLATFORMS,
  DFY_PRICE,
  DFY_TURNAROUND,
} from '@/lib/done-for-you';
import { SUPPORT_EMAIL } from '@/lib/support';

/*
  The enquiry form for the done-for-you service.

  ⚠️ THE OPPOSITE OF components/dashboard/contact-form.tsx, WHICH IT OTHERWISE
  COPIES. That form has no email field on purpose: it sits behind auth, so the
  session already knows who is asking, and a typed address is both forgeable and
  a chance to typo the reply into nowhere. This page is public. There is no
  session, so every field has to be asked for — and app/api/done-for-you/route.ts
  treats all of them as claims rather than facts.

  Five fields, and each one earns its place by changing what the reply says:
  the website is what I would be working on, the platform decides how much of
  the job is actually mine, and whether they have bought Get Cited decides
  whether the reply is a quote or a quote plus an order to sort out first. Notes
  is the only optional one. Anything else — budget, company size, "how did you
  hear about us" — is a field that makes someone work harder to give me money.

  It is a fetch to a route handler rather than a Server Action because that is
  what every non-auth form in this app does, and because the failure it has to
  render is a 502 from Resend, not a validation message.

  ⚠️ NO Card AROUND IT, AND THAT IS NOT AN OVERSIGHT. The page this sits on is
  a letter — one column, one surface, hairline rules — and a bordered white
  panel at the end of it reads as a widget bolted onto the bottom of a note.
  The inputs keep their own borders, which is what makes them obviously
  fillable; the container is what went. Same reasoning as the page's own
  header comment.
*/
export function DoneForYouForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [platform, setPlatform] = useState<string>(DFY_PLATFORMS[0]);
  const [getCited, setGetCited] = useState<string>(DFY_GET_CITED_STATES[0]);
  const [notes, setNotes] = useState('');
  /* The honeypot. Never shown, never filled by a person — see submit(). */
  const [company, setCompany] = useState('');

  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The shared field styling, repeated inline everywhere else in this codebase
  // rather than extracted. Kept identical so this form looks like the others.
  const field =
    'border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const res = await fetch('/api/done-for-you', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, website, platform, getCited, notes, company }),
      });

      const payload = (await res.json()) as { ok?: boolean; error?: string };

      /*
        The route uses sendEmail rather than trySendEmail so this branch can
        exist. A swallowed send would show the success card below for an
        enquiry nobody received, and the first anyone would know is a week of
        silence on a $497 decision.
      */
      if (!res.ok || !payload.ok) {
        setError(payload.error ?? `Something went wrong. Email ${SUPPORT_EMAIL} directly.`);
        return;
      }

      setSent(true);
    } catch {
      setError(`Couldn't reach the server. Email ${SUPPORT_EMAIL} directly and I'll pick it up.`);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    const first = name.trim().split(/\s+/)[0];

    return (
      <div>
        <h3 className="text-xl">{first ? `Got it — thanks, ${first}.` : 'Got it — thanks.'}</h3>
        <p className="text-slate mt-3 text-[1.0625rem] leading-[1.8]">
          That came straight to my inbox, and I read them myself. I&rsquo;ll reply to{' '}
          <span className="text-navy font-semibold">{email}</span> within one working day — either
          with a start date, or telling you honestly that I&rsquo;m full and when I next won&rsquo;t
          be.
        </p>
        <p className="text-slate mt-3 text-[0.9375rem] leading-relaxed">
          Nothing to pay yet. We agree the scope first.
        </p>
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
              Your name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Sam Rivera"
              className={field}
            />
          </label>

          <label className="block">
            <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
              Email
            </span>
            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="sam@yourbusiness.com"
              className={field}
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
            Your website
          </span>
          <input
            type="text"
            inputMode="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            autoComplete="url"
            placeholder="yourbusiness.com"
            className={field}
          />
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
              What it&rsquo;s built on
            </span>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className={field}
            >
              {DFY_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
              Bought Get Cited yet?
            </span>
            <select
              value={getCited}
              onChange={(e) => setGetCited(e.target.value)}
              className={field}
            >
              {DFY_GET_CITED_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-4 block">
          <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
            Anything I should know{' '}
            <span className="text-slate/60 normal-case">— optional</span>
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="What you do, where you do it, and anything about the site that makes it awkward."
            className={`${field} resize-y leading-relaxed`}
          />
        </label>

        {/*
          The honeypot.

          Hidden from sight AND from assistive tech: `aria-hidden` plus
          `tabIndex={-1}` mean a screen reader never announces it and a keyboard
          never lands on it, so no human is ever asked to leave a field blank
          they cannot see. `autoComplete="off"` stops a browser filling it on
          somebody's behalf, which is the one way a real person could trip it.

          Not `hidden` or `display:none` — some form-fillers skip those. A
          zero-height clipped wrapper looks like a real field to a bot and like
          nothing at all to a person, and staying in normal flow (rather than
          `absolute`, which would resolve against whatever ancestor happens to
          be positioned) means it cannot land somewhere unexpected on the page.
        */}
        <div className="h-0 w-0 overflow-hidden opacity-0" aria-hidden="true">
          <label>
            Company
            <input
              type="text"
              name="company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button type="submit" size="lg" disabled={busy} arrow={!busy}>
            {busy ? 'Sending…' : 'Send this to Beau'}
          </Button>
          <p className="text-slate text-sm">
            {DFY_PRICE} · {DFY_TURNAROUND} · no payment until we&rsquo;ve agreed the scope
          </p>
        </div>

        {error && (
          <p role="alert" className="text-error-ink mt-4 text-sm">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}

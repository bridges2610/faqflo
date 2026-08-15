'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { SUPPORT_EMAIL, SUPPORT_TOPICS } from '@/lib/support';
import { SectionTitle } from './section-title';

/*
  The support form on the Help page.

  ⚠️ THERE IS NO EMAIL FIELD, DELIBERATELY.

  The page is behind auth, so the session already knows who is asking. A typed
  address would be worse in both directions: it can be somebody else's, and a
  typo means the reply goes nowhere while the customer waits. The address is
  shown read-only instead, so nobody has to guess where the answer will land.

  Everything else about who they are — plan, sites, user id — is read on the
  server in app/api/contact/route.ts rather than posted from here. Support
  context the sender can edit reads as authoritative and can be wrong.
*/
export function ContactForm() {
  const { user } = useDashboard();
  const [topic, setTopic] = useState<string>(SUPPORT_TOPICS[0]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field =
    'border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-white px-3 py-2 text-sm outline-none transition-colors duration-150';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return setError('Tell us what you need help with.');

    setError(null);
    setBusy(true);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, message }),
      });

      const payload = (await res.json()) as { ok?: boolean; error?: string };

      /*
        The route uses sendEmail rather than trySendEmail precisely so this
        branch can exist. A failed send that showed "thanks, we'll be in touch"
        would leave someone waiting on a reply to a message nobody received.
      */
      if (!res.ok || !payload.ok) {
        setError(payload.error ?? `Something went wrong. Email ${SUPPORT_EMAIL} directly.`);
        return;
      }

      setSent(true);
      setMessage('');
    } catch {
      setError(`Could not reach the server. Email ${SUPPORT_EMAIL} directly and we'll pick it up.`);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Card tone="cloud" className="p-5 sm:p-7">
        <SectionTitle>Message sent</SectionTitle>
        <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">
          It&rsquo;s a real inbox and a real person. We&rsquo;ll reply to{' '}
          <span className="text-navy font-semibold">{user?.email}</span> — usually within a working
          day.
        </p>
        <Button size="sm" variant="ghost" className="mt-4" onClick={() => setSent(false)}>
          Send another
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-7">
      <SectionTitle>Ask us anything</SectionTitle>
      <p className="text-slate mt-2 text-[0.9375rem] leading-relaxed">
        If this page didn&rsquo;t answer it, send us the question. Tell us what you were trying to
        do and what happened instead — that&rsquo;s usually enough for us to fix it in one reply.
      </p>

      <form onSubmit={submit} className="mt-5">
        <label className="block">
          <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
            What&rsquo;s it about
          </span>
          <select value={topic} onChange={(e) => setTopic(e.target.value)} className={field}>
            {SUPPORT_TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block">
          <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
            Your message
          </span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            placeholder="I pasted the block onto my services page but the audit still says it's out of date…"
            className={`${field} resize-y leading-relaxed`}
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? 'Sending…' : 'Send message'}
          </Button>
          {/* Read-only, so nobody wonders where the answer goes. */}
          <p className="text-slate text-xs">
            We&rsquo;ll reply to <span className="text-navy font-medium">{user?.email}</span>
          </p>
        </div>

        {error && (
          <p role="alert" className="text-error-ink mt-3 text-sm">
            {error}
          </p>
        )}
      </form>
    </Card>
  );
}

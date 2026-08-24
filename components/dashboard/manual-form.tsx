'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDashboard } from '@/lib/dashboard/provider';
import { FaqCapReached } from '@/lib/dashboard/store';

/** Blank row for writing one by hand — not everything comes from the model. */
export function ManualForm({ groupId, onDone }: { groupId: string; onDone: () => void }) {
  const { addFaqs } = useDashboard();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!question.trim() || !answer.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addFaqs(groupId, [{ question, answer, status: 'draft', source: 'manual' }]);
    } catch (err) {
      // Keep what they typed on screen — this one was written by hand, and
      // clearing the form on a cap error would throw away their work.
      setError(
        err instanceof FaqCapReached
          ? `Free accounts can hold ${err.cap} answers. Pro removes the limit.`
          : 'That answer could not be saved. Please try again.',
      );
      setSaving(false);
      return;
    }
    setSaving(false);
    onDone();
  }

  return (
    <div className="border-line bg-cloud mt-4 rounded-xl border p-4">
      <label className="block">
        <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
          Question
        </span>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Do you offer weekend appointments?"
          className="border-line text-navy focus:border-primary mt-1.5 w-full rounded-input border bg-white px-3 py-2 text-[0.9375rem] outline-none transition-colors duration-150"
        />
      </label>
      <label className="mt-3 block">
        <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
          Answer
        </span>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={3}
          placeholder="Two or three sentences, in plain words."
          className="border-line text-navy focus:border-primary mt-1.5 w-full resize-y rounded-input border bg-white px-3 py-2 text-sm leading-relaxed outline-none transition-colors duration-150"
        />
      </label>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving || !question.trim() || !answer.trim()}>
          {saving ? 'Adding…' : 'Add as draft'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-error-ink mt-3 text-sm leading-relaxed">
          {error}
        </p>
      )}
    </div>
  );
}

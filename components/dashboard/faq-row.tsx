'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDashboard } from '@/lib/dashboard/provider';
import type { FaqEntry } from '@/lib/dashboard/types';
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from './nav-icons';

/*
  One FAQ, with everything you can do to it.

  Editing happens inline rather than in a modal: a modal would need focus
  trapping, scroll locking and an escape route, all to show two fields that fit
  perfectly well in the row itself.

  Deleting takes two clicks. The row is one of a list of near-identical rows,
  which is exactly the situation where a single-click delete hits the wrong one.
*/
export function FaqRow({
  faq,
  isFirst,
  isLast,
}: {
  faq: FaqEntry;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { editFaq, removeFaq, moveFaq } = useDashboard();
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(faq.question);
  const [answer, setAnswer] = useState(faq.answer);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const published = faq.status === 'published';

  function startEdit() {
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setEditing(true);
  }

  async function save() {
    const q = question.trim();
    const a = answer.trim();
    if (!q || !a) return;
    await editFaq(faq.id, { question: q, answer: a });
    setEditing(false);
  }

  return (
    <li className="py-4">
      <div className="flex items-start gap-3">
        {/* Reorder — position decides the order in the widget and in the
            schema, so it's worth having where the eye already is. */}
        <div className="flex shrink-0 flex-col gap-0.5 pt-0.5">
          <button
            onClick={() => moveFaq(faq.id, 'up')}
            disabled={isFirst}
            aria-label="Move up"
            className="text-slate hover:text-primary hover:bg-cloud rounded-md p-1 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowUpIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => moveFaq(faq.id, 'down')}
            disabled={isLast}
            aria-label="Move down"
            className="text-slate hover:text-primary hover:bg-cloud rounded-md p-1 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowDownIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-3">
              <label className="block">
                <span className="sr-only">Question</span>
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className="border-line bg-cloud text-navy focus:border-primary w-full rounded-input border px-3 py-2 text-[0.9375rem] font-semibold outline-none transition-colors duration-150"
                />
              </label>
              <label className="block">
                <span className="sr-only">Answer</span>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={4}
                  className="border-line bg-cloud text-navy focus:border-primary w-full resize-y rounded-input border px-3 py-2 text-sm leading-relaxed outline-none transition-colors duration-150"
                />
              </label>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={save} disabled={!question.trim() || !answer.trim()}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                <h3 className="text-navy min-w-0 text-[0.9375rem] leading-snug font-semibold">
                  {faq.question}
                </h3>
                <Badge tone={published ? 'success' : 'neutral'}>
                  {published ? 'Published' : 'Draft'}
                </Badge>
              </div>
              {/* An entry drafted from an unanswered search arrives with no
                  answer on purpose — say so rather than rendering a blank. */}
              {faq.answer ? (
                <p className="text-slate mt-1.5 text-sm leading-relaxed">{faq.answer}</p>
              ) : (
                <p className="text-slate mt-1.5 text-sm italic">
                  No answer yet — edit this to write one.
                </p>
              )}
            </>
          )}

          {!editing && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                onClick={startEdit}
                className="text-primary hover:text-primary-hover text-sm font-medium transition-colors duration-150"
              >
                Edit
              </button>
              <button
                onClick={() => editFaq(faq.id, { status: published ? 'draft' : 'published' })}
                className="text-slate hover:text-navy text-sm transition-colors duration-150"
              >
                {published ? 'Unpublish' : 'Publish'}
              </button>

              {confirmDelete ? (
                <span className="flex items-center gap-2 text-sm">
                  <span className="text-slate">Delete?</span>
                  <button
                    onClick={() => removeFaq(faq.id)}
                    className="text-error-ink font-semibold"
                  >
                    Yes
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="text-slate">
                    No
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-slate hover:text-error-ink inline-flex items-center gap-1.5 text-sm transition-colors duration-150"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

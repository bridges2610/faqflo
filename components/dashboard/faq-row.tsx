'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDashboard } from '@/lib/dashboard/provider';
import type { FaqEntry } from '@/lib/dashboard/types';
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from './nav-icons';

/*
  One answer, with everything you can do to it.

  Editing happens inline rather than in a modal: a modal would need focus
  trapping, scroll locking and an escape route, all to show two fields that fit
  perfectly well in the row itself.

  Deleting takes two clicks. The row is one of a list of near-identical rows,
  which is exactly the situation where a single-click delete hits the wrong one.
*/
/** Where an answer came from. `discovered` means it started as a question. */
const SOURCE_LABEL: Record<FaqEntry['source'], string> = {
  generated: 'generated',
  manual: 'written by you',
  discovered: 'from a question',
};

export function FaqRow({
  faq,
  isFirst,
  isLast,
}: {
  faq: FaqEntry;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { editFaq, removeFaq, moveFaq, moveFaqToGroup, groups } = useDashboard();
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(faq.question);
  const [answer, setAnswer] = useState(faq.answer);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moving, setMoving] = useState(false);

  const published = faq.status === 'published';
  const otherGroups = groups.filter((g) => g.id !== faq.groupId);

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
    /* The id is what makes search results and deep links land on the answer
       itself rather than the top of its page. scroll-mt clears the sticky
       header so the row is not hidden underneath it on arrival. */
    <li id={faq.id} className="scroll-mt-24 py-4">
      <div className="flex items-start gap-3">
        {/* Reorder — position decides the order in the exported HTML and in the
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
                {/* Stored on every entry since the beginning and rendered
                    nowhere until now. It is the closest thing to a category the
                    data already holds, and it answers "did I write this, or did
                    the model?" without inventing a second taxonomy. */}
                <span className="text-slate/80 text-[0.6875rem]">{SOURCE_LABEL[faq.source]}</span>
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

              {/* A generated set usually contains one or two answers that
                  belong on a different page. Only offered when there's
                  somewhere to move to. */}
              {otherGroups.length > 0 &&
                (moving ? (
                  <span className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`move-${faq.id}`}>
                      Move to group
                    </label>
                    <select
                      id={`move-${faq.id}`}
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) moveFaqToGroup(faq.id, e.target.value);
                        setMoving(false);
                      }}
                      className="border-line text-navy focus:border-primary rounded-input border bg-white px-2 py-1 text-sm outline-none"
                    >
                      <option value="" disabled>
                        Move to…
                      </option>
                      {otherGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => setMoving(false)} className="text-slate text-sm">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setMoving(true)}
                    className="text-slate hover:text-navy text-sm transition-colors duration-150"
                  >
                    Move to…
                  </button>
                ))}

              {confirmDelete ? (
                <span className="flex items-center gap-2 text-sm">
                  <span className="text-slate">Delete?</span>
                  <button onClick={() => removeFaq(faq.id)} className="text-error-ink font-semibold">
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

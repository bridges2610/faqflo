'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDashboard } from '@/lib/dashboard/provider';
import type { DiscoveredQuestion } from '@/lib/dashboard/types';
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from './nav-icons';

/**
 * Curate one watched question: move it, reword it, stop watching it.
 *
 * ⚠️ IT LIVES IN THE EXPANDED ROW, NOT IN THE GRID. Four controls on every row
 * of a matrix is four things competing with the three cells the matrix exists
 * to show, and this page has been cut back for that reason more than once.
 * Reordering and rewording are deliberate acts; reading the grid is not. One
 * click to open is the right price.
 *
 * ⚠️ EDIT DISAPPEARS ONCE THE QUESTION HAS BEEN ASKED, AND THE STORE ENFORCES
 * IT TOO. questions.question is byte-identical to tracked_prompts.question and
 * the two are joined by plain string equality — 0009 says so and forbids even
 * trimming. Rewording does not rename a question, it orphans every result
 * collected under the old wording. store.updateQuestion refuses with
 * 'has-results'; this only hides a button that would fail.
 */
export function QuestionControls({
  question,
  hasResults,
  isFirst,
  isLast,
}: {
  question: DiscoveredQuestion;
  hasResults: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { editQuestion, removeQuestion, moveQuestion } = useDashboard();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(question.question);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    const result = await editQuestion(question.id, text);
    if (result.ok) {
      setEditing(false);
      setError(null);
      return;
    }
    setError(
      result.reason === 'duplicate'
        ? 'You’re already watching that question.'
        : result.reason === 'too-long'
          ? 'That’s too long. Keep it to one question.'
          : result.reason === 'has-results'
            ? 'This one has already been asked, so it can’t be reworded.'
            : 'Type a question first.',
    );
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <label className="block">
          <span className="sr-only">Reword this question</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="border-line bg-surface text-navy focus:border-primary w-full rounded-input border px-3 py-2 text-sm outline-none transition-colors duration-150"
          />
        </label>
        {error ? (
          <p role="alert" className="text-error-ink text-sm">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={!text.trim()}>
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setText(question.question);
              setEditing(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={() => moveQuestion(question.id, 'up')}
        disabled={isFirst}
        aria-label="Move this question up"
        className="text-slate hover:text-primary hover:bg-surface rounded-md p-1 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ArrowUpIcon className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => moveQuestion(question.id, 'down')}
        disabled={isLast}
        aria-label="Move this question down"
        className="text-slate hover:text-primary hover:bg-surface rounded-md p-1 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ArrowDownIcon className="h-3.5 w-3.5" />
      </button>

      {/* ⚠️ A SENTENCE, NOT A DISABLED PENCIL. A greyed control with no reason
          beside it makes the reader hunt for what they did wrong — the rule
          prompt-ranking.tsx states as "LOCKED IS NOT DISABLED". */}
      {hasResults ? (
        <span className="text-slate/80 text-xs">Already asked, so the wording is fixed</span>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-slate hover:text-primary text-xs font-semibold"
        >
          Reword
        </button>
      )}

      {confirmDelete ? (
        <span className="flex items-center gap-2">
          <button
            onClick={() => removeQuestion(question.id)}
            className="text-error-ink text-xs font-semibold"
          >
            Stop watching
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="text-slate hover:text-navy text-xs"
          >
            Keep
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirmDelete(true)}
          aria-label="Stop watching this question"
          className="text-slate hover:text-error-ink rounded-md p-1 transition-colors duration-150"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

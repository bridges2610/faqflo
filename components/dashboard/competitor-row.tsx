'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDashboard } from '@/lib/dashboard/provider';
import type { Competitor, CompetitorShare } from '@/lib/dashboard/types';
import { TrendMark } from './source-row';
import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from './nav-icons';

/**
 * One watched rival: what you call them, their website, and how often AI named
 * them.
 *
 * ⚠️ `mentions` IS MEASURED, AND THE ROW MUST NOT LET IT LOOK EDITABLE. The
 * name and the domain are the customer's; the count is not. It comes from the
 * same citation data the list below this one is built from, matched by domain,
 * and there is no input for it anywhere on this page for that reason.
 *
 * ⚠️ AND ZERO IS A READING, NOT A BLANK. A rival AI has never cited reads "0",
 * because that is the finding the owner asked us to watch for. Rendering an
 * empty cell would turn the answer into a missing value.
 */
export function CompetitorRow({
  competitor,
  mentions,
  trend,
  isFirst,
  isLast,
}: {
  competitor: Competitor;
  mentions: number;
  /**
   * How their citations moved between the last two runs.
   *
   * ⚠️ MEASURED LIKE `mentions`, AND NULL FOR THE SAME KINDS OF REASON. A rival
   * with no citations has nothing to trend, and so does an account with only
   * one run — both render as words rather than as a flat arrow.
   */
  trend: CompetitorShare['trend'];
  isFirst: boolean;
  isLast: boolean;
}) {
  const { editCompetitor, removeCompetitor, moveCompetitor } = useDashboard();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(competitor.name);
  const [domain, setDomain] = useState(competitor.domain);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function startEdit() {
    setName(competitor.name);
    setDomain(competitor.domain);
    setEditing(true);
  }

  async function save() {
    if (!name.trim() || !domain.trim()) return;
    await editCompetitor(competitor.id, { name: name.trim(), domain: domain.trim() });
    setEditing(false);
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        {/* Reorder, in the same place and the same shape as the answers list —
            a second arrangement of the same two arrows would be one to learn
            twice. See faq-row.tsx. */}
        <div className="flex shrink-0 flex-col gap-0.5 pt-0.5">
          <button
            onClick={() => moveCompetitor(competitor.id, 'up')}
            disabled={isFirst}
            aria-label={`Move ${competitor.name} up`}
            className="text-slate hover:text-primary hover:bg-cloud rounded-md p-1 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowUpIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => moveCompetitor(competitor.id, 'down')}
            disabled={isLast}
            aria-label={`Move ${competitor.name} down`}
            className="text-slate hover:text-primary hover:bg-cloud rounded-md p-1 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowDownIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <label className="block">
                <span className="sr-only">Competitor name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Summit Roofing"
                  className="border-line bg-cloud text-navy focus:border-primary w-full rounded-input border px-3 py-2 text-sm font-semibold outline-none transition-colors duration-150"
                />
              </label>
              <label className="block">
                <span className="sr-only">Their website</span>
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="summitroofing.com"
                  className="border-line bg-cloud text-slate focus:border-primary w-full rounded-input border px-3 py-2 font-mono text-sm outline-none transition-colors duration-150"
                />
              </label>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={save} disabled={!name.trim() || !domain.trim()}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <p className="text-navy truncate text-sm font-semibold">{competitor.name}</p>
                {/* Mono here, unlike a domain read inside a sentence: this one
                    is the address you would copy, and it is the value the
                    measured list is matched on. */}
                <p className="text-slate truncate font-mono text-xs">{competitor.domain}</p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <TrendMark trend={trend} />
                {/* ⚠️ A REAL SPACE, NOT JUST ml-1. The margin spaces it on
                    screen and leaves the text content joined — "4mentions" is
                    what a screen reader says and what lands when the row is
                    copied. The same defect the score card had with its status
                    word. */}
                <p className="text-navy text-sm font-semibold tabular-nums">
                  {mentions}{' '}
                  <span className="text-slate text-xs font-normal">
                    {mentions === 1 ? 'mention' : 'mentions'}
                  </span>
                </p>

                <button
                  onClick={startEdit}
                  className="text-slate hover:text-primary text-xs font-semibold"
                >
                  Edit
                </button>

                {/* Two presses to delete, no dialog. Same trade faq-row makes:
                    a modal for one row is heavier than the thing it protects,
                    and an undo would need a history this list does not keep. */}
                {confirmDelete ? (
                  <span className="flex items-center gap-2">
                    <button
                      onClick={() => removeCompetitor(competitor.id)}
                      className="text-error-ink text-xs font-semibold"
                    >
                      Remove
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
                    aria-label={`Remove ${competitor.name}`}
                    className="text-slate hover:text-error-ink rounded-md p-1 transition-colors duration-150"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

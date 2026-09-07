'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDashboard } from '@/lib/dashboard/provider';
import type { Competitor, CompetitorShare } from '@/lib/dashboard/types';
import { TrendMark } from './source-row';
import { StarIcon, TrashIcon } from './nav-icons';
import { Meter } from './meter';

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
  topMentions,
  trend,
}: {
  competitor: Competitor;
  mentions: number;
  /**
   * The busiest watched rival's count, so every bar on the list shares a scale.
   *
   * ⚠️ THE SAME BASIS SourceRow USES in the measured list below — a bar drawn
   * against its own row would make every rival look equally cited.
   */
  topMentions: number;
  /**
   * How their citations moved between the last two runs.
   *
   * ⚠️ MEASURED LIKE `mentions`, AND NULL FOR THE SAME KINDS OF REASON. A rival
   * with no citations has nothing to trend, and so does an account with only
   * one run — both render as words rather than as a flat arrow.
   */
  trend: CompetitorShare['trend'];
}) {
  const { editCompetitor, removeCompetitor, starCompetitor } = useDashboard();
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
        {/*
          ⚠️ THIS REPLACED THE UP/DOWN ARROWS, AND THE NOTE THEY CARRIED IS GONE
          WITH THEM. They said reorder belonged here "in the same place and the
          same shape as the answers list". True while a hand-set position was
          what ordered this list — it is not any more. The order is star, then
          measured mentions (see compareWatched), and a third rule would have
          left the arrows appearing to do nothing on most presses.

          ⚠️ aria-pressed AND A NAME THAT SAYS WHICH WAY ROUND. A filled star and
          an outlined one are the same smudge at 16px and silent to a screen
          reader; the state has to be in words. Same rule as every other mark in
          this product.
        */}
        <button
          onClick={() => starCompetitor(competitor.id, !competitor.starred)}
          aria-pressed={competitor.starred}
          aria-label={
            competitor.starred
              ? `Remove ${competitor.name} from priorities`
              : `Make ${competitor.name} a priority`
          }
          /* ⚠️ text-warn, NOT text-warn-ink, AND THE TOKENS SAY SO. globals.css
             sets the convention on this pair: "the mid value is for fills and
             icons, the ink for type". The star was on warn-ink #c2410c, which
             is orange-700 — correct for a word, and it reads brown-orange as a
             shape. --color-warn #f59e0b is the amber this is meant to be.

             ⚠️ THE HUE IS NOT WHAT CARRIES THE STATE, which is why a 2.15:1
             icon colour is acceptable here and would not be on type. Filled
             versus outlined is a second encoding independent of colour, and the
             button's aria-pressed and label say it in words. */
          className={`hover:bg-cloud shrink-0 rounded-md p-1 transition-colors duration-150 ${
            competitor.starred ? 'text-warn' : 'text-slate/50 hover:text-slate'
          }`}
        >
          <StarIcon filled={competitor.starred} className="h-4.5 w-4.5" />
        </button>

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <label className="block">
                <span className="sr-only">Competitor name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="A competitor's name"
                  className="border-line bg-cloud text-navy focus:border-primary w-full rounded-input border px-3 py-2 text-sm font-semibold outline-none transition-colors duration-150"
                />
              </label>
              <label className="block">
                <span className="sr-only">Their website</span>
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="Their website"
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

                {/*
                  ⚠️ THE BAR IS A SECOND ENCODING, AND THE COUNT BESIDE IT STAYS.
                  meter.tsx makes that a rule about the caller: it is always
                  aria-hidden, so the figure has to be readable as text — which
                  it is, to the right of this. It is here to make the ranking
                  visible without reading four numbers, the same job it does in
                  the measured list below.

                  ⚠️ AND ZERO DRAWS AN EMPTY TRACK RATHER THAN NOTHING. A rival
                  AI has never cited is the finding the owner asked for; a
                  missing bar would read as a missing measurement.
                */}
                {/* ⚠️ ONE TONE FOR EVERY BAR, AND IT WAS BRIEFLY TWO. Tinting
                    the starred row differently double-encodes a fact the star
                    already carries, and the `line` tone used for the rest was
                    very nearly the colour of the track behind it — a rival on
                    two mentions with a full bar looked identical to one on
                    zero. The bar means mentions; the star means priority. */}
                <Meter
                  className="mt-2 max-w-40"
                  value={(mentions / topMentions) * 100}
                  tone="primary"
                />
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

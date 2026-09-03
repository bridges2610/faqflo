'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDashboard } from '@/lib/dashboard/provider';
import { useCopy } from '@/lib/dashboard/use-copy';
import { buildPasteBlock, groupUrl, publishState } from '@/lib/dashboard/export';
import type { FaqEntry, FaqGroup, Site } from '@/lib/dashboard/types';
import { EmbedInstructions } from './embed-instructions';
import { CopyIcon, TickIcon } from './nav-icons';

/*
  The last step, pinned to the bottom of Answers.

  ⚠️ AN ANSWER NOBODY PASTED DOES NOTHING. Everything else on that page is
  preparation: writing, reordering, filling gaps. This is the only control that
  changes what an answer engine can actually read, and it used to live on its
  own route a click away — which meant the work and the point of the work were
  never on screen together.

  ⚠️ PINNED, NOT FLOATING OVER THE LAST ROW. `sticky bottom-0` with a matching
  background keeps it out of the way of the list while never scrolling off. A
  fixed bar would sit over the final answer on a short viewport, which is the
  row somebody is most likely to be editing.
*/
export function PublishPanel({
  site,
  group,
  faqs,
}: {
  site: Site;
  group: FaqGroup;
  faqs: FaqEntry[];
}) {
  const { markPublished } = useDashboard();
  const { copied, copy } = useCopy();
  const [open, setOpen] = useState(false);

  const live = faqs.filter((f) => f.status === 'published');
  const state = publishState(group, faqs);
  const block = buildPasteBlock(site, group, live);

  /*
    ⚠️ THE THREE STATES ARE NOT DECORATION — they are the difference between
    "do this now" and "you already did". publishState compares the stored hash
    against the current content, so 'stale' means the answers moved on since the
    paste and the live page is behind. Saying "ready" in that case would tell
    somebody their website is fine when it is out of date.
  */
  const label =
    state === 'current'
      ? `${live.length} ${live.length === 1 ? 'answer is' : 'answers are'} on your site`
      : state === 'stale'
        ? `${live.length} ${live.length === 1 ? 'answer has' : 'answers have'} changed since you pasted`
        : `${live.length} ${live.length === 1 ? 'answer' : 'answers'} ready for your site`;

  return (
    <div className="sticky bottom-0 z-30 -mx-5 mt-5 sm:-mx-8 lg:-mx-10">
      <div className="border-line bg-white/95 border-t px-5 py-3 backdrop-blur-md sm:px-8 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-navy min-w-0 text-sm font-semibold">
            {label}
            {state === 'current' ? (
              <span className="text-success-ink ml-2 text-xs font-normal">✓ up to date</span>
            ) : null}
          </p>

          {/* ⚠️ WRAPS RATHER THAN shrink-0, AND THE NARROWEST PHONE IS WHY.
              Both buttons are whitespace-nowrap and together measure 328px; a
              320px viewport leaves 272px inside this bar, so `shrink-0` pushed
              "Copy for my website" — the one action on this page that changes
              what AI can read — off the right edge and scrolled the whole
              document sideways. Wrapping puts it on its own line instead. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
              {open ? 'Hide' : 'How to add it'}
            </Button>
            <Button size="sm" onClick={() => copy(block)}>
              {copied ? (
                <>
                  <TickIcon className="mr-1.5 h-3.5 w-3.5" /> Copied
                </>
              ) : (
                <>
                  <CopyIcon className="mr-1.5 h-3.5 w-3.5" /> Copy for my website
                </>
              )}
            </Button>
          </div>
        </div>

        {open ? (
          <div className="border-line mt-3 max-h-[50vh] overflow-y-auto border-t pt-4">
            <p className="text-slate text-sm leading-relaxed">
              Paste this onto{' '}
              <span className="text-navy font-medium">{groupUrl(site, group)}</span>. It is plain
              HTML, so AI can read it without running any JavaScript.
            </p>

            <EmbedInstructions />

            {/* ⚠️ MARKING IT PASTED STORES THE HASH, WHICH IS WHAT MAKES THE
                STALE NUDGE WORK LATER. The block is pasted by hand somewhere we
                cannot see, so the only way to know the live copy has drifted is
                to remember what it looked like when they said they pasted it.
                See markGroupPublished in the store. */}
            <Button
              size="sm"
              variant="ghost"
              className="mt-4"
              onClick={() => markPublished(group.id)}
            >
              I’ve pasted it
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

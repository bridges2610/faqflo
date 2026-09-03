'use client';

import { useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { buildPasteBlock, buildPlainText, publishState } from '@/lib/dashboard/export';
import { canPublish } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { useCopy } from '@/lib/dashboard/use-copy';
import type { FaqEntry, FaqGroup, Site } from '@/lib/dashboard/types';
import { EmbedInstructions } from './embed-instructions';
import { CopyIcon, LockIcon, TickIcon } from './nav-icons';

/*
  Putting one set of answers on the site.

  ⚠️ THIS REPLACED A SINGLE PINNED BAR, AND ONE COPY PATH IS THE POINT. Answers
  used to end in a sticky "Copy for my website" that exported the whole site's
  answers as one block. With sets that each go on a different page, that bar and
  a per-set button would be two controls producing different HTML from the same
  answers — which is the mistake export.ts already records fixing once: "they
  were two copy blocks, which read as a choice and wasn't one".

  ⚠️ THE PAGE IS ASKED FOR HERE, NOT AT GENERATION TIME. The generator's "Add
  to" select made you choose a destination before a word existed. You know where
  something goes when you are about to paste it, so that is where the question
  belongs.

  ⚠️ COPYING IS NOT GATED ON KNOWING THE PAGE. Somebody who just wants the HTML
  gets it; what a page buys is a schema that names it. The line under the button
  says which of the two they are getting rather than quietly emitting weaker
  markup.
*/
export function SetPublish({
  site,
  group,
  faqs,
}: {
  site: Site;
  group: FaqGroup;
  faqs: FaqEntry[];
}) {
  const { editGroup, markPublished, user } = useDashboard();
  const code = useCopy();
  const text = useCopy();

  const [path, setPath] = useState(group.path ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = faqs.filter((f) => f.status === 'published');
  const state = publishState(group, live);
  const block = buildPasteBlock(site, group, live);
  const plain = buildPlainText(group, faqs);
  const allowed = canPublish(user);

  /*
    ⚠️ THE THREE STATES ARE NOT DECORATION — they are the difference between "do
    this now" and "you already did". publishState compares the stored hash
    against the current content, so 'stale' means the answers moved on since the
    paste and the live page is behind. Saying "ready" then would tell somebody
    their website is fine when it is out of date.
  */
  const status =
    live.length === 0
      ? 'Nothing published in this set yet — publish an answer above first.'
      : state === 'current'
        ? `${live.length} ${live.length === 1 ? 'answer is' : 'answers are'} on your site.`
        : state === 'stale'
          ? `${live.length} ${live.length === 1 ? 'answer has' : 'answers have'} changed since you pasted.`
          : `${live.length} ${live.length === 1 ? 'answer is' : 'answers are'} ready to paste.`;

  async function savePath() {
    const next = path.trim();
    if (next === (group.path ?? '')) return;

    setError(null);
    setSaving(true);
    try {
      await editGroup(group.id, { path: next || null });
    } catch (err) {
      /* Two sets cannot claim one page: the export's schema would then have two
         blocks asserting the same URL. The store throws DuplicatePath; say which
         page rather than "could not save". */
      setError(
        err instanceof Error && err.name === 'DuplicatePath'
          ? 'Another set is already on that page. Pick a different one.'
          : 'That page could not be saved. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-line bg-cloud mt-1 mb-3 rounded-xl border p-4">
      <p className="text-navy text-sm font-semibold">Put this set on your site</p>
      <p className="text-slate mt-1 text-sm">{status}</p>

      <label className="mt-3 block">
        <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
          Which page is it going on?
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="text-slate shrink-0 font-mono text-xs">{site.domain}</span>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onBlur={savePath}
            disabled={saving}
            placeholder="/roof-costs"
            className="border-line text-navy focus:border-primary min-w-0 flex-1 rounded-input border bg-white px-3 py-1.5 font-mono text-xs outline-none transition-colors duration-150"
          />
        </span>
      </label>

      {error && (
        <p role="alert" className="text-error-ink mt-2 text-sm">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {allowed ? (
          <Button size="sm" disabled={!block} onClick={() => code.copy(block)}>
            {code.copied ? <TickIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
            {code.copied ? 'Code copied' : 'Copy code'}
          </Button>
        ) : (
          /* ⚠️ LOCKED IS NOT DISABLED, and the plain-text button beside it still
             works — the difference between "you can't have your writing" and
             "you can have your writing, just not the code". */
          <ButtonLink href="/dashboard/plan" size="sm" variant="ghost">
            <LockIcon className="h-4 w-4" />
            Code needs Pro
          </ButtonLink>
        )}

        {/* ⚠️ NEVER GATED, ON ANY PLAN. copy-html-button.tsx sets out why: when
            publishing became a subscription feature, the honest version of "your
            words are yours" became this. */}
        <Button size="sm" variant="ghost" onClick={() => text.copy(plain)}>
          {text.copied ? <TickIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
          {text.copied ? 'Text copied' : 'Copy text'}
        </Button>

        {live.length > 0 && state !== 'current' && (
          <Button size="sm" variant="ghost" onClick={() => markPublished(group.id)}>
            I&rsquo;ve pasted it
          </Button>
        )}
      </div>

      <p className="text-slate mt-2 text-xs">
        {group.path
          ? `The code names ${site.domain}${group.path}, so assistants know which page these answers are on.`
          : 'Add the page above and the code will name it, which tells assistants where these answers live.'}
      </p>

      <div className="mt-4">
        {/* Self-contained: WordPress, Squarespace, Webflow, Shopify, Wix and
            hand-coded, with the steps for each. Reused, not restated.

            ⚠️ compact HERE AND ON THE ARTICLE PAGE, FULL SIZE ON
            publish-workspace.tsx. There the instructions are the subject of the
            screen; here they are a footnote under a copy button, and at full
            size they were the largest thing in the block. */}
        <EmbedInstructions compact />
      </div>
    </div>
  );
}

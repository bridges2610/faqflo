'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FREE_FAQ_CAP } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { FaqCapReached } from '@/lib/dashboard/store';
import type { Faq } from '@/lib/faq';
import { CopyPlainButton } from './copy-html-button';
import { DraftReview } from './draft-review';
import { FaqRow } from './faq-row';
import { GeneratorPanel, type GenerationMeta } from './generator-panel';
import { GroupForm } from './group-form';
import { ManualForm } from './manual-form';

/*
  Writing answers, on the report itself.

  ⚠️ THIS EXISTS BECAUSE FREE IS ONE PAGE. Every one of the pieces below is
  imported by exactly one other file — group-workspace.tsx — rendered by exactly
  one route, /dashboard/faqs/[groupId]. Gating that route without moving them
  would leave a free account unable to reach the answer-writing that
  canGenerate() opened to every plan, and would make two bullets on the pricing
  page false.

  ⚠️ THE ROUTE USED TO SUPPLY THE GROUP, AND NOW NOTHING DOES. group-workspace
  can drop its destination picker because "being on this route IS that
  decision". Here there is no route to carry it, and a free account starts with
  no group at all — "Choose the page your answers go on" is a live worklist
  task. So this asks once, up front, and then behaves like the group page.

  Asking is deliberate rather than inventing a default. The group decides the
  URL the schema will name and where the export tells them to paste, so a
  silently-created "/" group would be a guess about their site that they would
  have to discover and undo later.
*/
export function FreeAnswers() {
  const { site, groups, faqs, addFaqs } = useDashboard();

  const [candidates, setCandidates] = useState<Faq[] | null>(null);
  const [meta, setMeta] = useState<GenerationMeta | null>(null);
  const [saving, setSaving] = useState(false);
  const [capError, setCapError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);

  if (!site) return null;

  /*
    One group on free, and the first one is it.

    A free account is capped at ten answers on one site; there is no scenario
    where it needs a second page to hold them, and offering a picker would be a
    control with one option.
  */
  const group = groups[0] ?? null;
  const mine = group ? faqs.filter((f) => f.groupId === group.id) : [];
  const atCap = mine.length >= FREE_FAQ_CAP;

  if (!group) {
    return (
      <>
        <p className="text-slate text-[0.9375rem] leading-relaxed">
          Answers live on a page of your site, so they have somewhere to be pasted and the code
          can name the right address. Pick that page and we&rsquo;ll write the first draft.
        </p>
        <div className="mt-4">
          <GroupForm siteId={site.id} domain={site.domain} onDone={() => undefined} />
        </div>
      </>
    );
  }

  async function save(kept: Faq[], status: 'draft' | 'published') {
    if (!group) return;
    setSaving(true);
    setCapError(null);
    try {
      await addFaqs(
        group.id,
        kept.map((f) => ({
          question: f.q,
          answer: f.a,
          status,
          source: 'generated' as const,
          tone: meta?.tone,
          language: meta?.language,
        })),
      );
      setCandidates(null);
    } catch (err) {
      /* The cap is enforced in createFaqs and nowhere else, so this is the only
         place it can be reported. Its message already names the number. */
      if (err instanceof FaqCapReached) setCapError(err.message);
      else setCapError('Could not save those answers. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <p className="text-slate text-[0.9375rem] leading-relaxed">
        These go on{' '}
        <span className="font-mono text-xs">
          {site.domain}
          {group.path}
        </span>
        . We write the first draft — you correct the details only you know, then copy them out.
      </p>

      {capError && (
        <p role="alert" className="text-error-ink mt-3 text-sm">
          {capError}
        </p>
      )}

      {/* ⚠️ At the cap the generator goes rather than being disabled: a form
          that cannot submit is a worse answer than a sentence saying why. */}
      {!atCap && (
        <div className="mt-4">
          <GeneratorPanel
            disabled={saving}
            groups={groups}
            targetGroupId={group.id}
            onGenerated={(f, m) => {
              setCandidates(f);
              setMeta(m);
            }}
          />
        </div>
      )}

      {candidates && (
        <div className="mt-4">
          <DraftReview
            candidates={candidates}
            destination={group.name}
            saving={saving}
            onSave={save}
            onDiscard={() => {
              setCandidates(null);
              setMeta(null);
            }}
          />
        </div>
      )}

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-slate text-sm">
            {mine.length} of {FREE_FAQ_CAP} answers
            {atCap && ' — that’s the free limit'}
          </p>
          <div className="flex items-center gap-2">
            {/* Never gated, on any plan. The pricing page promises the answers
                are theirs, and this is the half of that promise free gets. */}
            <CopyPlainButton group={group} faqs={mine} />
            {!atCap && (
              <Button variant="ghost" size="sm" onClick={() => setWriting((v) => !v)}>
                {writing ? 'Cancel' : 'Write one'}
              </Button>
            )}
          </div>
        </div>

        {writing && !atCap && (
          <div className="mt-3">
            <ManualForm groupId={group.id} onDone={() => setWriting(false)} />
          </div>
        )}

        {mine.length > 0 && (
          <ul className="divide-line mt-3 divide-y">
            {mine.map((faq) => (
              <FaqRow
                key={faq.id}
                faq={faq}
                /* Judged against this group's full list — free has one group,
                   so `mine` IS the full list and the ends are the real ends. */
                isFirst={faq.position === 0}
                isLast={faq.position === mine.length - 1}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

'use client';

import { useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { useDashboard } from '@/lib/dashboard/provider';
import { FaqCapReached } from '@/lib/dashboard/store';
import type { Faq } from '@/lib/faq';
import { DraftReview } from './draft-review';
import { EmptyState } from './empty-state';
import { GeneratorPanel, type GenerationMeta } from './generator-panel';
import { GroupCard } from './group-card';
import { GroupForm } from './group-form';
import { PageHeader } from './page-header';
import { PlusIcon } from './nav-icons';
import { ANSWER_TABS, WorkspaceTabs } from './workspace-tabs';

/*
  The Answers screen: generate → review → manage, grouped by the page each set
  belongs on.

  Generation targets a specific group rather than a general pile, because an
  answer's group decides which page it gets pasted onto — picking that after the
  fact is how answers end up on the wrong page.
*/
export function FaqsWorkspace() {
  const { site, groups, addFaqs } = useDashboard();
  const [candidates, setCandidates] = useState<Faq[] | null>(null);
  const [meta, setMeta] = useState<GenerationMeta | null>(null);
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  /** Group that should open itself — just created, or just written into. */
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [capError, setCapError] = useState<string | null>(null);

  if (!site) {
    return (
      <>
        <PageHeader title="Answers" description="Everything your customers ask, by page." />
        <EmptyState
          title="Add a site first"
          body="Answers belong to a page of a site, so there's one thing to do before this page is useful."
          action={<ButtonLink href="/dashboard/sites">Go to sites</ButtonLink>}
        />
      </>
    );
  }

  // Default the generator's target to the first group, but let it be changed.
  const activeGroupId = targetGroupId ?? groups[0]?.id ?? null;

  async function save(kept: Faq[], status: 'draft' | 'published') {
    if (!activeGroupId) return;
    setSaving(true);
    setCapError(null);

    try {
      await addFaqs(
        activeGroupId,
        kept.map((f) => ({
          question: f.q,
          answer: f.a,
          status,
          source: 'generated' as const,
          tone: meta?.tone,
          language: meta?.language,
        })),
      );
    } catch (err) {
      /* The free tier's keep-limit. Caught rather than left to reject: the
         candidates are still on screen and still worth keeping, so the customer
         needs to be told which ones didn't fit rather than watching a save
         silently do nothing. */
      setCapError(
        err instanceof FaqCapReached
          ? `${site?.name ?? 'This site'} can hold ${err.cap} answers on the free tier, and saving these would go over. Get Cited removes the limit — everything already written stays.`
          : 'Those answers could not be saved. Please try again.',
      );
      setSaving(false);
      return;
    }

    setSaving(false);
    setCandidates(null);
    setMeta(null);
    // Show the customer where the answers went.
    setOpenGroupId(activeGroupId);
  }

  const targetGroup = groups.find((g) => g.id === activeGroupId) ?? null;

  return (
    <>
      <PageHeader
        title="Answers"
        description={`Questions and answers for ${site.name}, grouped by the page they go on. Each group gets its own block of code to paste.`}
        action={
          <Button size="sm" variant="ghost" onClick={() => setAddingGroup((v) => !v)}>
            <PlusIcon className="h-4 w-4" />
            New group
          </Button>
        }
      />

      <WorkspaceTabs tabs={ANSWER_TABS} label="Answers sections" />

      <div className="space-y-5">
        {capError && (
          <div role="alert" className="border-line bg-cloud rounded-xl border p-4">
            <p className="text-navy text-sm font-semibold">Not enough room to save these</p>
            <p className="text-slate mt-1 text-sm leading-relaxed">{capError}</p>
          </div>
        )}

        {addingGroup && (
          <GroupForm
            siteId={site.id}
            domain={site.domain}
            onDone={(createdId) => {
              setAddingGroup(false);
              if (createdId) setOpenGroupId(createdId);
            }}
          />
        )}

        {groups.length === 0 ? (
          <EmptyState
            title="No groups yet"
            body="A group is one page's worth of answers — your service page, your pricing page. Add the first one and you can start writing."
            action={<Button onClick={() => setAddingGroup(true)}>Add a group</Button>}
          />
        ) : (
          <>
            <GeneratorPanel
              disabled={saving}
              groups={groups}
              targetGroupId={activeGroupId}
              onTargetChange={setTargetGroupId}
              onGenerated={(generated, generationMeta) => {
                setCandidates(generated);
                setMeta(generationMeta);
              }}
            />

            {candidates && targetGroup && (
              <DraftReview
                candidates={candidates}
                destination={targetGroup.name}
                saving={saving}
                onSave={save}
                onDiscard={() => {
                  setCandidates(null);
                  setMeta(null);
                }}
              />
            )}

            {groups.map((group, i) => (
              <GroupCard
                key={group.id}
                group={group}
                domain={site.domain}
                isFirst={i === 0}
                isLast={i === groups.length - 1}
                // A lone group opens on arrival: collapsing the only thing on
                // the page leaves it looking empty, and there's nothing to scan
                // between when there's one of something.
                defaultOpen={groups.length === 1}
                forceOpen={openGroupId === group.id}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}

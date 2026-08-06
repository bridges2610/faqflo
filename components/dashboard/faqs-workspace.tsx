'use client';

import { useState } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { useDashboard } from '@/lib/dashboard/provider';
import type { Faq } from '@/lib/faq';
import { DraftReview } from './draft-review';
import { EmptyState } from './empty-state';
import { FaqList } from './faq-list';
import { GeneratorPanel, type GenerationMeta } from './generator-panel';
import { PageHeader } from './page-header';

/*
  The FAQs screen: generate → review → manage, top to bottom in the order the
  work actually happens.
*/
export function FaqsWorkspace() {
  const { site, faqs, addFaqs } = useDashboard();
  const [candidates, setCandidates] = useState<Faq[] | null>(null);
  const [meta, setMeta] = useState<GenerationMeta | null>(null);
  const [saving, setSaving] = useState(false);

  if (!site) {
    return (
      <>
        <PageHeader title="FAQs" description="Everything your customers ask, in one place." />
        <EmptyState
          title="Add a site first"
          body="FAQs belong to a site, so there's one thing to do before this page is useful."
          action={<ButtonLink href="/dashboard/setup">Go to setup</ButtonLink>}
        />
      </>
    );
  }

  async function save(kept: Faq[], status: 'draft' | 'published') {
    if (!site) return;
    setSaving(true);
    await addFaqs(
      site.id,
      kept.map((f) => ({
        question: f.q,
        answer: f.a,
        status,
        source: 'generated' as const,
        tone: meta?.tone,
        language: meta?.language,
      })),
    );
    setSaving(false);
    setCandidates(null);
    setMeta(null);
  }

  return (
    <>
      <PageHeader
        title="FAQs"
        description={`Questions and answers for ${site.name}. Published entries appear in your widget and in the schema answer engines read.`}
      />

      <div className="space-y-5">
        <GeneratorPanel
          disabled={saving}
          onGenerated={(generated, generationMeta) => {
            setCandidates(generated);
            setMeta(generationMeta);
          }}
        />

        {candidates && (
          <DraftReview
            candidates={candidates}
            saving={saving}
            onSave={save}
            onDiscard={() => {
              setCandidates(null);
              setMeta(null);
            }}
          />
        )}

        <FaqList siteId={site.id} faqs={faqs} />
      </div>
    </>
  );
}

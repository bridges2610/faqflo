'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDashboard } from '@/lib/dashboard/provider';
import { hasUnansweredReport } from '@/lib/dashboard/plans';
import { timeAgo } from '@/lib/dashboard/format';
import type { UnansweredQuery } from '@/lib/dashboard/types';
import { UpgradeCard } from './upgrade-card';

/*
  What people searched the widget for and didn't find.

  This is the most directly actionable thing in the dashboard — each row is a
  question a real customer asked that the site doesn't answer — so each row
  carries the action that fixes it: draft an FAQ from the query and take it to
  the FAQs page to answer.

  Business only, per the pricing page's "Unanswered-question report".
*/
function Row({ item, siteId }: { item: UnansweredQuery; siteId: string }) {
  const { addFaqs } = useDashboard();
  const [added, setAdded] = useState(false);

  async function draft() {
    // Sentence-cased and given a question mark, since these arrive as raw
    // search strings. The answer is left for a human — a placeholder answer
    // that got published would be worse than no FAQ at all.
    const question =
      item.query.trim().charAt(0).toUpperCase() +
      item.query.trim().slice(1) +
      (item.query.trim().endsWith('?') ? '' : '?');

    await addFaqs(siteId, [
      {
        question,
        answer: '',
        status: 'draft',
        source: 'manual',
      },
    ]);
    setAdded(true);
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-navy text-sm">{item.query}</p>
        <p className="text-slate mt-0.5 text-xs">
          Asked {item.count} times · last {timeAgo(item.lastAskedAt)}
        </p>
      </div>
      {added ? (
        <Badge tone="success">Drafted</Badge>
      ) : (
        <Button size="sm" variant="ghost" onClick={draft}>
          Draft an answer
        </Button>
      )}
    </li>
  );
}

export function UnansweredReport({
  unanswered,
  siteId,
}: {
  unanswered: UnansweredQuery[];
  siteId: string;
}) {
  const { plan } = useDashboard();

  if (!hasUnansweredReport(plan)) {
    return (
      <UpgradeCard
        title="Unanswered questions"
        body="See what people searched your widget for and didn't find — the questions your site doesn't answer yet, ranked by how often they're asked."
      />
    );
  }

  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg">Unanswered questions</h2>
          <p className="text-slate mt-1 text-sm">
            Searched for in your widget, with no published answer to match.
          </p>
        </div>
        <Badge tone="cyan">{unanswered.length}</Badge>
      </div>

      {unanswered.length === 0 ? (
        <p className="text-slate mt-4 text-sm">
          Nothing unanswered right now — every search matched a published FAQ.
        </p>
      ) : (
        <ul className="divide-line mt-3 divide-y">
          {unanswered.map((item) => (
            <Row key={item.query} item={item} siteId={siteId} />
          ))}
        </ul>
      )}
    </Card>
  );
}

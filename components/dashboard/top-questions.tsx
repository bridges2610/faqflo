'use client';

import { Card } from '@/components/ui/card';
import { formatNumber } from '@/lib/dashboard/format';
import { rankedQuestions } from '@/lib/dashboard/analytics';
import type { QuestionStat } from '@/lib/dashboard/types';

/*
  Which questions people actually open.

  A ranked horizontal bar, one series, so there's no legend and no second hue —
  the bar length is the whole encoding and every value is labelled directly.
  Sorted by expands rather than views: a question that's shown and skipped isn't
  the one your customers care about.
*/
export function TopQuestions({
  questions,
  limit = 8,
}: {
  questions: QuestionStat[];
  limit?: number;
}) {
  const ranked = rankedQuestions(questions, limit);
  const max = Math.max(...ranked.map((q) => q.expands), 1);
  const hidden = questions.length - ranked.length;

  return (
    <Card className="p-5 sm:p-7">
      <h2 className="text-lg">Most-read answers</h2>
      <p className="text-slate mt-1 text-sm">
        Ranked by how often someone opened the answer.
      </p>

      <ul className="mt-5 space-y-4">
        {ranked.map((q) => (
          <li key={q.faqId}>
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-navy min-w-0 text-sm leading-snug">{q.question}</p>
              <p className="text-navy shrink-0 text-sm font-semibold tabular-nums">
                {formatNumber(q.expands)}
              </p>
            </div>
            <div className="bg-cloud mt-1.5 h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full"
                style={{ width: `${Math.max(2, (q.expands / max) * 100)}%` }}
              />
            </div>
            <p className="text-slate mt-1 text-xs tabular-nums">
              {formatNumber(q.views)} views ·{' '}
              {q.views === 0 ? '0' : ((q.expands / q.views) * 100).toFixed(0)}% opened
            </p>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <p className="text-slate mt-5 text-xs">
          {hidden} more {hidden === 1 ? 'question' : 'questions'} not shown.
        </p>
      )}
    </Card>
  );
}

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

/**
 * What a panel shows before there's anything in it.
 *
 * Always carries the action that fills it. An empty state that only says
 * "nothing here yet" leaves the user to work out what to do next, which is the
 * one thing they can't do at that moment.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card tone="cloud" className="px-6 py-12 text-center">
      <h3 className="text-lg">{title}</h3>
      <p className="text-slate mx-auto mt-2 max-w-md text-[0.9375rem] leading-relaxed">{body}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </Card>
  );
}

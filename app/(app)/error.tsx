'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/*
  The dashboard's error boundary.

  Without one, anything thrown while rendering a workspace escapes to the root
  and takes the whole app to Next's default error page — no nav, no way back,
  and on a phone no obvious next move. The route group is the right level: an
  error inside Answers should not lose you the sidebar.

  It deliberately does not show `error.message`. These messages are written for
  whoever is reading a stack trace, not for the person whose site this is, and a
  raw one here reads as the product being broken in a way they caused. The digest
  is shown instead — it is the thing support can actually look up.

  reset() re-renders the segment. That fixes a transient failure and does nothing
  for a persistent one, so there is a second way out beside it.
*/
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <Card className="p-7 sm:p-9">
      <h1 className="text-[1.5rem]">Something went wrong on this screen</h1>
      <p className="text-slate mt-3 text-[0.9375rem] leading-relaxed">
        Your sites, answers and audits are safe — this is a problem drawing the page, not with
        anything you have made. Trying again usually clears it.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/dashboard" variant="ghost">
          Back to home
        </ButtonLink>
      </div>

      {error.digest && (
        <p className="text-slate mt-6 font-mono text-xs">
          Reference: {error.digest} — quote this if you get in touch.
        </p>
      )}
    </Card>
  );
}

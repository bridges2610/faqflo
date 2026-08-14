import { redirect } from 'next/navigation';

/*
  The plain-English summary used to live here, on its own route, reached by a
  small "What this means for me →" button inside the audit's score card. It is
  now the DEFAULT view of /dashboard/audit, behind a toggle — a report written
  for the business owner should not be the one you have to go looking for.

  Kept as a redirect rather than deleted: this URL has been linked from the
  audit page and from the summary's own footer, and anyone who bookmarked or
  printed it has it.

  ⚠️ redirect(), not permanentRedirect(). A 308 is cached hard by browsers and
  is very difficult to undo for people who have already hit it — which matters
  if this view ever earns its own URL again. A 307 costs one hop and stays
  reversible.
*/
export default function AuditSummaryPage() {
  redirect('/dashboard/audit');
}

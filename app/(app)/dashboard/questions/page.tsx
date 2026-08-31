import { redirect } from 'next/navigation';

/*
  Absorbed by Answers.

  ⚠️ THE ROUTE STAYS, AND THAT IS THE WHOLE JOB OF THIS FILE. A dozen places
  still link here — lib/dashboard/worklist.ts builds action items pointing at
  these paths, audit-context.ts recommends them, help-workspace.tsx documents
  them, and the audit deep-links into them. Deleting the route would turn every
  one of those into a 404; redirecting keeps them all landing somewhere true.

  See the note on NAV in components/dashboard/app-shell.tsx: labels changed when
  the sidebar was rewritten, URLs did not.
*/
export default function QuestionsPage() {
  redirect('/dashboard/faqs');
}

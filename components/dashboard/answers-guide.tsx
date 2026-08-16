import { Card } from '@/components/ui/card';
import { SectionTitle } from './section-title';

/*
  How Answers works, in the order you do it.

  ⚠️ ONE COPY, RENDERED TWICE. This appears in the empty state and again as a
  reference once pages exist. Writing the steps out in both places is how the
  two drift until one of them names a button that has since been renamed —
  exactly what happened between who-and-features.tsx and the pricing card, under
  a comment promising it couldn't.

  ⚠️ EVERY BOLD PHRASE IS A REAL LABEL. "New page", "Generate FAQs", "Publish N",
  "Save as drafts", "Write one", "Get the code →", "I've pasted it". If a button
  is renamed, it is renamed here in the same commit — instructions that name a
  control the screen doesn't have are worse than no instructions, because the
  reader assumes they are the one who is lost.

  EmptyState makes the case for existing at all: "An empty state that only says
  'nothing here yet' leaves the user to work out what to do next, which is the
  one thing they can't do at that moment." It carries the action; this carries
  the route through the whole job.
*/

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Add a page',
    body: (
      <>
        <strong>New page</strong>, top right. Give it a name and the path it publishes to, like{' '}
        <code className="text-navy font-mono text-xs">/services</code>. Use a page that really
        exists — the code you paste tells assistants your answers live at that address.
      </>
    ),
  },
  {
    title: 'Open it and generate',
    body: (
      <>
        Click the page, then <strong>Generate FAQs</strong> from your own text or a URL. There is
        nothing to choose about where they go: the page you are on is where they land.
      </>
    ),
  },
  {
    title: 'Keep the good ones',
    body: (
      <>
        Untick anything you don’t want, then <strong>Publish</strong> them or{' '}
        <strong>Save as drafts</strong>. Drafts stay here until you’re happy with them — only
        published answers go into the code you paste.
      </>
    ),
  },
  {
    title: 'Fill the gaps',
    body: (
      <>
        <strong>Write one</strong> for anything the model missed, and edit any answer in place.
        Questions you draft from Opportunities arrive with no answer yet — they show up under{' '}
        <strong>Needs an answer</strong>.
      </>
    ),
  },
  {
    title: 'Put it on your site',
    body: (
      <>
        <strong>Get the code →</strong>, paste the block onto that page of your site, then press{' '}
        <strong>I’ve pasted it</strong>. Nothing can be quoted until it is on your own domain.
      </>
    ),
  },
];

function Steps() {
  return (
    <>
      <ol className="mt-4 space-y-3 text-left">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="bg-primary-soft text-primary mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-bold">
              {i + 1}
            </span>
            <p className="text-slate text-[0.9375rem] leading-relaxed">
              <span className="text-navy font-semibold">{step.title}.</span> {step.body}
            </p>
          </li>
        ))}
      </ol>

      {/* The state customers otherwise meet by accident: they change an answer,
          the badge moves, and nothing has told them what to do about it. */}
      <p className="text-slate border-line mt-4 border-t pt-4 text-sm leading-relaxed">
        After that the page reads <strong className="text-navy">Live</strong>. Change an answer and
        it flips to <strong className="text-navy">Out of date</strong> — that is your cue to copy
        the block again and re-paste it. We can’t see your site, so it’s the one part we have to
        ask you to confirm.
      </p>
    </>
  );
}

/** Full, for the empty state — there is nothing else on the screen to read. */
export function AnswersGuide() {
  return (
    <Card className="p-5 sm:p-7">
      <SectionTitle as="h3">How answers get onto your site</SectionTitle>
      <Steps />
    </Card>
  );
}

/**
 * Collapsed, for when pages already exist.
 *
 * `<details>` rather than a state hook or a stored "dismissed" flag: the app
 * already uses it for disclosure, it survives a reload without persisting
 * anything, and there is no dismissal state to get wrong. Closed by default —
 * someone with pages has done this before.
 */
export function AnswersGuideSummary() {
  return (
    <Card className="p-4 sm:p-5">
      <details className="group">
        <summary className="text-slate hover:text-navy cursor-pointer list-none text-sm font-semibold transition-colors duration-150">
          <span className="group-open:hidden">How answers get onto your site →</span>
          <span className="hidden group-open:inline">Hide</span>
        </summary>
        <Steps />
      </details>
    </Card>
  );
}

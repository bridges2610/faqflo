/*
  A quiet "show me the rest" toggle.

  ⚠️ THIS IS THE FIFTH SPELLING OF A DISCLOSURE IN THIS CODEBASE, AND IT EXISTS
  TO STOP THERE BEING A SIXTH. The others, and why they are not this:

    components/ui/faq-item.tsx        — public FAQ accordion. Its `answer` is a
                                        STRING, because site-faq.tsx builds
                                        FAQPage JSON-LD out of the same strings.
                                        It cannot take children.
    help-workspace.tsx `Disclosure`   — the same shape as this one, but its
                                        summary is a full-width question in navy
                                        semibold. That is a heading; this is an
                                        aside.
    publish-workspace.tsx (inline)    — what this was extracted from.
    answers-guide.tsx                 — swaps its own label with group-open,
                                        which needs two spans rather than a prop.

  Anything that wants a quiet grey toggle with a rotating caret should import
  this rather than write the classes again. `micro-label.tsx` and
  `section-title.tsx` were both written after the same thing happened to a
  label and a card title.

  ⚠️ NATIVE <details>, AND THAT HAS ONE CONSEQUENCE WORTH KNOWING. Closed
  content is in the DOM but window.print() will not reveal it, which is why
  audit-summary.tsx's Collapsible is React state plus `hidden print:block`
  instead. No caller of this is printable today. If one becomes printable, it
  needs that component, not this one.
*/
export function Disclosure({
  label,
  children,
  className = '',
}: {
  /**
   * What opening it gets you.
   *
   * ⚠️ Say the thing, not the gesture — "Show me the code" beats "More". A
   * reader deciding whether to open it is deciding whether they want what is
   * inside, and a bare chevron makes them open it to find out. Same argument
   * audit-summary.tsx's Collapsible makes for "Show all 14".
   */
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={`group ${className}`}>
      <summary className="text-slate hover:text-primary flex cursor-pointer list-none items-center gap-1.5 text-sm transition-colors duration-150 [&::-webkit-details-marker]:hidden">
        <span
          className="text-slate/60 transition-transform duration-200 group-open:rotate-90"
          aria-hidden="true"
        >
          ▸
        </span>
        {label}
      </summary>

      {/* ⚠️ The indent is what ties the panel to its toggle, so it stays — but
          it shrinks on a phone. This wraps code blocks: 20px here, nested
          inside a card's own padding, was leaving a preformatted snippet about
          240px of visible width at 360px. The indent still reads at 12px, and
          the content that needed the room gets it back. */}
      <div className="mt-3 pl-3 sm:pl-5">{children}</div>
    </details>
  );
}

/*
  Accordion built on <details>/<summary>.

  Deliberately not a React-state accordion: FaqFlo's whole promise is that these
  answers get read and quoted by crawlers and AI assistants, so the question and
  the answer must both be in the server HTML and openable with JavaScript
  disabled. <details> gives us that for free, plus correct keyboard behaviour.

  The toggle is a blue + that becomes a – : the vertical stroke collapses when
  the item opens.
*/
export function FaqItem({
  question,
  answer,
  defaultOpen = false,
  className = '',
}: {
  question: string;
  answer: string;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details open={defaultOpen} className={`group ${className}`}>
      <summary className="flex cursor-pointer list-none items-start gap-4 py-5 [&::-webkit-details-marker]:hidden">
        <h3 className="font-display text-navy flex-1 text-[1.0625rem] leading-snug font-bold">
          {question}
        </h3>

        <span
          className="bg-accent-soft text-primary group-hover:bg-brand-gradient-bright group-hover:text-navy mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-200"
          aria-hidden="true"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            {/* horizontal stroke — always visible */}
            <rect x="1" y="6.25" width="12" height="1.5" rx="0.75" fill="currentColor" />
            {/* vertical stroke — collapses to make a minus */}
            <rect
              x="6.25"
              y="1"
              width="1.5"
              height="12"
              rx="0.75"
              fill="currentColor"
              className="origin-center transition-transform duration-200 ease-bounce group-open:scale-y-0"
            />
          </svg>
        </span>
      </summary>

      <p className="text-slate max-w-2xl pr-11 pb-5 text-[0.9375rem] leading-[1.75]">{answer}</p>
    </details>
  );
}

import { Fragment, type ReactNode } from 'react';
import { parseAnswer, type Token } from '@/lib/dashboard/answer-markdown';

/*
  What an answer engine actually said, rendered.

  The engines reply in Markdown — bold company names, italic addresses, inline
  links — and this used to be printed into a <p>, so opening "View the answer"
  showed `**[Gikas Roofing](https://…)**` instead of a linked, bold name.

  ⚠️ THIS FILE MUST NEVER USE dangerouslySetInnerHTML. The text is untrusted
  model output. Everything below emits React elements, whose text content React
  escapes by construction, so there is no injection surface and no sanitiser to
  get wrong. Building an HTML string here would trade a property that holds
  automatically for one that has to be maintained.

  The parsing — including which hrefs are allowed — lives in
  lib/dashboard/answer-markdown.ts so it can be tested without a renderer.
*/

function render(
  tokens: Token[],
  keyPrefix = '',
  isHighlighted?: (href: string) => boolean,
): ReactNode {
  return tokens.map((token, i) => {
    const key = `${keyPrefix}${i}`;

    switch (token.type) {
      case 'bold':
        return (
          <strong key={key} className="text-navy font-semibold">
            {render(token.children, `${key}.`, isHighlighted)}
          </strong>
        );

      case 'italic':
        return <em key={key}>{render(token.children, `${key}.`, isHighlighted)}</em>;

      case 'link': {
        /*
          The marked link is still a link, and still escaped.

          ⚠️ THE HIGHLIGHT IS A CLASS ON THE SAME ANCHOR, NOT A WRAPPER AROUND
          INJECTED MARKUP. Marking a name inside somebody else's answer is
          exactly the feature that tempts a `dangerouslySetInnerHTML`, and the
          header of this file rules that out. Deciding a boolean per token and
          changing a className keeps the escaping React gives us for free.

          bg-accent-soft with navy text: --color-accent is fill-only at 1.9:1,
          so the tint carries the mark and the text stays readable.
        */
        const marked = isHighlighted?.(token.href) ?? false;

        return (
          <a
            key={key}
            href={token.href}
            target="_blank"
            rel="noreferrer"
            className={
              marked
                ? 'bg-accent-soft text-navy rounded px-1 font-semibold underline underline-offset-2'
                : 'text-primary hover:text-primary-hover underline underline-offset-2'
            }
          >
            {render(token.children, `${key}.`, isHighlighted)}
          </a>
        );
      }

      default:
        return <Fragment key={key}>{token.text}</Fragment>;
    }
  });
}

export function AnswerText({
  text,
  className = '',
  highlightLink,
}: {
  text: string;
  className?: string;
  /**
   * Mark the links this returns true for.
   *
   * Used by the Free page to point at the domain an engine cited instead of the
   * customer. Optional, and off everywhere else: the Results page shows every
   * answer in a list, where marking one name in each would be noise rather than
   * a finding.
   *
   * ⚠️ A PREDICATE OVER hrefs, NOT A STRING TO FIND IN THE TEXT. Searching the
   * prose for a name is the version of this feature that ends in a regex over
   * untrusted model output and then in an HTML string. This never leaves the
   * token tree — see the note on the link branch above.
   */
  highlightLink?: (href: string) => boolean;
}) {
  const blocks = parseAnswer(text);

  return (
    <div className={`space-y-2.5 ${className}`}>
      {blocks.map((block, b) =>
        block.type === 'list' ? (
          /*
            ⚠️ list-outside, SO THE SECOND LINE OF AN ITEM LINES UP UNDER THE
            FIRST. These items are a business name and a sentence about it, so
            most of them wrap; with the marker inside the box the wrapped text
            slides back under the bullet and the list stops looking like one.
            pl-5 is what leaves the marker somewhere to sit.

            Tighter than the prose around it (space-y-1 against space-y-2.5): a
            list of businesses is one answer, not five paragraphs.
          */
          <ul key={b} className="list-disc space-y-1 pl-5 marker:text-slate/40">
            {block.items.map((item, i) => (
              <li key={i} className="text-slate text-sm leading-relaxed">
                {render(item, `${b}.${i}.`, highlightLink)}
              </li>
            ))}
          </ul>
        ) : (
          <p key={b} className="text-slate text-sm leading-relaxed">
            {block.lines.map((line, l) => (
              <Fragment key={l}>
                {l > 0 && <br />}
                {render(line, `${b}.${l}.`, highlightLink)}
              </Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  );
}

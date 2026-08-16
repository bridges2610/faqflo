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

function render(tokens: Token[], keyPrefix = ''): ReactNode {
  return tokens.map((token, i) => {
    const key = `${keyPrefix}${i}`;

    switch (token.type) {
      case 'bold':
        return (
          <strong key={key} className="text-navy font-semibold">
            {render(token.children, `${key}.`)}
          </strong>
        );

      case 'italic':
        return <em key={key}>{render(token.children, `${key}.`)}</em>;

      case 'link':
        return (
          <a
            key={key}
            href={token.href}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:text-primary-hover underline underline-offset-2"
          >
            {render(token.children, `${key}.`)}
          </a>
        );

      default:
        return <Fragment key={key}>{token.text}</Fragment>;
    }
  });
}

export function AnswerText({ text, className = '' }: { text: string; className?: string }) {
  const paragraphs = parseAnswer(text);

  return (
    <div className={`space-y-2 ${className}`}>
      {paragraphs.map((lines, p) => (
        <p key={p} className="text-slate text-sm leading-relaxed">
          {lines.map((line, l) => (
            <Fragment key={l}>
              {l > 0 && <br />}
              {render(line, `${p}.${l}.`)}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}

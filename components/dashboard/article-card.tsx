'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  buildArticleBlock,
  buildArticlePlain,
} from '@/lib/dashboard/export';
import { formatPlainDate } from '@/lib/dashboard/format';
import { canPublish } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { useCopy } from '@/lib/dashboard/use-copy';
import type { Article } from '@/lib/dashboard/types';
import { CopyIcon, LockIcon, TickIcon, TrashIcon } from './nav-icons';

/*
  One finished article.

  ⚠️ THE TWO COPY BUTTONS SPLIT THE SAME WAY copy-html-button.tsx DOES, AND FOR
  THE SAME REASON. "Copy article" is the words, and it is never gated on any
  plan — that is the honest version of "your words are yours" that the pricing
  page promises. "Copy code" is the HTML plus the schema markup, which is most
  of what Pro sells, so it checks canPublish() and turns into a link to the plan
  when the subscription has lapsed.

  A lapsed customer therefore keeps everything they wrote and loses only the
  publish-ready markup. Getting that backwards would take their writing away.

  ⚠️ NO DRIFT TRACKING — WHICH IS NOT THE SAME AS NO EDITING, AND THIS NOTE
  USED TO CONFLATE THEM. An article has no stored path, so nothing here can tell
  whether the copy on the customer's site still matches, the way publishState()
  does for a group. That was once given as the reason articles were read-only,
  and the conclusion was wrong: not knowing what is on their site is no reason
  to stop somebody fixing a draft before they paste it.

  Editing lives on the article's own page — components/dashboard/article-workspace.tsx.
  What stays true is the first half: this product does not claim to know what is
  published, and no badge here should ever imply it does.
*/

/** Copy one string, with the state and labels the two buttons share. */
function CopyButton({
  text,
  label,
  done,
}: {
  text: string;
  label: string;
  done: string;
}) {
  const { copied, copy } = useCopy();

  return (
    <Button size="sm" variant="ghost" onClick={() => copy(text)} disabled={!text}>
      {copied ? <TickIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
      {copied ? done : label}
    </Button>
  );
}

export function ArticleCard({ article }: { article: Article }) {
  const { site, user, removeArticle } = useDashboard();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const plain = buildArticlePlain(article);
  const code = site ? buildArticleBlock(site, article) : '';

  return (
    <Card as="li" className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-navy text-[0.9375rem] leading-snug font-semibold">{article.title}</h3>
          <p className="text-slate mt-1 text-xs">
            {/* ⚠️ The count is the MEASURED one — see Article.wordCount. */}
            {article.wordCount.toLocaleString()} words · written{' '}
            {formatPlainDate(article.createdAt)}
          </p>
        </div>
        <Badge tone="neutral">
          {article.sections.length} {article.sections.length === 1 ? 'section' : 'sections'}
        </Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/* ⚠️ THE PRIMARY WAY IN IS THE PAGE, NOT THIS PREVIEW. The article has
            its own URL now — that is where editing is, and where writing one
            lands you — so the card's job is to get you there. The inline
            preview stays for a quick look without leaving the list. */}
        <ButtonLink href={`/dashboard/faqs/article/${article.id}`} size="sm">
          Open
        </ButtonLink>
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Quick look'}
        </Button>

        {/* ⚠️ GHOST, NOT FILLED, EVEN THOUGH THIS IS THE ACTION MOST PEOPLE
            WANT. One filled button per card becomes ten filled buttons down a
            page of ten articles, which is the emphasis rule failing by
            repetition rather than by any single card being wrong. Order carries
            the priority instead: read it, take the words, take the code. */}
        <CopyButton text={plain} label="Copy article" done="Copied" />

        {canPublish(user) ? (
          <CopyButton text={code} label="Copy code" done="Code copied" />
        ) : (
          /* ⚠️ LOCKED IS NOT DISABLED. It says what it needs and goes there,
             rather than sitting greyed out with no explanation. */
          <ButtonLink href="/dashboard/plan" size="sm" variant="ghost">
            <LockIcon className="h-4 w-4" />
            Code needs Pro
          </ButtonLink>
        )}

        <button
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${article.title}`}
          className="text-slate hover:text-error-ink ml-auto rounded-md p-1.5 transition-colors duration-150"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      {/* ⚠️ THE CONSEQUENCE THAT SURPRISES PEOPLE IS STATED BEFORE THE BUTTON.
          Deleting does NOT give the month back — the article was paid for when
          it was written. See ARTICLE_CAP in plans.ts. */}
      {confirming && (
        <div className="border-line bg-cloud mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <p className="text-slate text-sm">
            Delete this article? It does not give you the month back, and you can&rsquo;t undo it.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await removeArticle(article.id);
                setConfirming(false);
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      )}

      {open && (
        <div className="border-line mt-4 border-t pt-4">
          {/* ⚠️ REAL <h2> AND <p> ELEMENTS, MATCHING WHAT THE PASTE BLOCK EMITS.
              A preview styled with divs would let a heading problem hide until
              it was on the customer's site. */}
          {article.intro
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p, i) => (
              <p key={i} className="text-slate mt-2 text-sm leading-relaxed first:mt-0">
                {p}
              </p>
            ))}

          {article.sections.map((section, i) => (
            <div key={i} className="mt-5">
              {/* ⚠️ A REAL HEADING SIZE. This was text-sm, which made an H2 look
                  like bold body copy — so a structure problem stayed invisible
                  until the block was on the customer's site. The article page
                  renders these larger still; this is the compact version. */}
              <h2 className="text-navy font-display text-base leading-snug font-bold">
                {section.heading}
              </h2>
              {section.body
                .split(/\n{2,}/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((p, j) => (
                  <p key={j} className="text-slate mt-2 text-sm leading-relaxed">
                    {p}
                  </p>
                ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

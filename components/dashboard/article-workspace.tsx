'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MAX_ARTICLE_WORDS, countWords } from '@/lib/article';
import { answersTabHref } from '@/lib/dashboard/answers-tabs';
import { buildArticleBlock, buildArticlePlain } from '@/lib/dashboard/export';
import { formatPlainDate } from '@/lib/dashboard/format';
import { canPublish } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { useCopy } from '@/lib/dashboard/use-copy';
import type { Article, ArticleFaq, ArticleSection } from '@/lib/dashboard/types';
import type { Faq } from '@/lib/faq';
import { EmptyState } from './empty-state';
import { SectionTitle } from './section-title';
import { EmbedInstructions } from './embed-instructions';
import { CopyIcon, DocIcon, FaqIcon, LockIcon, PlusIcon, TickIcon, TrashIcon } from './nav-icons';
import { PageHeader } from './page-header';

/*
  One article, on its own page — where writing it lands you.

  ⚠️ THIS ROUTE EXISTS SO THERE IS SOMEWHERE TO BE SENT. The modal that runs
  while an article is written needs a destination, and "the Articles tab with
  one card expanded" is not a place — it has no URL, so it cannot be linked,
  bookmarked or reached with the back button.

  ⚠️ EDITING IS ALLOWED HERE, WHICH REVERSES A NOTE ON article-card.tsx. That
  note argued an article should not be editable because FaqFlo has no stored
  path for it, so nothing can tell whether the live copy has drifted the way
  publishState() does for a group — offering an editor implied a link to their
  page that does not exist.

  The first half is still true and the conclusion was wrong. We still do not
  know what is on their site, and this screen never claims to; what it does is
  let somebody fix a draft before they paste it, which is the most ordinary
  thing to want and was the one thing they could not do. Read the header of
  article-card.tsx as: no drift tracking, not no editing.
*/

/** Paragraphs from one blank-line-separated body. Matches the paste block. */
function paragraphs(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function ArticleWorkspace({ articleId }: { articleId: string }) {
  const router = useRouter();
  const { site, user, articles, editArticle, removeArticle } = useDashboard();

  const article = articles.find((a) => a.id === articleId) ?? null;

  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!site || !article) {
    /* A missing article is a normal state, not an error: the id comes from the
       URL, and deleting one or switching sites leaves a link pointing at
       nothing. Say so and offer the way back. */
    return (
      <>
        <PageHeader title="Article" description="One piece of writing for your site." />
        <EmptyState
          title="That article isn’t here"
          body="It may have been deleted, or it belongs to a different site than the one selected."
          action={<ButtonLink href={answersTabHref('articles')}>Back to articles</ButtonLink>}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={article.title}
        description={`${article.wordCount.toLocaleString()} words · written ${formatPlainDate(article.createdAt)}`}
        action={
          <ButtonLink href={answersTabHref('articles')} variant="ghost" size="sm">
            All articles
          </ButtonLink>
        }
      />

      {editing ? (
        <ArticleEditor
          article={article}
          onCancel={() => setEditing(false)}
          onSave={async (patch) => {
            await editArticle(article.id, patch);
            setEditing(false);
          }}
        />
      ) : (
        <div className="space-y-5">
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge tone={article.wordCount > MAX_ARTICLE_WORDS ? 'neutral' : 'success'}>
                {/* ⚠️ THE MEASURED COUNT, not the one asked for. countWords()
                    is the only thing that sets it — see Article.wordCount. */}
                {article.wordCount.toLocaleString()} of {MAX_ARTICLE_WORDS.toLocaleString()} words
              </Badge>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <CopyButton text={buildArticlePlain(article)} label="Copy article" done="Copied" />
                {canPublish(user) ? (
                  <CopyButton
                    text={buildArticleBlock(site, article)}
                    label="Copy code"
                    done="Code copied"
                  />
                ) : (
                  /* ⚠️ LOCKED IS NOT DISABLED. It says what it needs and goes
                     there, rather than sitting greyed out with no explanation. */
                  <ButtonLink href="/dashboard/plan" size="sm" variant="ghost">
                    <LockIcon className="h-4 w-4" />
                    Code needs Pro
                  </ButtonLink>
                )}
                <button
                  onClick={() => setConfirming(true)}
                  aria-label={`Delete ${article.title}`}
                  className="text-slate hover:text-error-ink rounded-input p-1.5 transition-colors duration-150"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* ⚠️ THE CONSEQUENCE THAT SURPRISES PEOPLE IS STATED BEFORE THE
                BUTTON. Deleting does not give the month back — the article was
                paid for when it was written. See ARTICLE_CAP in plans.ts. */}
            {confirming && (
              <div className="border-line bg-cloud mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                <p className="text-slate text-sm">
                  Delete this article? It does not give you the month back, and you can&rsquo;t undo
                  it.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    Keep it
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await removeArticle(article.id);
                      router.push(answersTabHref('articles'));
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* ⚠️ REAL <h1> AND <h2> ELEMENTS AT REAL HEADING SIZES, matching what
              buildArticleHtml() emits. The preview used to render headings at
              text-sm, which made an H2 look like bold body copy and hid
              structure problems until the thing was on the customer's site. */}
          <Card as="article" className="p-6 sm:p-8">
            <h1 className="text-navy font-display text-2xl leading-tight font-extrabold sm:text-3xl">
              {article.title}
            </h1>

            {paragraphs(article.intro).map((p, i) => (
              <p key={i} className="text-slate mt-4 text-base leading-relaxed">
                {p}
              </p>
            ))}

            {article.sections.map((section, i) => (
              <section key={i} className="mt-8">
                <h2 className="text-navy font-display text-xl leading-snug font-bold sm:text-2xl">
                  {section.heading}
                </h2>
                {paragraphs(section.body).map((p, j) => (
                  <p key={j} className="text-slate mt-3 text-base leading-relaxed">
                    {p}
                  </p>
                ))}
              </section>
            ))}

            {/* ⚠️ INSIDE THE SAME <article>, AT THE FOOT, MATCHING WHAT
                buildArticleHtml() EMITS — <h3> under the section <h2>s, so the
                outline on screen is the outline that gets pasted. */}
            {article.faqs.length > 0 && (
              <section className="border-line mt-10 border-t pt-6">
                <h2 className="text-navy font-display text-xl leading-snug font-bold sm:text-2xl">
                  Frequently asked questions
                </h2>
                <dl className="mt-4 space-y-5">
                  {article.faqs.map((faq, i) => (
                    <div key={i}>
                      <dt className="text-navy text-base font-semibold">{faq.q}</dt>
                      <dd className="text-slate mt-1.5 text-base leading-relaxed">{faq.a}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </Card>

          <AddFaqs article={article} />

          {/* ⚠️ THE ARTICLE'S "COPY CODE" HAD NO GUIDANCE BESIDE IT AT ALL. It
              hands over HTML and JSON-LD and then said nothing about where any
              of it goes — the Answers sets got instructions in the same change
              that gave them their own copy block, and this page was missed.

              Exposed rather than behind a disclosure, and compact: it is a
              footnote under the buttons, not the subject of the screen. Full
              size stays on publish-workspace.tsx, where it is the subject. */}
          <Card className="p-5">
            <SectionTitle icon={<DocIcon className="h-4 w-4" />} tint="bg-cloud text-slate">
              How to add it to your site
            </SectionTitle>
            <p className="text-slate mt-1 text-sm leading-relaxed">
              Copy the code above, then follow the steps for whatever your site is built with.
            </p>
            <EmbedInstructions compact />
          </Card>
        </div>
      )}
    </>
  );
}

/**
 * Turn the finished article into short answers.
 *
 * ⚠️ THIS IS WHERE FAQs ARE MADE NOW, AND THE MOVE IS THE POINT. The Write
 * about tab used to offer "Article / FAQ / Both" on every topic row, which was
 * three buttons per row and a worse result: those FAQs were written from a
 * one-line brief. These get the whole article — the owner's own framing, in
 * their own words — which is far better material for a short answer.
 *
 * ⚠️ NO NEW ENDPOINT. /api/dashboard/generate already takes arbitrary text, is
 * already rate-limited and Pro-gated, and is what the Answers tab uses. The
 * article's plain text is just another piece of source material to it.
 *
 * ⚠️ THEY LAND AS DRAFTS. Only 'published' entries reach the export, so nothing
 * generated here can appear on the customer's site until they have read it and
 * pressed Publish. Standing rule for generated answers.
 */
function AddFaqs({ article }: { article: Article }) {
  const { site, editArticle } = useDashboard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);

  async function add() {
    if (!site) return;
    setError(null);
    setBusy(true);

    try {
      const res = await fetch('/api/dashboard/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: buildArticlePlain(article),
          count: 5,
          tone: 'Professional',
          language: 'English',
          siteId: site.id,
        }),
      });

      const payload = (await res.json()) as { faqs?: Faq[]; error?: string };
      if (!res.ok || !payload.faqs) {
        setError(payload.error ?? 'Those answers could not be written. Please try again.');
        return;
      }

      const kept = payload.faqs
        .filter((f) => f.q?.trim() && f.a?.trim())
        .map((f) => ({ q: f.q.trim(), a: f.a.trim() }));

      if (kept.length === 0) {
        setError('Nothing came back that was worth keeping. Try again.');
        return;
      }

      /* ⚠️ SAVED ONTO THE ARTICLE, NOT INTO THE ANSWERS LIST. They used to go
         through addFaqs() into a group, which put them on the Answers tab — a
         second home for something that belongs to this piece and should be
         deleted with it. See ArticleFaq in types.ts.

         Appended rather than replaced, so pressing this twice adds more instead
         of quietly throwing the first set away. */
      await editArticle(article.id, {
        title: article.title,
        intro: article.intro,
        sections: article.sections,
        faqs: [...article.faqs, ...kept],
      });
      setAdded(kept.length);
    } catch {
      setError('Could not reach the writer. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card tone="cloud" className="p-5">
      <SectionTitle icon={<FaqIcon className="h-4 w-4" />} tint="bg-primary-soft text-primary">
        Add FAQs about this
      </SectionTitle>
      <p className="text-slate mt-1 text-sm leading-relaxed">
        Five short answers, written from this article. They sit at the bottom of it and go out with
        it when you copy the code — schema included. They don&rsquo;t count against your monthly
        articles.
      </p>

      {added === null ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={busy} onClick={add}>
            {busy ? 'Writing…' : 'Add FAQs'}
          </Button>
          {error && (
            <p role="alert" className="text-error-ink text-sm">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-success-ink text-sm font-semibold">
            Added {added} {added === 1 ? 'answer' : 'answers'} as drafts.
          </p>
          <p className="text-slate text-sm">They&rsquo;re at the foot of the article.</p>
        </div>
      )}
    </Card>
  );
}

/** Copy one string, with the shared state and labels. */
function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const { copied, copy } = useCopy();

  return (
    <Button size="sm" variant="ghost" onClick={() => copy(text)} disabled={!text}>
      {copied ? <TickIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
      {copied ? done : label}
    </Button>
  );
}

/**
 * The editor.
 *
 * ⚠️ SEEDED ONCE FROM PROPS AND THEN OWNED BY THE FORM. Re-syncing from the
 * article on every render would overwrite what somebody is typing the moment
 * any other part of the dashboard re-rendered. Cancel discards; Save writes.
 *
 * ⚠️ THE WORD COUNT SHOWN WHILE TYPING IS countWords() ON THE DRAFT, the same
 * function the save uses. Two ways of counting would let the number move when
 * you pressed Save.
 */
function ArticleEditor({
  article,
  onCancel,
  onSave,
}: {
  article: Article;
  onCancel: () => void;
  onSave: (patch: {
    title: string;
    intro: string;
    sections: ArticleSection[];
    faqs: ArticleFaq[];
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState(article.title);
  const [intro, setIntro] = useState(article.intro);
  const [sections, setSections] = useState<ArticleSection[]>(article.sections);
  const [faqs, setFaqs] = useState<ArticleFaq[]>(article.faqs);
  const [saving, setSaving] = useState(false);

  const live = countWords({ title, intro, sections });
  const over = live > MAX_ARTICLE_WORDS;

  const setSection = (i: number, patch: Partial<ArticleSection>) =>
    setSections((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const setFaq = (i: number, patch: Partial<ArticleFaq>) =>
    setFaqs((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const field =
    'border-line bg-cloud text-navy focus:border-primary w-full rounded-input border px-3 py-2 outline-none transition-colors duration-150';

  return (
    <Card className="p-5 sm:p-7">
      <label className="block">
        <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
          Headline
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`${field} mt-1.5 text-lg font-semibold`}
        />
      </label>

      <label className="mt-5 block">
        <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
          Opening
        </span>
        <textarea
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={5}
          className={`${field} mt-1.5 resize-y text-sm leading-relaxed`}
        />
        <span className="text-slate mt-1 block text-xs">
          Leave a blank line between paragraphs.
        </span>
      </label>

      <ul className="mt-6 space-y-5">
        {sections.map((section, i) => (
          <li key={i} className="border-line rounded-xl border p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <label className="block">
                  <span className="text-slate font-mono text-[0.6875rem] tracking-wide uppercase">
                    Heading {i + 1}
                  </span>
                  <input
                    value={section.heading}
                    onChange={(e) => setSection(i, { heading: e.target.value })}
                    className={`${field} mt-1.5 text-[0.9375rem] font-semibold`}
                  />
                </label>
                <label className="mt-3 block">
                  <span className="sr-only">Text under heading {i + 1}</span>
                  <textarea
                    value={section.body}
                    onChange={(e) => setSection(i, { body: e.target.value })}
                    rows={6}
                    className={`${field} resize-y text-sm leading-relaxed`}
                  />
                </label>
              </div>

              <button
                onClick={() => setSections((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remove section ${i + 1}`}
                className="text-slate hover:text-error-ink rounded-input mt-6 p-1.5 transition-colors duration-150"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Button
        size="sm"
        variant="ghost"
        className="mt-4"
        onClick={() => setSections((prev) => [...prev, { heading: '', body: '' }])}
      >
        <PlusIcon className="h-4 w-4" />
        Add a section
      </Button>

      {/* ⚠️ THE ARTICLE'S OWN Q&As ARE EDITED HERE TOO. They are part of the
          article now — they publish inside its block and are deleted with it —
          so an editor that covered everything except its last section would be
          an odd exception to explain. */}
      {faqs.length > 0 && (
        <div className="border-line mt-6 border-t pt-5">
          <p className="text-navy text-sm font-semibold">Questions at the foot of the article</p>
          <ul className="mt-3 space-y-4">
            {faqs.map((faq, i) => (
              <li key={i} className="border-line rounded-xl border p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <label className="block">
                      <span className="sr-only">Question {i + 1}</span>
                      <input
                        value={faq.q}
                        onChange={(e) => setFaq(i, { q: e.target.value })}
                        className={`${field} text-sm font-semibold`}
                      />
                    </label>
                    <label className="mt-2 block">
                      <span className="sr-only">Answer to question {i + 1}</span>
                      <textarea
                        value={faq.a}
                        onChange={(e) => setFaq(i, { a: e.target.value })}
                        rows={3}
                        className={`${field} resize-y text-sm leading-relaxed`}
                      />
                    </label>
                  </div>
                  <button
                    onClick={() => setFaqs((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove question ${i + 1}`}
                    className="text-slate hover:text-error-ink rounded-input mt-1 p-1.5 transition-colors duration-150"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-line mt-6 flex flex-wrap items-center gap-3 border-t pt-5">
        <Button
          size="sm"
          disabled={saving || !title.trim()}
          onClick={async () => {
            setSaving(true);
            await onSave({ title, intro, sections, faqs });
            setSaving(false);
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>

        {/* ⚠️ OVER THE LIMIT IS A NOTE, NOT A BLOCK. The limit is what we ask
            the model for; it is not a rule about what the owner may write on
            their own site. Refusing to save their words would be this product
            overruling them about their own page. */}
        <p className={`text-sm ${over ? 'text-warn-ink' : 'text-slate'}`}>
          {live.toLocaleString()} of {MAX_ARTICLE_WORDS.toLocaleString()} words
          {over ? ' — longer than we aim for, but yours to keep' : ''}
        </p>
      </div>
    </Card>
  );
}

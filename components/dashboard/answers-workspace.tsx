'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MAX_ARTICLE_WORDS } from '@/lib/article';
import { useDashboard } from '@/lib/dashboard/provider';
import { exampleQuestion } from '@/lib/dashboard/questions';
import { FaqCapReached } from '@/lib/dashboard/store';
import type { Faq } from '@/lib/faq';
import type { FaqEntry, FaqGroup, Site } from '@/lib/dashboard/types';
import { ArticleCard } from './article-card';
import { WritePanel } from './write-panel';
import { DraftReview } from './draft-review';
import { EmptyState } from './empty-state';
import { FaqRow } from './faq-row';
import { ChevronIcon } from './nav-icons';
import { GeneratorPanel, type GenerationMeta } from './generator-panel';
import { DocIcon, FaqIcon, PlusIcon } from './nav-icons';
import { PageHeader } from './page-header';
import { SetPublish } from './set-publish';
import { SectionTitle } from './section-title';
import { ANSWER_TABS, answersTabHref, type AnswersTab } from '@/lib/dashboard/answers-tabs';
import { WorkspaceTabs } from './workspace-tabs';

/*
  Everything this site's content: making it, keeping it, publishing it.

  ⚠️ THIS ABSORBED THREE ROUTES AND THAT IS THE POINT. Answers, Publish and
  Opportunities were three destinations for one job — find a question nobody has
  answered, answer it, put it on your website. Splitting them meant the gap and
  the place you close it were never on screen together, and the copy block lived
  a click away from the thing being copied.

  ⚠️ AND IT NOW ABSORBS THE GENERATOR, WHICH HAD BECOME UNREACHABLE. Writing
  moved to /dashboard/faqs/[groupId] when this screen was flattened, and nothing
  linked there afterwards except one audit action — so a customer had no route
  to the model at all. That route still works and still owns per-page writing;
  the Create tab is the one anybody can find.

  ⚠️ THE PAGE STRUCTURE IS NOT THE DATA STRUCTURE, AND ONE GROUP IS WHY. Every
  function in lib/dashboard/export.ts takes a single FaqGroup — the block, its
  schema, its URL, its published hash. A flat list therefore needs one group per
  site. Sites created before this have several, one per website page, and
  mergeGroupsForSite() collapses them.

  ⚠️ THE MERGE IS OFFERED, NOT PERFORMED ON ARRIVAL. It is idempotent and
  loses no answers, but it does change what belongs where: a customer who
  pasted one block on /services and another on /pricing ends up with a single
  block and two live pages holding partial copies. That is a consequence for
  their website, not just their data, so it is a button with the consequence
  written next to it rather than something that happens while the page loads.
*/
/**
 * One set: a group, and the answers in it.
 *
 * ⚠️ THE SET IS A FaqGroup, AND THAT REVERSES THE ROUND-TWO "ONE GROUP PER
 * SITE" DECISION. That change flattened this screen into a single list and
 * added a card offering to merge every group into one, because the export keys
 * on a single group. The reasoning was right and the conclusion is now wrong:
 * each set is pasted on a different page, which is precisely what a group
 * models — a name, a path, and a published hash for the page it went on.
 *
 * ⚠️ SO faqs.topic IS NO LONGER THE GROUPING KEY. It survives as the record of
 * which batch an answer came from, and as the name a new group is given when
 * the generator creates one. The thing on screen is the group.
 */
type Bucket = { key: string; label: string; group: FaqGroup | null; faqs: FaqEntry[] };

function bySet(groups: FaqGroup[], faqs: FaqEntry[]): Bucket[] {
  const out: Bucket[] = groups
    .map((group) => ({
      key: group.id,
      label: group.name,
      group,
      faqs: faqs.filter((f) => f.groupId === group.id),
    }))
    .filter((b) => b.faqs.length > 0);

  /* ⚠️ AN ANSWER WHOSE GROUP IS GONE IS STILL THE CUSTOMER'S WRITING. It cannot
     be pasted — there is no group to build a block from — but dropping it from
     the list would look exactly like losing it. */
  const known = new Set(groups.map((g) => g.id));
  const orphans = faqs.filter((f) => !known.has(f.groupId));
  if (orphans.length) {
    out.push({ key: '__orphans', label: 'Not in a set', group: null, faqs: orphans });
  }

  return out;
}

export function AnswersWorkspace({ tab }: { tab: AnswersTab }) {
  const {
    site,
    groups,
    faqs,
    questions,
    articles,
    addGroup,
    addFaqs,
    coverQuestion,
    dismissQuestion,
    mergeGroups,
  } = useDashboard();

  const [merging, setMerging] = useState(false);
  const [draftQ, setDraftQ] = useState('');
  const [draftA, setDraftA] = useState('');
  const [adding, setAdding] = useState(false);

  /* The generator's output, held for review. ⚠️ NOT SAVED ON ARRIVAL: a paid
     dashboard does not append unreviewed answers to a live site. */
  const [candidates, setCandidates] = useState<Faq[] | null>(null);
  const [meta, setMeta] = useState<GenerationMeta | null>(null);
  const [saving, setSaving] = useState(false);
  const [capError, setCapError] = useState<string | null>(null);

  /*
    One line for all three tabs, so the page reads as one job rather than three.

    ⚠️ IT SAYS WHY, NOT WHAT. The previous version — "Make articles and answers
    for X, then put them on your site" — described the buttons, which the
    buttons already do. This names the payoff, which is the only thing that
    makes a blank page worth starting.

    ⚠️ AND IT IS A CLAIM WE CAN STAND BEHIND. "One more thing AI can say about
    you" is true of any published answer; it does not promise a citation, a
    ranking or a number. The house rule about unmeasured figures applies to
    encouragement too.
  */
  const description = site
    ? `Every answer you publish is one more thing AI can say about ${site.name}.`
    : 'Every answer you publish is one more thing AI can say about your business.';

  if (!site) {
    return (
      <>
        <PageHeader title="Content" description={description} />
        <EmptyState
          title="Add a site first"
          body="Everything here is written about one website, so we need to know which one."
          action={<ButtonLink href="/dashboard/sites">Go to sites</ButtonLink>}
        />
      </>
    );
  }

  const group = groups[0] ?? null;

  /*
    ⚠️ EVERY ANSWER ON THE SITE, NOT JUST THE FIRST GROUP'S.

    This filtered to `group.id`, which on a site with several pages showed one
    page's answers and silently hid the rest — indistinguishable from having
    lost them, on the screen whose whole job is to show you what you have
    written. `faqs` from the provider is already faqsForSite, so the fix is to
    stop narrowing it.

    Ordered by page and then by position, which is the order the merge would
    put them in, so joining the list rearranges nothing the reader can see.
  */
  const order = new Map(groups.map((g, i) => [g.id, i]));
  const mine = [...faqs].sort(
    (a, b) =>
      (order.get(a.groupId) ?? 0) - (order.get(b.groupId) ?? 0) || a.position - b.position,
  );
  const ready = mine.filter((f) => f.status === 'published').length;

  /**
   * Keep the drafts the reviewer kept.
   *
   * ⚠️ THE GROUP IS MADE ON DEMAND, because a first-time customer has none and
   * "add a page before you may generate" is a step that explains nothing. An
   * answer belongs to a page of the site — the export's schema @id is built
   * from its path — so one has to exist before anything can be saved.
   */
  async function saveCandidates(kept: Faq[], status: 'draft' | 'published') {
    setSaving(true);
    setCapError(null);

    try {
      /*
        ⚠️ A NEW SET EVERY TIME, NOT AN APPEND TO THE FIRST ONE. This used to
        drop everything into groups[0], which is what made the screen one long
        list. A run is a subject, a subject is a set, and a set is what gets
        pasted on a page — so each run gets its own group, named with the topic
        the model gave it.

        ⚠️ AND IT IS CREATED WITH NO PATH. Which page it goes on is asked for at
        paste time, in SetPublish. Minting a slug from the topic here would put
        a page into the schema that may not exist on their site — see the note
        on FaqGroup.path.
      */
      const name = meta?.topic?.trim() || 'New answers';
      const groupId = await addGroup(site!.id, { name, path: null });
      if (!groupId) {
        setCapError('Those answers could not be saved. Please try again.');
        setSaving(false);
        return;
      }

      await addFaqs(
        groupId,
        kept.map((f) => ({
          question: f.q,
          answer: f.a,
          status,
          source: 'generated' as const,
          // Kept as the record of which batch this came from, even if the
          // answer is later moved between sets. The list groups by the set.
          topic: meta?.topic,
          tone: meta?.tone,
          language: meta?.language,
        })),
      );
    } catch (err) {
      /* The free tier's keep-limit. Caught rather than left to reject: the
         candidates are still on screen and still worth keeping, so the customer
         needs to be told which ones didn't fit rather than watching a save
         silently do nothing. */
      setCapError(
        err instanceof FaqCapReached
          ? `Free accounts can hold ${err.cap} answers, and saving these would go over. Pro removes the limit — everything already written stays.`
          : 'Those answers could not be saved. Please try again.',
      );
      setSaving(false);
      return;
    }

    setSaving(false);
    setCandidates(null);
    setMeta(null);
  }

  const header = (
    <>
      <PageHeader className="mb-4" title="Content" description={description} />
      <WorkspaceTabs tabs={ANSWER_TABS} activeHref={answersTabHref(tab)} label="Content sections" />
    </>
  );

  if (tab === 'write') {
    return (
      <>
        {header}
        <WritePanel />
      </>
    );
  }

  if (tab === 'articles') {
    return (
      <>
        {header}
        {articles.length === 0 ? (
          <EmptyState
            title="No articles yet"
            body={`An article is up to ${MAX_ARTICLE_WORDS.toLocaleString()} words with real headings, written about your business and ready to paste onto your site. Make your first one and it shows up here.`}
            action={<ButtonLink href={answersTabHref('write')}>Write an article</ButtonLink>}
          />
        ) : (
          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle icon={<DocIcon className="h-4 w-4" />} tint="bg-primary-soft text-primary">
                Your articles
              </SectionTitle>
              <Badge tone="neutral">{articles.length}</Badge>
            </div>
            <p className="text-slate mt-1 text-sm">
              Copy the words, or copy the code if you want the search markup with it.
            </p>
            <ul className="mt-4 space-y-3">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </ul>
          </Card>
        )}
      </>
    );
  }

  return (
    <>
      {header}

      {/* ⚠️ NO MERGE CARD. It offered to collapse every group into one list,
          which was right when the export needed a single group and is the exact
          opposite of what this screen now does — each set is its own paste, on
          its own page. mergeGroupsForSite() is left in the store; nothing here
          calls it. */}

      {/*
        ⚠️ THE OPEN-QUESTIONS LIST AND THE HIDDEN LIST BOTH LEFT THIS TAB, AND
        PUTTING EITHER BACK IS WHAT MADE THIS SCREEN CONFUSING.

        They were here and on Write about at the same time — the same rows, with
        different controls, doing two different jobs one tab apart. Write about
        owns choosing a topic and hiding one; this tab owns making answers for a
        page and getting them onto the site. One job each.
      */}

      {/* ⚠️ REVIVED, NOT WRITTEN. GeneratorPanel and DraftReview have existed
          since the old per-page screen and were reachable only from
          /dashboard/faqs/[groupId], which nothing links to. They also bring
          back the review step: generated answers are looked at before they are
          saved, rather than appearing in the list as drafts. */}
      {/* ⚠️ THE "NO LIMIT" LINE LIVES HERE NOW, NOT ON WRITE ABOUT. It exists
          to stop the monthly article cap reading as a cap on everything — and
          once no FAQ is made on the Write about tab, it was answering a
          question nobody was asking there. This is where FAQs come from, so
          this is where it is worth knowing. */}
      <p className="text-slate mb-4 text-sm">
        Answers have no monthly limit — make as many as you like. Only articles are capped.
      </p>

      <div className="mb-5">
        <GeneratorPanel
          disabled={saving}
          onGenerated={(generated, generationMeta) => {
            setCandidates(generated);
            setMeta(generationMeta);
          }}
        />
      </div>

      {capError && (
        <div role="alert" className="border-line bg-cloud mb-5 rounded-xl border p-4">
          <p className="text-navy text-sm font-semibold">Not enough room to save these</p>
          <p className="text-slate mt-1 text-sm leading-relaxed">{capError}</p>
        </div>
      )}

      {candidates && (
        <div className="mb-5">
          <DraftReview
            candidates={candidates}
            destination={meta?.topic?.trim() || 'a new set'}
            saving={saving}
            onSave={saveCandidates}
            onDiscard={() => {
              setCandidates(null);
              setMeta(null);
            }}
          />
        </div>
      )}

      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle icon={<FaqIcon className="h-4 w-4" />} tint="bg-primary-soft text-primary">
            Your answers
          </SectionTitle>
          <Badge tone={ready > 0 ? 'success' : undefined}>{mine.length}</Badge>
        </div>
        <p className="text-slate mt-1 text-sm">
          Grouped by what each set is about. Open one to read, edit or publish it.
        </p>

        {group === null ? (
          <div className="mt-4">
            <p className="text-slate text-sm">
              Nothing here yet. Start a list and write your first answer.
            </p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() => addGroup(site.id, { name: 'Answers', path: '/faq' })}
            >
              Start my answers
            </Button>
          </div>
        ) : mine.length === 0 ? (
          <p className="text-slate mt-4 text-sm">
            No answers yet. Pick a question above, add your own, or{' '}
            <a
              href={answersTabHref('write')}
              className="text-primary hover:text-primary-hover font-semibold"
            >
              have them written for you
            </a>
            .
          </p>
        ) : (
          <ul id="new" className="divide-line mt-2 divide-y">
            {bySet(groups, mine).map((bucket) => (
              <TopicGroup key={bucket.key} bucket={bucket} site={site} total={mine.length} />
            ))}
          </ul>
        )}
        {group ? (
          <div id="composer" className="border-line mt-4 scroll-mt-24 border-t pt-4">
            {adding ? (
              <div className="space-y-2">
                <label className="block">
                  <span className="sr-only">The question</span>
                  <input
                    value={draftQ}
                    onChange={(e) => setDraftQ(e.target.value)}
                    /* One of the questions the scan found for THIS business —
                       and here it is not only an example but a good thing to
                       type, since answering a discovered question is the whole
                       job of this composer. See exampleQuestion. */
                    placeholder={exampleQuestion(
                      questions,
                      site?.id ?? null,
                      'A question your customers ask',
                      64,
                    )}
                    className="border-line bg-cloud text-navy focus:border-primary w-full rounded-input border px-3 py-2 text-[0.9375rem] font-semibold outline-none transition-colors duration-150"
                  />
                </label>
                <label className="block">
                  <span className="sr-only">Your answer</span>
                  <textarea
                    value={draftA}
                    onChange={(e) => setDraftA(e.target.value)}
                    rows={4}
                    placeholder="Answer it the way you would on the phone. Plain and specific."
                    className="border-line bg-cloud text-navy focus:border-primary w-full resize-y rounded-input border px-3 py-2 text-sm leading-relaxed outline-none transition-colors duration-150"
                  />
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!draftQ.trim() || !draftA.trim()}
                    onClick={async () => {
                      /* ⚠️ status: 'published' — the word means "in the block",
                         not "live on their website". Only published entries
                         reach the export, so a draft here would be written,
                         saved, and silently absent from the thing they copy.

                         Generated answers are the other way round: they arrive
                         as drafts because nobody has read them yet. This one
                         the customer just wrote. */
                      await addFaqs(group.id, [
                        {
                          question: draftQ.trim(),
                          answer: draftA.trim(),
                          status: 'published',
                          source: 'manual',
                        },
                      ]);
                      /* Mark the suggestion answered, so it leaves the list
                         above rather than sitting there beside its own answer. */
                      const match = questions.find((x) => x.question === draftQ.trim());
                      if (match) await coverQuestion(match.id);
                      setDraftQ('');
                      setDraftA('');
                      setAdding(false);
                    }}
                  >
                    Save answer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraftQ('');
                      setDraftA('');
                      setAdding(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
                <PlusIcon className="mr-1.5 h-3.5 w-3.5" /> Add a question
              </Button>
            )}
          </div>
        ) : null}
      </Card>

      {/* ⚠️ NO PINNED PUBLISH BAR. Every set carries its own copy block now —
          see SetPublish. Two controls exporting different HTML from the same
          answers is the mistake export.ts records fixing once already.
          publish-workspace.tsx still renders PublishPanel; that is a different
          screen and was left alone. */}
    </>
  );
}

/**
 * One topic: a line you can open.
 *
 * ⚠️ THE COUNTS ARE ON THE CLOSED ROW BECAUSE THAT IS THE WHOLE POINT OF IT.
 * A list of names you have to open one by one to find the unpublished ones is
 * worse than the flat list it replaced. "6 · 4 live" answers the question the
 * row exists to answer.
 *
 * ⚠️ isFirst/isLast ARE JUDGED AGAINST THE WHOLE SITE'S LIST, NOT THIS BUCKET.
 * FaqRow's arrows move an answer past its real neighbour by position, and
 * positions run across every answer on the site — so scoping them to a topic
 * would grey out an arrow that still does something.
 */
function TopicGroup({
  bucket,
  site,
  total,
}: {
  bucket: Bucket;
  site: Site;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  const live = bucket.faqs.filter((f) => f.status === 'published').length;

  return (
    <li>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group/row flex min-h-11 w-full items-center gap-2.5 py-3 text-left"
      >
        <ChevronIcon
          aria-hidden="true"
          className={`text-slate group-hover/row:text-navy h-4 w-4 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-90' : ''
          }`}
        />
        <span className="text-navy group-hover/row:text-primary min-w-0 flex-1 text-sm font-medium transition-colors duration-150">
          {bucket.label}
        </span>
        <span className="text-slate shrink-0 text-xs">
          {bucket.faqs.length} {bucket.faqs.length === 1 ? 'answer' : 'answers'} ·{' '}
          {live > 0 ? `${live} live` : 'none live'}
        </span>
      </button>

      {open && (
        <>
          <ul className="divide-line border-line divide-y border-t">
            {bucket.faqs.map((faq) => (
              <FaqRow
                key={faq.id}
                faq={faq}
                isFirst={faq.position === 0}
                isLast={faq.position === total - 1}
              />
            ))}
          </ul>

          {/* ⚠️ INSIDE THE SET, NOT AT THE FOOT OF THE PAGE. This is the one
              control that changes what an assistant can read, and it belongs
              next to the answers it exports rather than in a bar that could be
              about any of them. */}
          {bucket.group && <SetPublish site={site} group={bucket.group} faqs={bucket.faqs} />}
        </>
      )}
    </li>
  );
}

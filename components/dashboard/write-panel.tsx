'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MAX_BRIEF_CHARS, type ArticleStreamPhase } from '@/lib/article';
import { generateContentPlan } from '@/lib/dashboard/content-plan';
import { formatPlainDate } from '@/lib/dashboard/format';
import { articleAllowance, canContent } from '@/lib/dashboard/plans';
import { useDashboard } from '@/lib/dashboard/provider';
import { groupByQuestion, isOpenQuestion, namedIn } from '@/lib/dashboard/questions';
import { questionKey } from '@/lib/questions';
import type { ArticleSection, ArticleTopic, DiscoveredQuestion } from '@/lib/dashboard/types';
import { SearchIcon } from './nav-icons';
import { SectionTitle } from './section-title';
import { WritingModal } from './writing-modal';

/*
  Write about — pick a topic, get an article.

  ⚠️ ONE BUTTON PER ROW, AND THE THREE IT REPLACED WERE THE PROBLEM. Rows used
  to offer Article / FAQ / Both as filled buttons, which on a list of fifteen is
  forty-five blue rectangles — a wall, not a menu. Cutting the choice is what
  fixed it; restyling it would not have.

  ⚠️ FAQs ARE WRITTEN AFTER AN ARTICLE EXISTS, NOT HERE, and that is a better
  product rather than only a smaller screen. The article's own page offers "Add
  FAQs about this" and feeds a finished thousand words to the model instead of
  the one-line brief this call gets. The whole FAQ path — the Make type, the
  choice component, saveFaqs, targetGroup, /api/dashboard/generate — moved to
  article-workspace.tsx rather than being left here as a branch nobody reaches.

  ⚠️ TWO CARDS, DOWN FROM FIVE. The steps card became the line under the
  heading below, the allowance became a figure in that heading, and the
  bring-your-own box became the last row of the same list. A page whose job is
  "pick one of these" should be one list.
*/

/**
 * How few topics is too few.
 *
 * Seven is Beau's number and it is a reasonable one: enough that the list still
 * looks like a choice rather than the last few scrapings, and low enough that
 * refilling is occasional rather than constant. Each refill costs real money —
 * see the note on the button.
 */
const TOPIC_FLOOR = 7;

/**
 * How many tracked prompts lead the list.
 *
 * ⚠️ THESE ARE THE MEASURED HALF. Everything below them is a suggestion; these
 * are questions the engines were actually asked, ordered by how few of them
 * named this business. Five is Beau's number and it is about right — enough to
 * be the story at the top of the page, few enough that the suggestions still
 * get read.
 */
const TRACKED_TOPICS = 5;

export function WritePanel() {
  const router = useRouter();
  const {
    site,
    user,
    data,
    questions,
    articles,
    tracking,
    contentPlan,
    addArticle,
    saveContentPlan,
    renameSite,
    dismissQuestion,
  } = useDashboard();

  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);
  const [found, setFound] = useState<number | null>(null);

  /* What the model has produced so far. Reset at the start of every run, and
     only ever written from stream events — see WritingProgress. */
  const [phase, setPhase] = useState<ArticleStreamPhase>('thinking');
  const [liveTitle, setLiveTitle] = useState<string | null>(null);
  const [liveHeadings, setLiveHeadings] = useState<string[]>([]);

  /*
    Counted across the ACCOUNT, not the selected site — the allowance is a plan
    thing and `data.articles` is every article the account owns. The provider's
    site-filtered list would undercount the day a second site exists, and the
    customer would be refused by a server that had counted correctly.
  */
  const allowance = articleAllowance(user, data?.articles ?? []);
  const noneLeft = allowance !== null && allowance.left <= 0;

  const pages = site?.lastAudit?.pages ?? [];
  const hidden = questions.filter((q) => q.dismissed);

  /*
    Topics already written about.

    ⚠️ DERIVED FROM THE ARTICLES, NOT STORED ON THE QUESTION, AND NOT
    coverQuestion(). The obvious move is to mark the question covered when its
    article is written — but `covered` means THE SITE PUBLISHES AN ANSWER TO
    THIS. It drives "N questions people ask that you don't answer" in
    audit-context.ts, the Home tile and the worklist. An article sitting here as
    a draft has been pasted nowhere, so setting it would tell somebody their
    website answers something it does not.

    Article.brief holds the question verbatim for a recommended row — run()
    passes q.question straight through — so the link already exists in the data.
    Matched with questionKey(), the same normaliser the coverage loop uses.

    Deriving also means deleting the article brings the topic back, which is
    correct and would need explicit undo code with a stored flag.
  */
  const written = useMemo(
    () =>
      new Set(
        articles
          /* ⚠️ THE FIRST LINE, NOT THE WHOLE BRIEF. A suggestion's brief carries
             its angle on a second line so the model gets the plan's thinking —
             matching the whole string would then never match the title back. */
          .map((a) => questionKey((a.brief ?? '').split('\n')[0]))
          .filter(Boolean),
      ),
    [articles],
  );

  /*
    The measured half: prompts the engines were actually asked, ordered by how
    few of them named this business.

    ⚠️ A PROMPT WITH NO CHECKS IS NOT A PROMPT AI IGNORED. Anything not yet
    asked has no QuestionGroup, and sorting it as "0 engines" would turn NOT
    MEASURED into MEASURED ZERO — the rule this codebase states everywhere else.
    Unchecked prompts sort after every checked one and carry no count at all.
  */
  const namedByQuestion = useMemo(() => {
    const map = new Map<string, number>();
    for (const group of groupByQuestion(tracking?.latest ?? [])) {
      map.set(questionKey(group.question), namedIn(group));
    }
    return map;
  }, [tracking]);

  const openQuestions = questions.filter(
    (q) => isOpenQuestion(q) && !written.has(questionKey(q.question)),
  );

  const tracked = [...openQuestions]
    .sort((a, b) => {
      const an = namedByQuestion.get(questionKey(a.question));
      const bn = namedByQuestion.get(questionKey(b.question));
      // Unmeasured last, and never compared as if it were a zero.
      if (an === undefined && bn === undefined) return 0;
      if (an === undefined) return 1;
      if (bn === undefined) return -1;
      return an - bn;
    })
    .slice(0, TRACKED_TOPICS);

  /* The suggested half. Written ones retire the same way prompts do — the
     filter compares the FIRST LINE of an article's brief, which is the title
     for a suggestion and the whole thing for a question. Hidden ones are the
     owner's own call; see hideTopic below. */
  const hiddenTopics = contentPlan?.hiddenTopics ?? [];
  const suggested = (contentPlan?.topics ?? []).filter(
    (t) => !written.has(questionKey(t.title)) && !hiddenTopics.includes(t.title),
  );

  /* The suggestions that were waved away, so the hidden list can offer them
     back. Titles are kept even if a topic has since gone, but only ones still
     in the plan can be restored to anything. */
  const hiddenSuggestions = (contentPlan?.topics ?? []).filter((t) =>
    hiddenTopics.includes(t.title),
  );

  /**
   * Wave a suggestion away, or bring it back.
   *
   * ⚠️ A KEPT LIST, NOT A DELETE FROM `topics`, SO IT MATCHES THE HIDE NEXT TO
   * IT. Hiding a tracked prompt is undoable — the row survives and the hidden
   * list offers it back. Two controls that look identical and behave
   * differently is worse than either behaviour on its own, so this one is
   * undoable too rather than quietly dropping the topic out of the plan.
   */
  const hiddenCount = hidden.length + hiddenSuggestions.length;

  async function hideTopic(title: string, hidden: boolean) {
    if (!contentPlan) return;
    const next = hidden
      ? [...hiddenTopics.filter((t) => t !== title), title]
      : hiddenTopics.filter((t) => t !== title);
    await saveContentPlan({ ...contentPlan, hiddenTopics: next });
  }

  const open = [...tracked, ...suggested];

  /*
    More suggestions.

    ⚠️ THIS USED TO DISCOVER TRACKED PROMPTS, AND THAT WAS THE WRONG THING TO
    PUT BEHIND A CASUAL BUTTON. Every prompt discovered is asked to three
    engines every week from then on — a recurring bill for pressing "find more".
    Regenerating the content plan's suggestions is one model call and nothing
    afterwards. Discovering new prompts still exists; it lives on AI Mentions,
    where the weekly cost is the subject of the page.

    ⚠️ IT REPLACES THE WHOLE PLAN, pages table included, because
    saveContentPlan stores one per site — the same thing the Content page's own
    "Regenerate" does. The button says "refresh" rather than "add" so nobody is
    surprised by the other screen.
  */
  const canSuggest = canContent(user) && pages.length > 0;

  async function findMore() {
    if (!site || !canSuggest || finding) return;
    setFindError(null);
    setFound(null);
    setFinding(true);

    try {
      const result = await generateContentPlan(site);
      if (!result.ok) {
        setFindError(result.error);
        return;
      }

      await saveContentPlan(result.plan);
      // Never over a manual profile; the helper decides, this applies it.
      if (result.profile) await renameSite(site.id, result.profile);
      setFound(result.plan.topics.length);
    } catch {
      setFindError('Could not reach the server. Check your connection and try again.');
    } finally {
      setFinding(false);
    }
  }

  async function run(topic: string) {
    if (!site) return;
    setError(null);
    setBusy(true);
    setPhase('thinking');
    setLiveTitle(null);
    setLiveHeadings([]);

    try {
      const res = await fetch('/api/dashboard/article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: site.id,
          brief: topic,
          pages,
          openQuestions: tracked.map((q) => q.question),
          stream: true,
        }),
      });

      /*
        ⚠️ A REFUSAL IS STILL PLAIN JSON, EVEN THOUGH WE ASKED FOR A STREAM. The
        route decides the allowance, the entitlement and the ownership check
        before there is anything to stream, so those come back as one object
        with a status. Reading the body as NDJSON regardless would turn "that's
        your ten for the month" into a parse failure and then a generic error.
      */
      if (!res.ok || !res.body) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? 'That article could not be written. Please try again.');
        return;
      }

      /*
        ⚠️ BUFFERED ON \n, NOT PER CHUNK. A read can split a line anywhere, so
        parsing whatever arrived would throw on a half-written object. The tail
        is kept and prepended to the next read — the same reader shape the audit
        stream uses in provider.tsx.
      */
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let tail = '';
      let result: {
        article?: { title: string; intro: string; sections: ArticleSection[] };
        wordCount?: number;
      } | null = null;
      let streamError: string | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        tail += decoder.decode(value, { stream: true });
        const lines = tail.split('\n');
        tail = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let msg: {
            type?: string;
            phase?: ArticleStreamPhase;
            text?: string;
            error?: string;
            article?: { title: string; intro: string; sections: ArticleSection[] };
            wordCount?: number;
          };
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }

          if (msg.type === 'phase' && msg.phase) setPhase(msg.phase);
          if (msg.type === 'title' && msg.text) setLiveTitle(msg.text);
          if (msg.type === 'heading' && msg.text) {
            const heading = msg.text;
            setLiveHeadings((prev) => [...prev, heading]);
          }
          if (msg.type === 'result') result = msg;
          if (msg.type === 'error') streamError = msg.error ?? 'That article failed.';
        }
      }

      if (streamError || !result?.article) {
        setError(streamError ?? 'That article could not be written. Please try again.');
        return;
      }

      const id = await addArticle(site.id, {
        title: result.article.title,
        intro: result.article.intro,
        sections: result.article.sections,
        brief: topic || null,
        // The server measured it. Zero only if something upstream changed shape,
        // and a visible 0 beats an invented number.
        wordCount: result.wordCount ?? 0,
      });

      setBrief('');

      /* ⚠️ SAVE FIRST, THEN NAVIGATE. The article page reads from the same
         snapshot this write produced, so pushing before the save lands would
         render "that article isn't here" for a piece that exists. */
      if (id) router.push(`/dashboard/faqs/article/${id}`);
    } catch {
      setError('Could not reach the writer. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {busy && <WritingModal phase={phase} title={liveTitle} headings={liveHeadings} />}

      {error && (
        <p role="alert" className="text-error-ink text-sm">
          {error}
        </p>
      )}

      <Card className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <SectionTitle
            icon={<SearchIcon className="h-4 w-4" />}
            tint="bg-accent-soft text-teal-ink"
          >
            What we&rsquo;d write about
          </SectionTitle>

          {/* ⚠️ THE ALLOWANCE LIVES IN THIS HEADING NOW, not in a card of its
              own at the bottom of the page. It is one figure; a whole card for
              it was the largest thing on screen saying the least. The number is
              counted from the account's own rows — see articleAllowance(). */}
          {allowance && (
            <p className={`text-sm ${noneLeft ? 'text-warn-ink font-semibold' : 'text-slate'}`}>
              {allowance.left} of {allowance.cap} articles left this month
              {allowance.resetsAt ? (
                <span className="text-slate">
                  {' · '}
                  {/* ⚠️ formatPlainDate, NOT toISOString(). Every date this
                      dashboard renders is month-first en-US and pinned to UTC —
                      see the note on PLAIN_DATE in lib/dashboard/format.ts. */}
                  resets {formatPlainDate(allowance.resetsAt.toISOString())}
                </span>
              ) : null}
            </p>
          )}
        </div>

        {/* ⚠️ NO INTRO PARAGRAPH HERE, DELIBERATELY. There was one explaining
            what the list is and what the button does; Beau found it
            distracting, and he was right — the rows say what they are and the
            button says what it does. The page's subheading carries the why. */}

        {open.length === 0 ? (
          /* ⚠️ A REAL STATE, NOT AN ERROR. A new account has no discovered
             questions until a full check has run, and the topic box below still
             works with no data at all — so this points at the check and does
             not pretend the page is broken. */
          <div className="border-line bg-cloud mt-4 rounded-xl border border-dashed p-5">
            <p className="text-navy text-sm font-semibold">No suggestions yet</p>
            <p className="text-slate mt-1 text-sm leading-relaxed">
              We find these by reading your site and working out what your customers ask. Run a
              full check and they&rsquo;ll show up here — or type your own topic below.
            </p>
            <ButtonLink href="/dashboard/audit" size="sm" variant="ghost" className="mt-4">
              Check my site
            </ButtonLink>
          </div>
        ) : (
          <>
            {tracked.length > 0 && (
              <>
                {/* ⚠️ NO "AI DOESN'T NAME YOU" HERE ANY MORE, AND ITS REMOVAL
                    IS REQUIRED RATHER THAN COSMETIC. That claim was true row by
                    row only because each row printed the count that backed it.
                    With the counts gone it becomes one blanket assertion over
                    five rows, some of which AI does name — which is the
                    invented-measurement rule broken in words instead of digits.

                    The ORDER still puts the least-named first; it is simply no
                    longer narrated. See the sort above. */}
                <SectionLabel>Asked by customers</SectionLabel>
                <ul className="divide-line divide-y">
                  {tracked.map((q) => (
                    <TopicRow
                      key={q.id}
                      title={q.question}
                      busy={busy}
                      noneLeft={noneLeft}
                      onHide={() => dismissQuestion(q.id, true)}
                      onWrite={() => run(q.question)}
                    />
                  ))}
                </ul>
              </>
            )}

            {suggested.length > 0 && (
              <>
                <SectionLabel className={tracked.length > 0 ? 'mt-6' : undefined}>
                  Suggested for your industry
                </SectionLabel>
                <ul className="divide-line divide-y">
                  {suggested.map((t) => (
                    <TopicRow
                      key={t.title}
                      title={t.title}
                      angle={t.angle}
                      busy={busy}
                      noneLeft={noneLeft}
                      /* ⚠️ HIDE HERE TOO, AND IT HAD TO BECOME REAL RATHER THAN
                         A SPACER. Without it the "Write article" buttons in
                         this half sat at a different x from the ones above, so
                         the two lists did not read as one. Making the column
                         line up with a control that does nothing would have
                         been worse than the misalignment. */
                      onHide={() => hideTopic(t.title, true)}
                      onWrite={() => run(briefFor(t))}
                    />
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {/* ⚠️ ONLY WHEN THE LIST IS RUNNING LOW. A refresh button offered
            beside fifteen topics is a model call spent on suggestions nobody
            will reach; at six it is the thing you actually want. */}
        {open.length < TOPIC_FLOOR && canContent(user) && (
          <div className="border-line mt-4 border-t pt-4">
            {found !== null ? (
              <p className="text-success-ink text-sm font-semibold">
                {found} fresh {found === 1 ? 'topic' : 'topics'}, above.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canSuggest || finding}
                    onClick={findMore}
                  >
                    {finding ? 'Thinking…' : 'Suggest more topics'}
                  </Button>
                  <p className="text-slate text-sm">
                    {open.length === 0
                      ? 'Nothing left to write about.'
                      : `Only ${open.length} left.`}
                  </p>
                </div>

                {/* ⚠️ NO WEEKLY-COST WARNING ANY MORE, AND ITS ABSENCE IS
                    CORRECT. That line belonged to the old button, which added
                    tracked prompts and therefore engine calls every week
                    forever. This one refreshes suggestions: one call, nothing
                    after it. Leaving the warning would be a false one. */}
                <p className="text-slate mt-2 text-xs">
                  {pages.length === 0
                    ? 'Run a full check of your site first — we read your own pages to work these out.'
                    : 'We read your site again and suggest fresh topics. This replaces the current suggestions.'}
                </p>
              </>
            )}
          </div>
        )}

        {/* ⚠️ THE LAST ROW OF THE SAME LIST, NOT A SECOND CARD. Bringing your
            own topic is the same decision as picking one of ours — one more
            option at the bottom of the options — and giving it its own card
            made it look like a different feature. */}
        <div className="border-line mt-4 border-t pt-4">
          <label className="block">
            <span className="text-slate text-sm">Or write about something else</span>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={brief}
                onChange={(e) => setBrief(e.target.value.slice(0, MAX_BRIEF_CHARS))}
                placeholder="Why our quotes include a full tear-off"
                className="border-line bg-cloud text-navy focus:border-primary min-h-11 min-w-0 flex-1 rounded-input border px-3 py-2 text-sm outline-none transition-colors duration-150 sm:min-h-0"
              />
              <Button
                size="sm"
                disabled={busy || noneLeft || !brief.trim()}
                onClick={() => run(brief.trim())}
              >
                Write article
              </Button>
            </div>
          </label>
        </div>

        {findError && (
          <p role="alert" className="text-error-ink mt-3 text-sm">
            {findError}
          </p>
        )}

        {noneLeft && (
          <p className="text-slate mt-3 text-sm">
            You&rsquo;ve used all {allowance?.cap} articles this month. You can still write
            questions and answers on the Answers tab — those have no limit.
          </p>
        )}
      </Card>

      {/* Hidden questions, tucked away but never gone. Somebody who hides the
          wrong one needs a way back, and a count they can see is what tells
          them the button did anything at all. */}
      {/* ⚠️ ONE HIDDEN LIST FOR BOTH KINDS. A prompt and a suggestion are
          different things, but "where did the thing I hid go" is one question,
          and two collapsed cards answering it separately would be two places to
          look. */}
      {hiddenCount > 0 && (
        <Card tone="cloud" className="p-4">
          <button
            onClick={() => setShowHidden((v) => !v)}
            aria-expanded={showHidden}
            className="text-slate hover:text-navy inline-flex min-h-11 items-center sm:min-h-0 text-sm transition-colors duration-150"
          >
            {hiddenCount} hidden {hiddenCount === 1 ? 'topic' : 'topics'} ·{' '}
            {showHidden ? 'close' : 'show'}
          </button>

          {showHidden && (
            <ul className="divide-line mt-3 divide-y">
              {hidden.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <p className="text-slate min-w-0 flex-1 text-sm">{q.question}</p>
                  <button
                    onClick={() => dismissQuestion(q.id, false)}
                    className="text-primary hover:text-primary-hover inline-flex min-h-11 shrink-0 items-center text-sm font-semibold transition-colors duration-150 sm:min-h-0"
                  >
                    Put it back
                    <span className="sr-only"> — “{q.question}”</span>
                  </button>
                </li>
              ))}
              {hiddenSuggestions.map((t) => (
                <li
                  key={t.title}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                >
                  <p className="text-slate min-w-0 flex-1 text-sm">{t.title}</p>
                  <button
                    onClick={() => hideTopic(t.title, false)}
                    className="text-primary hover:text-primary-hover inline-flex min-h-11 shrink-0 items-center text-sm font-semibold transition-colors duration-150 sm:min-h-0"
                  >
                    Put it back
                    <span className="sr-only"> — “{t.title}”</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

/* ⚠️ THE INTENT PALETTE LIVED HERE AND IS GONE WITH THE CHIP IT COLOURED —
   five ink/tint pairs (Cost, What you do, Trust, Timing & area, Problem), each
   measured in the browser at 4.5:1 or better on white. Nothing renders an
   intent on this screen any more, so keeping the map would be a table nobody
   reads. If a chip comes back, measure the pairs again rather than trusting a
   list recovered from history: `accent` in particular is fill-only at 1.9:1 and
   must never carry text. The ink and tint tokens themselves are documented in
   globals.css. */

/** A quiet heading over one half of the list. */
function SectionLabel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-slate font-mono text-xs tracking-wide uppercase sm:text-[0.6875rem] ${className || 'mt-4'}`}
    >
      {children}
    </p>
  );
}

/**
 * What gets sent as the brief for a suggestion.
 *
 * ⚠️ TITLE ON THE FIRST LINE, ANGLE UNDER IT, AND BOTH HALVES MATTER. The angle
 * is the plan's actual thinking — "what makes this different from the obvious
 * version of the piece" — and dropping it would throw away the expensive part.
 * The first line stays the bare title because that is what the written-topic
 * filter matches on; see the note on `written` above.
 */
function briefFor(topic: ArticleTopic): string {
  return `${topic.title}\n\nAngle: ${topic.angle}`;
}

/*
  One row, on a single line.

  ⚠️ IT SERVES BOTH HALVES OF THE LIST, and the props are what tell them apart:
  a tracked prompt can be hidden, a suggestion has an angle and cannot. One
  component rather than two because the layout,
  the button and the wrapping rules are identical, and two copies of a row
  drift in exactly the ways a list notices.

  ⚠️ flex-wrap IS LOAD-BEARING, NOT TIDINESS. The row folds at 320px rather
  than pushing the document sideways, which is a verification case.
*/
function TopicRow({
  title,
  angle,
  busy,
  noneLeft,
  onHide,
  onWrite,
}: {
  title: string;
  /** The plan's angle, for a suggestion. */
  angle?: string;
  busy: boolean;
  noneLeft: boolean;
  /** Omitted for a suggestion — see the note at the call site. */
  onHide?: () => void;
  onWrite: () => void;
}) {

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-navy text-sm">{title}</p>
        {angle && <p className="text-slate mt-0.5 text-xs leading-relaxed">{angle}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* ⚠️ THE sr-only OBJECT IS NOT OPTIONAL. "Write article" is announced
            once per row with nothing to tell them apart; the title is what
            makes each one a different control. */}
        <Button size="sm" variant="ghost" disabled={busy || noneLeft} onClick={onWrite}>
          Write article
          <span className="sr-only"> about “{title}”</span>
        </Button>

        {/* ⚠️ HIDE, NOT DELETE, and only for a tracked prompt. The row is kept
            so a re-run of discovery cannot simply suggest it again. A
            suggestion has no onHide at all — see the call site. */}
        {onHide && (
          <button
            onClick={onHide}
            disabled={busy}
            className="text-slate hover:text-navy rounded-input inline-flex min-h-11 min-w-11 items-center justify-center px-2 py-1 text-xs transition-colors duration-150 disabled:opacity-40 sm:min-h-0"
          >
            Hide
            <span className="sr-only"> the question “{title}”</span>
          </button>
        )}
      </div>
    </li>
  );
}

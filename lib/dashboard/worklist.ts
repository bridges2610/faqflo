/**
 * One ranked answer to "what should I do next?".
 *
 * Two things used to answer that question separately and differently. The audit
 * page rendered `report.actions` — a properly ranked plan where every item
 * carries a real score impact, an effort band and, where the fix lives on the
 * customer's site, the exact snippet. The Overview ran its own hand-written
 * if/else cascade and showed exactly ONE generic suggestion. So the best data in
 * the product never reached the front page, and the two screens could tell a
 * customer different things on the same day.
 *
 * This merges both into one list, ranked on one scale.
 *
 * The two sources are genuinely different in kind and both belong:
 *
 *   AUDIT FIXES come from the crawl. "Your robots.txt blocks GPTBot." They are
 *   already ranked by lib/audit/actions.ts and are taken as-is — re-deriving
 *   them here would be a second implementation of the same arithmetic, free to
 *   drift.
 *
 *   PRODUCT TASKS come from the state of the account. "Two pages are out of
 *   date." The crawl cannot see these: it reads the customer's live site and
 *   has no idea what is sitting unpublished in here.
 *
 * ⚠️ Product tasks have `impact: null`, always. Points are what the overall
 * score would gain if a finding flipped, computed by scoreIfFixed(). Publishing
 * an answer that isn't on the site yet doesn't flip a finding, so any number
 * attached to it would be invented — and this codebase's whole posture is that
 * it does not show what it did not measure. They rank on effort alone.
 */

import { EFFORT_COST } from '@/lib/audit/actions';
import type { ActionItem, AuditReport } from '@/lib/audit/types';
import { publishState } from './export';
import { canTrack, hasGetCited } from './plans';
import type { DiscoveredQuestion, FaqEntry, FaqGroup, Site, User } from './types';

export type Task = {
  id: string;
  /** Imperative and specific. "Add a title tag to /pricing", not "SEO". */
  what: string;
  /** One sentence tying it to being quoted. */
  why: string;
  /** Real score points from scoreIfFixed, or null when it cannot move the score. */
  impact: number | null;
  effort: ActionItem['effort'];
  action: ActionItem['action'];
  /** Sorted above everything else — a blocker buried under cheap wins is wasted work. */
  critical?: boolean;
  /**
   * Set when the task describes something the customer cannot do yet.
   *
   * A locked task carries NO invented data. It names what the paid audit
   * covers; it never shows a count of findings we did not run.
   */
  locked?: 'get_cited' | 'stay_cited';
};

export type WorklistInput = {
  report: AuditReport | null;
  site: Site | null;
  user: User | null;
  groups: FaqGroup[];
  faqs: FaqEntry[];
  questions: DiscoveredQuestion[];
};

/** Same scale the audit plan uses: value per unit of the customer's time. */
function value(task: Task): number {
  return (task.impact && task.impact > 0 ? task.impact : 0.5) / EFFORT_COST[task.effort];
}

/**
 * An audit action, as a Task.
 *
 * Exported because the Audit screen renders `report.actions` directly — it
 * shows the plan in the context of the findings it came from — while Home
 * renders the merged worklist. Both go through this, so the same fix cannot
 * describe itself differently on the two screens.
 */
export function taskFromAction(item: ActionItem): Task {
  return {
    id: `audit:${item.id}`,
    what: item.what,
    why: item.why,
    impact: item.impact,
    effort: item.effort,
    action: item.action,
    // buildActionPlan has already hoisted its own criticals to the front of the
    // array, and the impact numbers preserve that ordering when re-sorted here.
    critical: false,
  };
}

/**
 * What the account's own state says needs doing.
 *
 * Order within this function doesn't matter — everything is ranked afterwards —
 * but the conditions do. Each one is a state the crawl cannot observe.
 */
function productTasks(input: WorklistInput): Task[] {
  const { groups, faqs, questions, site, user } = input;
  const tasks: Task[] = [];

  const published = faqs.filter((f) => f.status === 'published');
  const emptyDrafts = faqs.filter((f) => f.status === 'draft' && !f.answer.trim());
  const uncovered = questions.filter((q) => !q.covered);

  const states = groups.map((g) => ({
    group: g,
    state: publishState(
      g,
      faqs.filter((f) => f.groupId === g.id),
    ),
  }));
  const stale = states.filter((s) => s.state === 'stale');
  const never = states.filter((s) => s.state === 'never');

  /*
    Stale beats everything else that isn't a crawl blocker, and it is the one
    product task marked critical. A stale page is work already done and paid
    for that is silently not in effect: the engines are still reading the old
    answers, and nothing about the site looks broken.
  */
  if (stale.length > 0) {
    tasks.push({
      id: 'republish-stale',
      what: `Re-paste ${stale.length === 1 ? `your ${stale[0].group.name} page` : `${stale.length} pages`}`,
      why: 'Those answers changed here after they were pasted. Until the new version is on the page, the engines are still reading the old one.',
      impact: null,
      effort: '15 minutes',
      critical: true,
      action: { kind: 'link', label: 'Get the updated blocks', href: '/dashboard/publish' },
    });
  }

  if (published.length === 0 && groups.length > 0) {
    tasks.push({
      id: 'publish-first',
      what: 'Publish your first answers',
      why: 'Nothing reaches an engine until an answer is marked published and pasted onto your site.',
      impact: null,
      effort: '15 minutes',
      action: { kind: 'link', label: 'Write answers', href: '/dashboard/faqs' },
    });
  }

  if (never.length > 0 && published.length > 0) {
    tasks.push({
      id: 'paste-export',
      what: `Paste ${never.length === 1 ? 'your export' : `${never.length} exports`} onto your site`,
      why: 'Your answers exist here but not on your domain. Until they are on the page there is nothing for a crawler to find.',
      impact: null,
      effort: '15 minutes',
      action: { kind: 'link', label: 'Get the HTML', href: '/dashboard/publish' },
    });
  }

  if (emptyDrafts.length > 0) {
    tasks.push({
      id: 'write-drafts',
      what: `Write ${emptyDrafts.length} ${emptyDrafts.length === 1 ? 'answer' : 'answers'} that are still blank`,
      why: 'These questions were drafted but never answered. A blank draft does nothing — it cannot be published or quoted.',
      impact: null,
      effort: '15 minutes',
      action: { kind: 'link', label: 'Write them', href: '/dashboard/faqs' },
    });
  }

  if (uncovered.length > 0) {
    tasks.push({
      id: 'answer-questions',
      what: `Answer ${uncovered.length} ${uncovered.length === 1 ? 'question' : 'questions'} you don’t cover`,
      why: 'People put these to assistants about businesses like yours, and your site currently says nothing about them.',
      impact: null,
      effort: '15 minutes',
      action: { kind: 'link', label: 'See the questions', href: '/dashboard/questions' },
    });
  }

  if (groups.length === 0 && hasGetCited(site)) {
    tasks.push({
      id: 'first-group',
      what: 'Choose the page your answers go on',
      why: 'Answers belong to a page, so the export knows where to point and the schema names the right URL.',
      impact: null,
      effort: '2 minutes',
      action: { kind: 'link', label: 'Add a group', href: '/dashboard/faqs' },
    });
  }

  /*
    The upgrade rows.

    Both describe the product rather than showing data we haven't got. A free
    user's audit read one page and scored three checks; claiming "12 more
    problems found" would be a number nobody measured. Naming the scope of the
    paid audit is true and is the honest version of the same nudge.
  */
  if (!hasGetCited(site) && site) {
    tasks.push({
      id: 'unlock-full-audit',
      what: 'See the whole picture, not just your home page',
      why: 'The free check reads one page and scores three things. The full audit reads up to a hundred pages against 44 checks, finds the questions people ask in your category, and gives you the export that puts your answers where a crawler can read them.',
      impact: null,
      effort: '15 minutes',
      locked: 'get_cited',
      action: { kind: 'link', label: 'See what Get Cited covers', href: '/dashboard/audit' },
    });
  }

  if (hasGetCited(site) && !canTrack(user) && published.length > 0) {
    tasks.push({
      id: 'consider-stay-cited',
      what: 'Keep this running after your 30 days',
      why: 'Your answers are live. Stay Cited keeps new audits and fresh answers coming across every site on your account once the window closes.',
      impact: null,
      effort: '2 minutes',
      locked: 'stay_cited',
      action: { kind: 'link', label: 'About Stay Cited', href: '/dashboard/tracking' },
    });
  }

  return tasks;
}

/**
 * The merged, ranked list.
 *
 * Criticals first — a crawler blocker makes every other fix pointless, and the
 * one product task allowed to claim critical is a stale live page, for the same
 * reason. Everything else sorts on impact-over-effort. Locked rows always sink
 * to the bottom: they are an offer, not a job, and a customer who has work to
 * do should see the work first.
 */
export function buildWorklist(input: WorklistInput, limit = 5): Task[] {
  const auditTasks = (input.report?.actions ?? []).map(taskFromAction);
  const all = [...auditTasks, ...productTasks(input)];

  const ranked = all.sort((a, b) => {
    const lockedness = Number(Boolean(a.locked)) - Number(Boolean(b.locked));
    if (lockedness !== 0) return lockedness;

    const criticality = Number(b.critical ?? false) - Number(a.critical ?? false);
    if (criticality !== 0) return criticality;

    return value(b) - value(a);
  });

  return ranked.slice(0, limit);
}

/**
 * The three facts a business owner actually wants off the front page.
 *
 * Deliberately outcomes rather than pipeline stages. The Overview used to show
 * a five-row checklist of our own loop — Audit, Questions, Answers, Publish,
 * Track — which taught the customer our process rather than telling them where
 * their site stands.
 */
export function standing(input: WorklistInput): {
  liveGroups: number;
  totalGroups: number;
  published: number;
  unanswered: number;
  staleGroups: number;
} {
  const { groups, faqs, questions } = input;

  const states = groups.map((g) =>
    publishState(
      g,
      faqs.filter((f) => f.groupId === g.id),
    ),
  );

  return {
    liveGroups: states.filter((s) => s === 'current').length,
    totalGroups: groups.length,
    published: faqs.filter((f) => f.status === 'published').length,
    unanswered: questions.filter((q) => !q.covered).length,
    staleGroups: states.filter((s) => s === 'stale').length,
  };
}

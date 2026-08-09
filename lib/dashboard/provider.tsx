'use client';

/**
 * Dashboard state for the whole (app) route group.
 *
 * Everything is loaded once in an effect after mount. Nothing here runs during
 * SSR: the store reads localStorage and the seed stamps Date.now(), so a server
 * pass would render markup the client immediately disagrees with. `data` is
 * null until the load resolves, and the shell renders a skeleton for that
 * frame — which is also what it will do against a real network later.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as store from './store';
import type {
  ContentPlan,
  DashboardData,
  DiscoveredQuestion,
  FaqEntry,
  FaqGroup,
  Site,
  SiteAudit,
  SiteTracking,
  Subscription,
  User,
} from './types';

type Ctx = {
  loading: boolean;
  data: DashboardData | null;
  user: User | null;
  /** Currently selected site, or null while loading / if none exist. */
  site: Site | null;
  sites: Site[];
  selectSite: (id: string) => void;
  /** Groups on the selected site, ordered. */
  groups: FaqGroup[];
  /** Every answer on the selected site, across its groups. */
  faqs: FaqEntry[];
  /** Answers in one group, ordered by position. */
  faqsIn: (groupId: string) => FaqEntry[];
  questions: DiscoveredQuestion[];
  tracking: SiteTracking | null;
  /** The generated content plan for the active site; null until one is made. */
  contentPlan: ContentPlan | null;

  addSite: (input: store.NewSite) => Promise<void>;
  renameSite: (id: string, patch: store.SitePatch) => Promise<void>;
  removeSite: (id: string) => Promise<void>;

  /** Resolves with the new group's id, so the caller can open it. */
  addGroup: (siteId: string, input: store.NewGroup) => Promise<string | undefined>;
  editGroup: (id: string, patch: Partial<store.NewGroup>) => Promise<void>;
  removeGroup: (id: string) => Promise<void>;
  moveGroup: (id: string, direction: 'up' | 'down') => Promise<void>;
  markPublished: (groupId: string) => Promise<void>;
  saveAudit: (siteId: string, report: SiteAudit) => Promise<void>;
  saveContentPlan: (plan: ContentPlan) => Promise<void>;

  addFaqs: (groupId: string, entries: store.NewFaq[]) => Promise<void>;
  editFaq: (
    id: string,
    patch: Partial<Pick<FaqEntry, 'question' | 'answer' | 'status'>>,
  ) => Promise<void>;
  removeFaq: (id: string) => Promise<void>;
  moveFaq: (id: string, direction: 'up' | 'down') => Promise<void>;
  moveFaqToGroup: (id: string, groupId: string) => Promise<void>;
  coverQuestion: (id: string) => Promise<void>;

  /** Demo-only entitlement controls — see the switcher in the header. */
  setGetCited: (siteId: string, granted: boolean) => Promise<void>;
  setSubscription: (subscription: Subscription) => Promise<void>;
  resetDemo: () => Promise<void>;
};

const DashboardContext = createContext<Ctx | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    store.loadDashboard().then((loaded) => {
      if (cancelled) return;
      setData(loaded);
      setSiteId(loaded.sites[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Every mutation funnels through here so there is exactly one place that
     writes state, and the selected site can never point at a deleted row. */
  const apply = useCallback(async (run: () => Promise<DashboardData>) => {
    const next = await run();
    setData(next);
    setSiteId((current) =>
      current && next.sites.some((s) => s.id === current) ? current : (next.sites[0]?.id ?? null),
    );
  }, []);

  const site = useMemo(() => data?.sites.find((s) => s.id === siteId) ?? null, [data, siteId]);

  const groups = useMemo(
    () => (data && site ? store.groupsForSite(data, site.id) : []),
    [data, site],
  );

  const faqs = useMemo(
    () => (data && site ? store.faqsForSite(data, site.id) : []),
    [data, site],
  );

  const faqsIn = useCallback(
    (groupId: string) => (data ? store.faqsForGroup(data, groupId) : []),
    [data],
  );

  const questions = useMemo(
    () => (data && site ? store.questionsForSite(data, site.id) : []),
    [data, site],
  );

  const tracking = useMemo(
    () => (data && site ? store.trackingForSite(data, site.id) : null),
    [data, site],
  );

  const contentPlan = useMemo(
    () => (data && site ? store.contentPlanForSite(data, site.id) : null),
    [data, site],
  );

  const value: Ctx = {
    loading: data === null,
    data,
    user: data?.user ?? null,
    site,
    sites: data?.sites ?? [],
    selectSite: setSiteId,
    groups,
    faqs,
    faqsIn,
    questions,
    tracking,
    contentPlan,

    addSite: (input) => apply(() => store.createSite(input)),
    renameSite: (id, patch) => apply(() => store.updateSite(id, patch)),
    removeSite: (id) => apply(() => store.deleteSite(id)),

    addGroup: async (siteId, input) => {
      // Identified by diffing rather than by trusting append order — the store
      // is free to sort or reorder without silently breaking the caller.
      const existing = new Set((data?.groups ?? []).map((g) => g.id));
      let created: string | undefined;
      await apply(async () => {
        const next = await store.createGroup(siteId, input);
        created = next.groups.find((g) => !existing.has(g.id))?.id;
        return next;
      });
      return created;
    },
    editGroup: (id, patch) => apply(() => store.updateGroup(id, patch)),
    removeGroup: (id) => apply(() => store.deleteGroup(id)),
    moveGroup: (id, direction) => apply(() => store.moveGroup(id, direction)),
    markPublished: (id) => apply(() => store.markGroupPublished(id)),
    saveAudit: (siteId, report) => apply(() => store.saveAudit(siteId, report)),
    saveContentPlan: (plan) => apply(() => store.saveContentPlan(plan)),

    addFaqs: (id, entries) => apply(() => store.createFaqs(id, entries)),
    editFaq: (id, patch) => apply(() => store.updateFaq(id, patch)),
    removeFaq: (id) => apply(() => store.deleteFaq(id)),
    moveFaq: (id, direction) => apply(() => store.moveFaq(id, direction)),
    moveFaqToGroup: (id, groupId) => apply(() => store.moveFaqToGroup(id, groupId)),
    coverQuestion: (id) => apply(() => store.markQuestionCovered(id)),

    setGetCited: (id, granted) => apply(() => store.setGetCited(id, granted)),
    setSubscription: (subscription) => apply(() => store.updateUser({ subscription })),
    resetDemo: () => apply(() => store.resetDashboard()),
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): Ctx {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside <DashboardProvider>.');
  return ctx;
}

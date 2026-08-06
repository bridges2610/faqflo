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
  DashboardData,
  DiscoveredQuestion,
  FaqEntry,
  Site,
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
  /** FAQs for the selected site, already ordered by position. */
  faqs: FaqEntry[];
  questions: DiscoveredQuestion[];
  tracking: SiteTracking | null;

  addSite: (input: store.NewSite) => Promise<void>;
  renameSite: (id: string, patch: Partial<store.NewSite>) => Promise<void>;
  removeSite: (id: string) => Promise<void>;
  addFaqs: (siteId: string, entries: store.NewFaq[]) => Promise<void>;
  editFaq: (
    id: string,
    patch: Partial<Pick<FaqEntry, 'question' | 'answer' | 'status'>>,
  ) => Promise<void>;
  removeFaq: (id: string) => Promise<void>;
  moveFaq: (id: string, direction: 'up' | 'down') => Promise<void>;
  coverQuestion: (id: string) => Promise<void>;
  markPublished: (siteId: string) => Promise<void>;

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

  const faqs = useMemo(
    () => (data && site ? store.faqsForSite(data, site.id) : []),
    [data, site],
  );

  const questions = useMemo(
    () => (data && site ? store.questionsForSite(data, site.id) : []),
    [data, site],
  );

  const tracking = useMemo(
    () => (data && site ? store.trackingForSite(data, site.id) : null),
    [data, site],
  );

  const value: Ctx = {
    loading: data === null,
    data,
    user: data?.user ?? null,
    site,
    sites: data?.sites ?? [],
    selectSite: setSiteId,
    faqs,
    questions,
    tracking,

    addSite: (input) => apply(() => store.createSite(input)),
    renameSite: (id, patch) => apply(() => store.updateSite(id, patch)),
    removeSite: (id) => apply(() => store.deleteSite(id)),
    addFaqs: (id, entries) => apply(() => store.createFaqs(id, entries)),
    editFaq: (id, patch) => apply(() => store.updateFaq(id, patch)),
    removeFaq: (id) => apply(() => store.deleteFaq(id)),
    moveFaq: (id, direction) => apply(() => store.moveFaq(id, direction)),
    coverQuestion: (id) => apply(() => store.markQuestionCovered(id)),
    markPublished: (id) => apply(() => store.markPublished(id)),

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

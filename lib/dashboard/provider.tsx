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
  /** Re-read tracking from Postgres — call after a run stores new checks. */
  refreshTracking: () => Promise<void>;
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
  /** Store a discovered set for a site, replacing the previous one. */
  addQuestions: (siteId: string, questions: store.NewQuestion[]) => Promise<void>;
  /** Re-mark questions the site now publishes an answer to. */
  recheckCoverage: (siteId: string) => Promise<void>;

  /**
   * Fill the local half with demo data. Development only.
   *
   * What used to be `resetDemo`. It can no longer conjure a site or a
   * subscription — those are rows — so it decorates whichever site is selected.
   */
  seedDemoData: () => Promise<void>;
};

const DashboardContext = createContext<Ctx | null>(null);

/**
 * Dashboard state, rooted in a real account.
 *
 * `user` and `sites` arrive as props from the (app) layout, which read them
 * server-side after checking the session. That ordering matters twice over:
 * the identity is established before any of this renders rather than being
 * asked for afterwards, and the first paint already knows how many sites there
 * are instead of flashing an empty dashboard at someone who has three.
 */
export function DashboardProvider({
  user,
  sites,
  children,
}: {
  user: User;
  sites: Site[];
  children: React.ReactNode;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    store.loadDashboard(user, sites).then((loaded) => {
      if (cancelled) return;
      setData(loaded);
      setSiteId(loaded.sites[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
    /*
      Keyed on the account and the site list the server sent. Re-running when
      the account changes is the thing that keeps one browser signing in as two
      people honest — the store re-points at the other account's namespaced
      storage rather than serving the first one's answers to the second.
    */
  }, [user, sites]);

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

  /*
    Tracking comes from Postgres, and only from Postgres.

    ⚠️ This is the one slice of dashboard state that is NOT read from the local
    snapshot, because these rows are evidence: they are written by the service
    role after a server-side run and `citation_checks` grants the browser SELECT
    and nothing else. Reading them from localStorage would mean the browser both
    supplied and displayed the numbers we then feed into the audit score.

    Null means "we have never checked", which the empty state says in words.
    That is deliberately different from the all-zeros emptyTracking() the local
    store still returns for a brand-new site — zeros would read as "nobody is
    citing you", which we have not measured.
  */
  const [dbTracking, setDbTracking] = useState<SiteTracking | null>(null);

  const loadTracking = useCallback(async (id: string, domain: string) => {
    try {
      setDbTracking(await store.trackingFromDb(id, domain));
    } catch (err) {
      // Never fatal. A missing 0006 migration should cost the tracking page,
      // not the whole dashboard.
      console.error('Could not load citation tracking:', err);
      setDbTracking(null);
    }
  }, []);

  useEffect(() => {
    if (!site) {
      setDbTracking(null);
      return;
    }
    // Cleared first so switching sites can't show the previous site's
    // citations against this one's name while the read is in flight.
    setDbTracking(null);
    void loadTracking(site.id, site.domain);
  }, [site, loadTracking]);

  const refreshTracking = useCallback(async () => {
    if (site) await loadTracking(site.id, site.domain);
  }, [site, loadTracking]);

  /*
    Postgres first, the local snapshot second.

    ⚠️ THE FALLBACK IS FOR THE DEV SEED, NOT FOR REAL DATA. Nothing writes
    `data.tracking` except createSite() (which puts an all-zeros
    emptyTracking() there) and the development-only seed button. So on a real
    account this resolves to zeros with `daily: []`, which is the honest empty
    state — and on a seeded dev account it is the fixture, which is the only
    way to see these screens populated without three API keys and a live run.

    It does not weaken the invariant the 0006 migration is built on. Real
    checks are service-role writes that the browser may only SELECT; this
    fallback cannot manufacture one, because nothing in the app writes a
    non-empty tracking record locally outside development.
  */
  const tracking = dbTracking ?? (data && site ? store.trackingForSite(data, site.id) : null);

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
    refreshTracking,
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
    addQuestions: (siteId, qs) => apply(() => store.addQuestions(siteId, qs)),
    recheckCoverage: (siteId) => apply(() => store.recheckCoverage(siteId)),

    seedDemoData: () => apply(() => store.seedLocalData()),
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): Ctx {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside <DashboardProvider>.');
  return ctx;
}

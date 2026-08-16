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

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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

/**
 * A tracking run, whether or not one is happening.
 *
 * `siteId` is the site the run STARTED against, so a page can tell "your run is
 * going" from "someone's run is going, but not for the site you're looking at"
 * — the customer can switch sites mid-run and the run does not follow them.
 *
 * `remaining` is null until the first pass returns. That is genuinely unknown,
 * not zero, and the difference decides whether a progress bar can show a
 * percentage at all.
 */
export type TrackingRun = {
  busy: boolean;
  siteId: string | null;
  checked: number;
  remaining: number | null;
  error: string | null;
  notes: string[];
  unreadable: string | null;
};

const IDLE_RUN: TrackingRun = {
  busy: false,
  siteId: null,
  checked: 0,
  remaining: null,
  error: null,
  notes: [],
  unreadable: null,
};

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
  /**
   * Re-read tracking from Postgres — call after a run stores new checks.
   *
   * Returns what it read rather than only setting state, so a caller that just
   * stored rows can tell whether they came back. `null` after a run that
   * reported checks means the write succeeded and the read did not — see the
   * guard in components/dashboard/tracking-workspace.tsx. Reading the `tracking`
   * value off the context instead would race: this resolves before React has
   * re-rendered with the new state.
   */
  refreshTracking: () => Promise<SiteTracking | null>;
  /** A tracking run in flight, or the idle shape. Survives navigation. */
  trackingRun: TrackingRun;
  /** Start a run for the selected site. A no-op while one is already going. */
  runTracking: () => Promise<void>;
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
  /** `append` tops the list up to the prompt cap; `replace` (default) swaps it. */
  addQuestions: (
    siteId: string,
    questions: store.NewQuestion[],
    mode?: 'replace' | 'append',
  ) => Promise<void>;
  /** A question the customer typed. Resolves to why it was refused, if it was. */
  addManualQuestion: (siteId: string, question: string) => Promise<store.ManualQuestionResult>;
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
      const next = await store.trackingFromDb(id, domain);
      setDbTracking(next);
      return next;
    } catch (err) {
      // Never fatal. A missing 0006 migration should cost the tracking page,
      // not the whole dashboard.
      console.error('Could not load citation tracking:', err);
      setDbTracking(null);
      return null;
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
    if (!site) return null;
    return loadTracking(site.id, site.domain);
  }, [site, loadTracking]);

  /*
    Driving a tracking run — from here, not from the page that starts it.

    ⚠️ IT LIVES IN THE PROVIDER SO IT SURVIVES NAVIGATION. This used to be a
    hook inside TrackingWorkspace, so clicking to any other dashboard page
    unmounted it and every setState became a no-op on a dead component. The loop
    kept running, the engines kept answering and the rows kept saving — the UI
    simply lost all trace of it, which reads exactly like a run that stopped.
    This provider is mounted by app/(app)/layout.tsx, above every page.

    ⚠️ THE CLIENT LOOPS BECAUSE THE SERVER CANNOT. A full period is 35 prompts
    against three search-backed engines; the route runs a bounded slice per
    request because this app holds itself to roughly the platform's ~60s ceiling
    and there is no queue in this project. So it posts repeatedly until the route
    reports nothing left.

    ⚠️ The pass bound is not arbitrary: at PROMPTS_PER_RUN (5) a full 35-prompt
    set needs 7 passes, so 12 leaves room and still stops a route that kept
    claiming work remaining from billing until the tab closed. Raising the prompt
    cap past 60 would need this raised with it.

    The route is idempotent — it works out what has not been checked today from
    what is already stored — so a refresh mid-run, a second tab, or an impatient
    double-click cannot double-spend the allowance.
  */
  const [trackingRun, setTrackingRun] = useState<TrackingRun>(IDLE_RUN);

  /*
    ⚠️ A REF, NOT `trackingRun.busy`. Two overlapping loops would spend the
    allowance twice, and a boolean read out of a stale closure will not stop the
    second press — the check and the set have to be synchronous.
  */
  const running = useRef(false);

  const runTracking = useCallback(async () => {
    if (running.current) return;

    /*
      ⚠️ CAPTURED AT THE START, NOT READ EACH PASS. A run that re-read `site`
      would follow the customer if they switched sites mid-run and start posting
      one site's questions against another's id — and the route would accept it,
      because the questions come from the client by design.
    */
    const startedSite = site;
    const asked = startedSite
      ? questions.filter((q) => q.siteId === startedSite.id).map((q) => q.question)
      : [];

    if (!startedSite || asked.length === 0) return;

    running.current = true;
    setTrackingRun({
      busy: true,
      siteId: startedSite.id,
      checked: 0,
      remaining: null,
      error: null,
      notes: [],
      unreadable: null,
    });

    let checked = 0;

    try {
      for (let pass = 0; pass < 12; pass++) {
        const res = await fetch('/api/dashboard/tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteId: startedSite.id, questions: asked }),
        });

        const payload = (await res.json()) as {
          checked?: number;
          remaining?: number;
          done?: boolean;
          failures?: { engine: string; detail: string }[];
          error?: string;
        };

        // `break`, not `return`: the refresh below has to happen either way.
        if (!res.ok) {
          const message = payload.error ?? 'That run failed. Please try again.';
          setTrackingRun((r) => ({ ...r, error: message }));
          break;
        }

        checked += payload.checked ?? 0;
        const remaining = payload.remaining ?? 0;

        setTrackingRun((r) => ({
          ...r,
          checked,
          remaining,
          // Surfaced rather than swallowed: a run where one engine was
          // unconfigured produced a real but partial picture, and a low number
          // with no explanation reads as "nobody cites you".
          notes: payload.failures?.length
            ? payload.failures.map((f) => `${f.engine}: ${f.detail}`)
            : r.notes,
        }));

        if (payload.done || !remaining) break;
      }
    } catch {
      setTrackingRun((r) => ({
        ...r,
        error: 'Could not reach the server. Check your connection and try again.',
      }));
    } finally {
      /*
        ⚠️ REFRESH EVEN WHEN THE RUN FAILED, AND ESPECIALLY THEN.

        A run is several requests, and the ones before a failure already asked
        the engines, spent the money and stored their rows. Refreshing only on
        the happy path left those rows in Postgres with the page still showing
        "you haven't run a check yet" until someone reloaded — the run looked
        like it had done nothing when it had done most of its work.
      */
      let refreshed: SiteTracking | null = null;
      try {
        refreshed = await loadTracking(startedSite.id, startedSite.domain);
      } catch {
        // Leave the original error standing rather than replacing it with a
        // second one about the reload — the first is what went wrong.
      }

      /*
        ⚠️ THE WRITE SUCCEEDED AND THE READ CAME BACK EMPTY. SAY SO.

        The server told us it checked `checked` questions, so those rows are in
        Postgres. If reading them back yields nothing the two disagree, and the
        page is about to render "you haven't run a check yet" — the most
        misleading sentence available, because the checks ran and were paid for.

        Not hypothetical: `citation_checks` grants the browser SELECT under an
        RLS policy (migration 0006), and when that policy is missing PostgREST
        returns an empty array with no error at all.
      */
      setTrackingRun((r) => ({
        ...r,
        busy: false,
        unreadable:
          checked > 0 && !refreshed
            ? `${checked} ${checked === 1 ? 'check' : 'checks'} ran and were saved, but reading them back returned nothing. The results are not lost — the citation_checks read policy is the likely cause.`
            : r.unreadable,
      }));

      running.current = false;
    }
  }, [site, questions, loadTracking]);

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
    trackingRun,
    runTracking,
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
    addQuestions: (siteId, qs, mode) => apply(() => store.addQuestions(siteId, qs, mode)),
    /*
      Returns the refusal instead of swallowing it.

      `apply` takes a function that always produces new data, and a rejected
      manual question produces none — so the result is unwrapped here and only
      the success path is applied. The caller gets the reason, which is the
      whole point of the discriminated result in the store.
    */
    addManualQuestion: async (siteId, question) => {
      const result = await store.addManualQuestion(siteId, question);
      if (result.ok) await apply(async () => result.data);
      return result;
    },
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

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
import { trackingPeriod, trackingPlanFor } from './plans';
import * as store from './store';
import type {
  ActionTick,
  Competitor,
  ContentPlan,
  DashboardData,
  DiscoveredQuestion,
  FaqEntry,
  FaqGroup,
  Site,
  SiteAudit,
  SiteTracking,
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
  /**
   * Why the dashboard could not be read, or null.
   *
   * ⚠️ NOT THE SAME AS AN EMPTY DASHBOARD, and the UI must never conflate the
   * two. "You have no answers yet" and "we could not fetch your answers" look
   * identical on screen and mean opposite things — one of them invites the
   * customer to retype work that is sitting safely in the database.
   */
  loadError: string | null;
  /** Re-run the load after a failure. */
  retryLoad: () => void;
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
  /** The rivals this site watches, in the owner's order. */
  competitors: Competitor[];
  /** Fixes ticked against the CURRENT report only — see toggleAction. */
  actionTicks: ActionTick[];
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
  /**
   * Start a run for the selected site. A no-op while one is already going.
   *
   * `only` overrides which questions are asked. Omitted — what Results does —
   * it asks every question tracked for the site, which is that screen's whole
   * subject. The free report passes the three it is displaying: it renders a
   * table of specific prompts with a button under it, and a button that
   * refreshes something other than the thing above it is a bug the reader
   * cannot see. The route still caps whatever arrives at the plan's promptCap.
   */
  runTracking: (only?: string[]) => Promise<void>;
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
  /** Collapse a site's pages into one list. Idempotent; a no-op below two. */
  mergeGroups: (siteId: string) => Promise<void>;

  /* The watch list. Nothing here touches the MEASURED competitor list behind
     `tracking` — that one is evidence and has no mutations at all. */
  addCompetitor: (siteId: string, input: store.NewCompetitor) => Promise<store.AddCompetitorResult>;
  editCompetitor: (id: string, patch: Partial<store.NewCompetitor>) => Promise<void>;
  removeCompetitor: (id: string) => Promise<void>;
  moveCompetitor: (id: string, direction: 'up' | 'down') => Promise<void>;

  /* ⚠️ TAKES THE REPORT'S TIMESTAMP, DELIBERATELY. A tick belongs to the audit
     that raised it; passing the stamp is what lets a newer scan clear the
     slate. See migration 0016. */
  toggleAction: (siteId: string, actionId: string, reportCheckedAt: string) => Promise<void>;
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

  /* ⚠️ editQuestion CAN REFUSE, and 'has-results' is the refusal that matters:
     the text is joined to its measurements by string equality, so rewording a
     question that has been asked orphans everything collected under the old
     wording. store.questionHasResults is the gate. */
  editQuestion: (id: string, text: string) => Promise<store.EditQuestionResult>;
  removeQuestion: (id: string) => Promise<void>;
  moveQuestion: (id: string, direction: 'up' | 'down') => Promise<void>;
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
  preloaded,
}: {
  user: User;
  sites: Site[];
  children: React.ReactNode;
  /**
   * State handed in ready-made, instead of read from Supabase on mount.
   *
   * ⚠️ DEVELOPMENT ONLY, AND IGNORED OUTRIGHT IN PRODUCTION — see `offline`
   * below. It exists for one caller: app/(dev)/shots, the route the marketing
   * screenshots are captured from. That route has no session, so the two load
   * effects here would redirect or throw before anything rendered.
   *
   * ⚠️ IT IS NOT A LOGIN BYPASS. Nothing about this weakens the real gate:
   * app/(app)/layout.tsx still calls requireUser() server-side before this
   * provider is ever constructed, and proxy.ts still turns anonymous traffic
   * away from /dashboard. All this does is let a component tree that has
   * ALREADY been handed data skip going to fetch it again.
   *
   * The alternative was exporting DashboardContext and hand-building a Ctx for
   * the screenshot route. Ctx has around forty members, most of them mutations
   * — every one would need a stub, and the stubs would silently rot the next
   * time a real one was added. One prop reuses the whole provider instead.
   */
  preloaded?: { data: DashboardData; tracking: SiteTracking | null };
}) {
  /*
    The guard, resolved once. `process.env.NODE_ENV` is inlined at build time,
    so in a production bundle this is the constant `false` and every branch
    below it folds away — the prop becomes unreachable even if something
    passes it.
  */
  const offline = process.env.NODE_ENV !== 'production' && preloaded !== undefined;
  // Seeded from `preloaded` when offline, so the very first render is already
  // populated — no skeleton frame for a screenshot to catch.
  const [data, setData] = useState<DashboardData | null>(offline ? preloaded!.data : null);
  const [siteId, setSiteId] = useState<string | null>(
    offline ? (preloaded!.data.sites[0]?.id ?? null) : null,
  );
  /*
    ⚠️ LOADING CAN FAIL NOW, AND IT COULD NOT BEFORE.

    loadDashboard() used to read one localStorage string and, on a bad parse,
    hand back an empty snapshot — there was nothing to catch. Since 0009 it
    issues four queries against Postgres and throws if any of them fails, which
    is deliberate: returning empty would render an established account as a
    brand-new one, and the customer's next move would be to write their answers
    again on top of rows that still exist.

    Without this state that throw was an unhandled rejection: `data` stayed
    null, `loading` stayed true, and the shell spun forever with nothing said.
    A dropped connection became a dashboard that never loaded.
  */
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped by retryLoad() to re-run the effect below. A counter rather than a
  // boolean so a second failure can still be retried a third time.
  const [loadNonce, setLoadNonce] = useState(0);

  useEffect(() => {
    // Offline: state was seeded above and there is no session to read with.
    if (offline) return;

    let cancelled = false;
    setLoadError(null);
    store
      .loadDashboard(user, sites)
      .then((loaded) => {
        if (cancelled) return;
        setData(loaded);
        setSiteId(loaded.sites[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // `data` is deliberately left null. Showing a half-populated dashboard
        // built from a failed read is the thing the throw exists to prevent.
        setLoadError(err instanceof Error ? err.message : 'Something went wrong.');
      });
    return () => {
      cancelled = true;
    };
    /*
      Keyed on the account and the site list the server sent. Re-running when
      the account changes is the thing that keeps one browser signing in as two
      people honest — the store re-points at the other account's namespaced
      storage rather than serving the first one's answers to the second.

      loadNonce is what "Try again" turns — the inputs are unchanged after a
      failure, so without it there is nothing for React to key a re-run on.
    */
  }, [user, sites, loadNonce, offline]);

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

  /* Sorted here rather than trusted from the store, so a row whose position was
     just swapped renders in its new place without waiting for a reload. */
  const actionTicks = useMemo(
    () => (data && site ? data.actionTicks.filter((t) => t.siteId === site.id) : []),
    [data, site],
  );

  const competitors = useMemo(
    () =>
      data && site
        ? data.competitors
            .filter((c) => c.siteId === site.id)
            .sort((a, b) => a.position - b.position)
        : [],
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
  const [dbTracking, setDbTracking] = useState<SiteTracking | null>(
    offline ? preloaded!.tracking : null,
  );

  const loadTracking = useCallback(async (id: string, domain: string) => {
    try {
      /*
        The budget window, derived once here and passed down.

        The provider is the only place holding both the site and the user, and
        the meter has to count over exactly the window the tracking route
        enforces — see the note on trackingFromDb's `period`.
      */
      /*
        ⚠️ Looked up by the id passed in, NOT read off the selected `site`.
        This runs for whichever site was asked for, and reading the selection
        instead would compute one site's window while counting another's checks
        the moment someone switches sites mid-load.
      */
      const target = sites.find((s) => s.id === id) ?? null;

      const period = trackingPeriod({
        plan: user.plan,
        planSince: user.planSince,
        accountCreatedAt: user.createdAt,
      });

      const plan = trackingPlanFor(user);

      /*
        How far back the chart reads — and the two plans genuinely differ.

        ⚠️ FREE READS FROM THE ACCOUNT'S CREATION DATE, NOT FROM A ROLLING
        WINDOW. Free gets one reading, ever, taken during the onboarding scan. A
        window rolling backwards from today would drop that reading off its own
        chart a month later, leaving a Results page that says "we have not
        looked" about a check we definitely ran — and the upgrade prompt beside
        it would be arguing against evidence the page just deleted. Pro's history
        never stops being added to, so 30 days back is the right span for them
        and always will be.
      */
      const since = new Date();
      if (plan.id === 'free' && user.createdAt) {
        since.setTime(new Date(user.createdAt).getTime());
      } else {
        since.setUTCDate(since.getUTCDate() - 29);
      }
      since.setUTCHours(0, 0, 0, 0);

      const next = await store.trackingFromDb(
        id,
        domain,
        period,
        plan,
        since,
        target?.nextCheckAt ?? null,
      );
      setDbTracking(next);
      return next;
    } catch (err) {
      // Never fatal. A missing 0006 migration should cost the tracking page,
      // not the whole dashboard.
      console.error('Could not load citation tracking:', err);
      setDbTracking(null);
      return null;
    }
    // Honest deps: the period depends on the site row and the subscription, so
    // an empty array here would freeze the first render's answer forever.
  }, [sites, user]);

  useEffect(() => {
    // Offline: tracking came in with the rest of the fixture. Falling through
    // would clear it to null and then query a database we have no session for,
    // which is how the Results screenshot ends up empty.
    if (offline) return;

    if (!site) {
      setDbTracking(null);
      return;
    }
    // Cleared first so switching sites can't show the previous site's
    // citations against this one's name while the read is in flight.
    setDbTracking(null);
    void loadTracking(site.id, site.domain);
  }, [site, loadTracking, offline]);

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

  const runTracking = useCallback(async (only?: string[]) => {
    if (running.current) return;

    /*
      ⚠️ CAPTURED AT THE START, NOT READ EACH PASS. A run that re-read `site`
      would follow the customer if they switched sites mid-run and start posting
      one site's questions against another's id — and the route would accept it,
      because the questions come from the client by design.
    */
    const startedSite = site;

    /*
      ⚠️ `only` IS NOT A SHORTCUT PAST THE CAP, AND CANNOT BE. The route reads
      the plan off the profile row and slices whatever arrives to promptCap, so
      the worst a caller can do here is choose WHICH questions get asked, not
      how many. That is the same trust boundary the unfiltered path already sits
      on — the route's own header says the body may not decide "which site, how
      many prompts, or whether the customer is allowed".

      It exists because the free report shows three named prompts and a button.
      Falling back to every tracked question would have that button refresh rows
      the table is not displaying, on an account whose allowance is three runs
      in total.
    */
    const asked =
      only ??
      (startedSite
        ? questions.filter((q) => q.siteId === startedSite.id).map((q) => q.question)
        : []);

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
    // Not loading if we have stopped and failed — otherwise the shell would
    // show a spinner and an error message at the same time.
    loading: data === null && loadError === null,
    loadError,
    retryLoad: () => setLoadNonce((n) => n + 1),
    data,
    user: data?.user ?? null,
    site,
    sites: data?.sites ?? [],
    selectSite: setSiteId,
    groups,
    faqs,
    faqsIn,
    questions,
    competitors,
    actionTicks,
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
    mergeGroups: (siteId) => apply(() => store.mergeGroupsForSite(siteId)),

    /*
      ⚠️ THIS ONE DOES NOT GO THROUGH apply() ON THE WAY IN, AND THE REASON IS
      THE REFUSAL. A duplicate, a bad domain, your own domain and a full list
      are four different things the customer can fix, and apply() only speaks
      DashboardData — routing a refusal through it would mean inventing a
      snapshot to hand back, which is a state write for a thing that changed no
      state. So the store is called directly and apply() runs only on success.
    */
    addCompetitor: async (siteId, input) => {
      const result = await store.addCompetitor(siteId, input);
      if (result.ok) await apply(async () => result.data);
      return result;
    },
    editCompetitor: (id, patch) => apply(() => store.updateCompetitor(id, patch)),
    removeCompetitor: (id) => apply(() => store.deleteCompetitor(id)),
    moveCompetitor: (id, direction) => apply(() => store.moveCompetitor(id, direction)),
    toggleAction: (siteId, actionId, at) =>
      apply(() => store.toggleActionTick(siteId, actionId, at)),
    markPublished: (id) => apply(() => store.markGroupPublished(id)),
    saveAudit: (siteId, report) => apply(() => store.saveAudit(siteId, report)),
    saveContentPlan: (plan) => apply(() => store.saveContentPlan(plan)),

    addFaqs: (id, entries) => apply(() => store.createFaqs(id, entries)),
    editFaq: (id, patch) => apply(() => store.updateFaq(id, patch)),
    removeFaq: (id) => apply(() => store.deleteFaq(id)),
    moveFaq: (id, direction) => apply(() => store.moveFaq(id, direction)),
    moveFaqToGroup: (id, groupId) => apply(() => store.moveFaqToGroup(id, groupId)),
    coverQuestion: (id) => apply(() => store.markQuestionCovered(id)),

    /* Direct, then apply() on success — same shape as addCompetitor, and for
       the same reason: apply() only speaks DashboardData, so a refusal has
       nothing to hand it. */
    editQuestion: async (id, text) => {
      const result = await store.updateQuestion(id, text);
      if (result.ok) await apply(async () => result.data);
      return result;
    },
    removeQuestion: (id) => apply(() => store.deleteQuestion(id)),
    moveQuestion: (id, direction) => apply(() => store.moveQuestion(id, direction)),
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

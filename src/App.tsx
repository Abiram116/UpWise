import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { HashRouter, Route, Routes, useNavigate } from "react-router";
import { useAuth } from "./hooks/useAuth";
import { useActivity, useItems, useProfile, useSessions, useSetStatus, markNotificationOpened } from "./lib/api";
import { replanNotifications, snoozeNotification } from "./lib/notifications";
import { installShareBridge } from "./lib/share";
import { isTauri } from "./lib/platform";
import { getPref, setPref } from "./lib/store";
import { flushOutbox } from "./lib/outbox";
import { loadOpens, recordOpen } from "./lib/slot";
import { owlPersona } from "./components/BrandMark";
import { Splash } from "./components/Splash";
import { useReducedMotion } from "motion/react";
import { connection } from "./lib/connection";
import { isNetworkError } from "./lib/errors";
import { pluralize } from "./lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { ErrorState, useToast } from "./components/ui";
import { AppShell } from "./components/AppShell";
import { WindowControls } from "./components/WindowControls";
import { Spinner } from "./components/ui";
import { HomeScreen } from "./screens/Home";
import { useCoach } from "./lib/coach";
import { CelebrationLayer, celebrate } from "./components/Celebrate";
import { queryClient } from "./lib/queryClient";
import { useStreak } from "./lib/useStreak";
import type { Item } from "./lib/types";
import { WhatsNewGate } from "./components/WhatsNew";
import { sessionStore, useSessionStore } from "./components/SessionBar";
import { breakDaySet, streak, todayMinutes } from "./lib/stats";
import "./lib/android-bridge";

// Home is the one screen almost every cold start needs immediately — everything else is
// lazy so the initial bundle the WebView has to parse before first paint stays small.
const Onboarding = lazy(() => import("./screens/Onboarding").then((m) => ({ default: m.Onboarding })));
const PinGate = lazy(() => import("./screens/PinGate").then((m) => ({ default: m.PinGate })));
const FeedScreen = lazy(() => import("./screens/Feed").then((m) => ({ default: m.FeedScreen })));
const LibraryScreen = lazy(() => import("./screens/Library").then((m) => ({ default: m.LibraryScreen })));
const ItemDetailScreen = lazy(() => import("./screens/ItemDetail").then((m) => ({ default: m.ItemDetailScreen })));
const StatsScreen = lazy(() => import("./screens/Stats").then((m) => ({ default: m.StatsScreen })));
const SettingsScreen = lazy(() => import("./screens/Settings").then((m) => ({ default: m.SettingsScreen })));

installShareBridge();

export default function App() {
  return (
    <HashRouter>
      <Gate />
    </HashRouter>
  );
}

const ONBOARDED_KEY = "upwise:onboarded";

function Gate() {
  const { session, loading, configError, needsPin } = useAuth();
  const profile = useProfile(!!session);
  // Read synchronously (not via the async Tauri store) so a returning user's app shell can
  // paint on the very first render instead of waiting on a network profile fetch every cold start.
  const reduceMotion = useReducedMotion();
  const [splashDone, setSplashDone] = useState(() => reduceMotion === true);
  useEffect(() => { if (splashDone) return; const t = window.setTimeout(() => setSplashDone(true), 1250); return () => window.clearTimeout(t); }, [splashDone]);
  const [cachedOnboarded] = useState(() => { try { return localStorage.getItem(ONBOARDED_KEY) === "1"; } catch { return false; } });

  useEffect(() => {
    if (profile.data?.onboarded === undefined) return;
    try { localStorage.setItem(ONBOARDED_KEY, profile.data.onboarded ? "1" : "0"); } catch { /* ignore */ }
  }, [profile.data?.onboarded]);

  // Cold start: show the owl's assembly animation for a beat even when the session resumes instantly.
  if (loading || !splashDone) return <Splash />;
  if (needsPin) return <Suspense fallback={<Center><Spinner size={26} /></Center>}><PinGate /></Suspense>;
  if (configError) {
    return (
      <Center>
        <h1 className="headline-sm">UpWise isn't set up</h1>
        <p className="body" style={{ maxWidth: 380, textAlign: "center", color: "var(--on-surface-2)" }}>{configError}</p>
      </Center>
    );
  }
  if (!session) return <Center><Spinner size={26} /></Center>;

  const knownOnboarded = cachedOnboarded || profile.data?.onboarded === true;
  if (!knownOnboarded) {
    // No cached fast-path yet (first launch ever) — genuinely need the profile to decide.
    if (profile.isLoading) return <Center><Spinner size={26} /></Center>;
    if (profile.error) return <Center><div style={{ maxWidth: 420 }}><ErrorState error={profile.error} onRetry={() => profile.refetch()} /></div></Center>;
    if (!profile.data?.onboarded) return <><WindowControls /><Suspense fallback={<Center><Spinner size={26} /></Center>}><Onboarding /></Suspense></>;
  }

  return (
    <WhatsNewGate>
      <WindowControls />
      <Background />
      <GlobalErrors />
      <Celebrations />
      <CelebrationLayer />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/feed" element={<FeedScreen />} />
          <Route path="/library" element={<LibraryScreen />} />
          <Route path="/item/:id" element={<ItemDetailScreen />} />
          <Route path="/stats" element={<StatsScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Route>
      </Routes>
    </WhatsNewGate>
  );
}

/** Non-visual: keeps nudges planned and handles notification taps. */
function Background() {
  const profile = useProfile();
  const items = useItems();
  const sessions = useSessions(30);
  const activity = useActivity(400);
  const { coach } = useCoach(false);
  const setStatus = useSetStatus();
  const startSession = useSessionStore((s) => s.start);
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  // Writes made offline / while the database was paused sit in the outbox — replay them on
  // startup and every time the connection comes back, then refresh what they touched.
  useEffect(() => {
    const flush = async () => {
      const r = await flushOutbox();
      if (!r.done && !r.failed) return;
      for (const key of ["items", "categories", "activity", "sessions", "profile"]) void qc.invalidateQueries({ queryKey: [key] });
      if (r.failed) toast(`${pluralize(r.failed, "offline change")} couldn't be applied and ${r.failed === 1 ? "was" : "were"} skipped`);
      else if (r.saved) toast(`Synced — ${pluralize(r.saved, "saved link")} analyzed`);
      else toast(`Synced ${pluralize(r.done, "offline change")}`);
    };
    void flush();
    // On reconnect, pull fresh data as well — anything on screen may be days old.
    return connection.onReconnect(() => { void flush(); void qc.invalidateQueries(); });
  }, [qc, toast]);
  // The owl you picked follows you across devices: profile → the on-device store.
  const pickedOwl = profile.data?.settings.owl_persona;
  useEffect(() => { if (pickedOwl) owlPersona.set(pickedOwl); }, [pickedOwl]);
  // Every time the app comes to the foreground, that hour votes for being "a free moment" —
  // the study slot is learned from these plus real sessions.
  useEffect(() => {
    void recordOpen();
    const onShow = () => { if (document.visibilityState === "visible") void recordOpen(); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);
  // Persisted (survives cold starts, unlike a ref) so reopening the app the same day never
  // re-plans. Settings changes replan directly via their own save handler, independent of this.
  const plannedRef = useRef<string>("");
  // Nudges are composed up to 2 days ahead with a specific item baked in — by the time one
  // fires, that item may already be finished, skipped, or deleted. Keep a live ref (not a
  // dependency of the action listener below, so the listener itself stays stable) to check
  // against at tap-time instead of blindly applying a now-stale action.
  const itemsRef = useRef<typeof items.data>(undefined);
  useEffect(() => { itemsRef.current = items.data; }, [items.data]);

  // Replan once a day — and again the moment today's goal is met, so the evening "minutes to
  // your goal" nudge disappears instead of nagging about something already done.
  const goalMet = !!(profile.data && activity.data && todayMinutes(activity.data) >= (profile.data.daily_target_minutes ?? 30));
  useEffect(() => {
    if (!isTauri || !profile.data || !items.data || !sessions.data || !activity.data) return;
    const key = `${new Date().toDateString()}|${goalMet}`;
    let cancelled = false;
    (async () => {
      const lastPlanned = await getPref<string>("notifPlannedDate", "");
      if (cancelled || lastPlanned === key || plannedRef.current === key) return;
      plannedRef.current = key;
      await setPref("notifPlannedDate", key);
      void replanNotifications({ profile: profile.data!, items: items.data!, sessions: sessions.data!, coach, activity: activity.data, opens: await loadOpens() });
    })();
    return () => { cancelled = true; };
    // Deliberately excludes `coach` — a coach refresh should not re-trigger a full OS reschedule;
    // only a new calendar day (or an explicit settings change, handled separately) should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data, items.data, sessions.data, activity.data, goalMet]);

  // Notification taps and buttons, delivered by MainActivity (window.__upwiseNotif). The
  // payload is { action, notification: { title, body, extra: { itemId } } } — the old code read
  // `extra`/`title` off the top level, found nothing, and every button just opened the app.
  useEffect(() => {
    if (!isTauri) return;
    type Payload = { action?: string; notification?: { title?: string; body?: string; extra?: { itemId?: string } } };
    const handle = (p: Payload) => {
      const n = p.notification ?? {};
      const itemId = n.extra?.itemId || null;
      const title = n.title ?? "", body = n.body ?? "";
      // Items may still be loading on a cold start — the persisted cache usually has them.
      const all = itemsRef.current ?? queryClient.getQueryData<Item[]>(["items"]);
      const current = itemId ? all?.find((i) => i.id === itemId) : undefined;
      const knownGone = !!all && !!itemId && !current;
      const resolved = current?.status === "completed" || current?.status === "skipped";
      const action = p.action === "snooze" ? "later" : p.action;
      // Android can only deliver a button tap by opening the app — for the "not now" answers,
      // do the thing and step straight back out of the way.
      const back = () => window.AndroidNative?.moveToBackground?.();
      // "Done" on the live study-session notification: finish and celebrate, no need to open anything.
      if (action === "session-done") { void sessionStore.stop(true).catch(() => toast("Couldn't finish — open the app to stop the timer")); return; }
      if (action === "skip") {
        if (itemId && !knownGone && !resolved) {
          setStatus(itemId, "skipped").then(() => toast("Skipped"), () => toast("Couldn't skip it — try from the app"));
        }
        back();
        return;
      }
      if (action === "later" || action === "tomorrow") {
        void snoozeNotification(title, body, itemId, action).finally(back);
        return;
      }
      void markNotificationOpened(title);
      if (action === "start" && current && !resolved) {
        startSession(current).catch(() => {});
        nav(`/item/${current.id}`);
        return;
      }
      nav(itemId && !knownGone ? `/item/${itemId}` : "/");
    };
    const w = window as typeof window & { __upwiseNotif?: (p: Payload) => void; __upwisePendingNotif?: Payload };
    w.__upwiseNotif = handle;
    if (w.__upwisePendingNotif) { const pending = w.__upwisePendingNotif; w.__upwisePendingNotif = undefined; handle(pending); }
    return () => { if (w.__upwiseNotif === handle) w.__upwiseNotif = undefined; };
  }, [nav, setStatus, startSession, toast]);

  return null;
}

const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

/** In-app wins: today's goal, streak milestones, an emptied backlog. Each fires once (keyed by
 * day or milestone) and only from real data changes, so reopening the app never repeats one. */
function Celebrations() {
  const profile = useProfile();
  const items = useItems();
  const activity = useActivity(400);
  const streakInfo = useStreak();
  const blocks = streakInfo?.blocks;
  // Earning a block of 4 days banks 2 freeze days — say so the moment it happens. A reset run
  // starts counting again; the first time on a device it's recorded silently.
  useEffect(() => {
    if (blocks === undefined) return;
    (async () => {
      const seen = await getPref("celebratedBlocks", -1);
      if (seen < 0 || blocks < seen) { await setPref("celebratedBlocks", blocks); return; }
      if (blocks > seen) { await setPref("celebratedBlocks", blocks); void celebrate({ kind: "shield", streak: streakInfo?.current }); }
    })();
  }, [blocks, streakInfo?.current]);
  const pendingCount = items.data?.filter((i) => i.status === "inbox" || i.status === "queued" || i.status === "in_progress").length;
  const prevPending = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!profile.data || !activity.data) return;
    const target = profile.data.daily_target_minutes ?? 30;
    const mins = todayMinutes(activity.data);
    const st = streak(activity.data, breakDaySet(profile.data.settings)).current;
    const day = new Date().toDateString();
    (async () => {
      if (mins >= target && (await getPref("celebratedGoal", "")) !== day) {
        await setPref("celebratedGoal", day);
        void celebrate({ kind: "goal", minutes: mins, streak: st });
        return;
      }
      const milestone = [...STREAK_MILESTONES].reverse().find((m) => st >= m) ?? 0;
      const celebrated = await getPref("celebratedStreak", -1);
      // First time seeing this device: a streak you already had isn't news — start from it
      // silently. And a broken streak resets the ladder, so a new run gets its milestones again.
      if (celebrated < 0 || milestone < celebrated) { await setPref("celebratedStreak", milestone); return; }
      if (milestone && celebrated < milestone) {
        await setPref("celebratedStreak", milestone);
        void celebrate({ kind: "streak", streak: milestone });
      }
    })();
  }, [profile.data, activity.data]);

  useEffect(() => {
    if (pendingCount === undefined) return;
    if (prevPending.current && prevPending.current > 0 && pendingCount === 0) void celebrate({ kind: "cleared" });
    prevPending.current = pendingCount;
  }, [pendingCount]);

  return null;
}

/** Uncaught promise failures only feed the connection store. They must never toast: native
 * plugins reject quietly in the background all the time, and every user action already
 * reports its own failure — toasting these showed "That didn't work" after actions that
 * had actually succeeded. */
function GlobalErrors() {
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isNetworkError(e.reason)) connection.reportError(e.reason);
      else console.warn("unhandled rejection", e.reason);
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);
  return null;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>{children}</div>;
}

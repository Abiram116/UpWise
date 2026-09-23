import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { HashRouter, Route, Routes, useNavigate } from "react-router";
import { useAuth } from "./hooks/useAuth";
import { useActivity, useItems, useProfile, useSessions, useSetStatus, markNotificationOpened } from "./lib/api";
import { replanNotifications, snoozeNotification } from "./lib/notifications";
import { installShareBridge } from "./lib/share";
import { isTauri } from "./lib/platform";
import { getPref, setPref } from "./lib/store";
import { flushOutbox } from "./lib/outbox";
import { connection } from "./lib/connection";
import { isNetworkError } from "./lib/errors";
import { pluralize } from "./lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { ErrorState, useToast } from "./components/ui";
import { AppShell } from "./components/AppShell";
import { WindowControls } from "./components/WindowControls";
import { Spinner } from "./components/ui";
import { HomeScreen, useCoach } from "./screens/Home";
import { WhatsNewGate } from "./components/WhatsNew";
import { useSessionStore } from "./components/SessionBar";
import { breakDaySet, streak, todayMinutes } from "./lib/stats";
import { haptic } from "./lib/haptics";
import "./lib/android-bridge";

// Home is the one screen almost every cold start needs immediately — everything else is
// lazy so the initial bundle the WebView has to parse before first paint stays small.
const Onboarding = lazy(() => import("./screens/Onboarding").then((m) => ({ default: m.Onboarding })));
const PinGate = lazy(() => import("./screens/PinGate").then((m) => ({ default: m.PinGate })));
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
  const [cachedOnboarded] = useState(() => { try { return localStorage.getItem(ONBOARDED_KEY) === "1"; } catch { return false; } });

  useEffect(() => {
    if (profile.data?.onboarded === undefined) return;
    try { localStorage.setItem(ONBOARDED_KEY, profile.data.onboarded ? "1" : "0"); } catch { /* ignore */ }
  }, [profile.data?.onboarded]);

  if (loading) return <Center><Spinner size={26} /></Center>;
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
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomeScreen />} />
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
  const activity = useActivity(14);
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
      void replanNotifications({ profile: profile.data!, items: items.data!, sessions: sessions.data!, coach, activity: activity.data });
    })();
    return () => { cancelled = true; };
    // Deliberately excludes `coach` — a coach refresh should not re-trigger a full OS reschedule;
    // only a new calendar day (or an explicit settings change, handled separately) should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data, items.data, sessions.data, activity.data, goalMet]);

  useEffect(() => {
    if (!isTauri) return;
    let off: (() => void) | undefined;
    import("@tauri-apps/plugin-notification").then(({ onAction }) => {
      onAction((n) => {
        // The plugin's TS types don't declare `actionId`, but the native side always sends it -
        // "tap" for the notification body itself, or the pressed action button's own id.
        const payload = n as typeof n & { actionId?: string };
        const itemId = (payload.extra as { itemId?: string } | undefined)?.itemId || null;
        void markNotificationOpened(payload.title);

        // itemsRef may still be undefined on a cold start (tapped from a killed-app notification
        // before Background's query resolves) — default to trusting the notification in that
        // case, and only actively block once we have fresh data proving it's stale.
        const loaded = itemsRef.current !== undefined;
        const current = itemId ? itemsRef.current?.find((i) => i.id === itemId) : undefined;
        const knownGone = loaded && itemId && !current;
        const knownResolved = current?.status === "completed" || current?.status === "skipped";
        const action = payload.actionId === "snooze" ? "later" : payload.actionId;
        // Android can only deliver a button tap by opening the app — for the "not now" answers,
        // do the thing and step straight back out of the way.
        const backToWhatYouWereDoing = () => window.AndroidNative?.moveToBackground?.();
        if (action === "skip") {
          if (itemId && !knownGone && !knownResolved) void setStatus(itemId, "skipped").catch(() => {});
          backToWhatYouWereDoing();
          return;
        }
        if (action === "later" || action === "tomorrow") {
          void snoozeNotification(payload.title, payload.body ?? "", itemId, action);
          backToWhatYouWereDoing();
          return;
        }
        if (action === "start" && current && !knownResolved) {
          void startSession(current).catch(() => {});
          nav(`/item/${current.id}`);
          return;
        }
        nav(itemId && !knownGone ? `/item/${itemId}` : "/");
      }).then((l) => { off = () => l.unregister(); });
    }).catch(() => {});
    return () => off?.();
  }, [nav, setStatus, startSession]);

  return null;
}

const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

/** In-app wins: today's goal, streak milestones, an emptied backlog. Each fires once (keyed by
 * day or milestone) and only from real data changes, so reopening the app never repeats one. */
function Celebrations() {
  const profile = useProfile();
  const items = useItems();
  const activity = useActivity(14);
  const toast = useToast();
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
        haptic.success();
        toast(`Today's goal done — ${mins} min learned.${st > 1 ? ` ${st}-day streak.` : ""}`, undefined, { tone: "celebrate" });
        return;
      }
      const milestone = [...STREAK_MILESTONES].reverse().find((m) => st >= m) ?? 0;
      const celebrated = await getPref("celebratedStreak", 0);
      // A broken streak resets the ladder, so a new run gets its milestones again.
      if (milestone < celebrated) { await setPref("celebratedStreak", milestone); return; }
      if (milestone && celebrated < milestone) {
        await setPref("celebratedStreak", milestone);
        haptic.success();
        toast(`${milestone}-day streak. That's a habit now.`, undefined, { tone: "celebrate" });
      }
    })();
  }, [profile.data, activity.data, toast]);

  useEffect(() => {
    if (pendingCount === undefined) return;
    if (prevPending.current && prevPending.current > 0 && pendingCount === 0) {
      haptic.success();
      toast("Backlog cleared — everything you saved is learned or sorted.", undefined, { tone: "celebrate" });
    }
    prevPending.current = pendingCount;
  }, [pendingCount, toast]);

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

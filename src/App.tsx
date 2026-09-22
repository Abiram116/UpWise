import { useEffect, useRef } from "react";
import { HashRouter, Route, Routes, useNavigate } from "react-router";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "./hooks/useAuth";
import { useItems, useProfile, useSessions, useSetStatus, markNotificationOpened } from "./lib/api";
import { replanNotifications, snoozeNotification } from "./lib/notifications";
import { installShareBridge } from "./lib/share";
import { isTauri } from "./lib/platform";
import { getPref, setPref } from "./lib/store";
import { AppShell } from "./components/AppShell";
import { WindowControls } from "./components/WindowControls";
import { Spinner } from "./components/ui";
import { Onboarding } from "./screens/Onboarding";
import { HomeScreen, useCoach } from "./screens/Home";
import { LibraryScreen } from "./screens/Library";
import { ItemDetailScreen } from "./screens/ItemDetail";
import { StatsScreen } from "./screens/Stats";
import { SettingsScreen } from "./screens/Settings";

installShareBridge();

export default function App() {
  return (
    <HashRouter>
      <Gate />
    </HashRouter>
  );
}

function Gate() {
  const { session, loading, error } = useAuth();
  const profile = useProfile();

  if (loading || (session && profile.isLoading)) {
    return <Center><Spinner size={26} /></Center>;
  }
  if (error || !session) {
    return (
      <Center>
        <AlertTriangle size={28} style={{ color: "var(--warm)" }} />
        <h3 className="headline-sm">Couldn't connect</h3>
        <p className="meta selectable" style={{ maxWidth: 360, textAlign: "center" }}>{error ?? "No session"}</p>
      </Center>
    );
  }
  if (profile.error) {
    return <Center><p className="meta">{profile.error.message}</p></Center>;
  }
  if (!profile.data?.onboarded) return <><WindowControls /><Onboarding /></>;

  return (
    <>
      <WindowControls />
      <Background />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/library" element={<LibraryScreen />} />
          <Route path="/item/:id" element={<ItemDetailScreen />} />
          <Route path="/stats" element={<StatsScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Route>
      </Routes>
    </>
  );
}

/** Non-visual: keeps nudges planned and handles notification taps. */
function Background() {
  const profile = useProfile();
  const items = useItems();
  const sessions = useSessions(30);
  const { coach } = useCoach(false);
  const setStatus = useSetStatus();
  const nav = useNavigate();
  // Persisted (survives cold starts, unlike a ref) so reopening the app the same day never
  // re-plans. Settings changes replan directly via their own save handler, independent of this.
  const plannedRef = useRef<string>("");

  useEffect(() => {
    if (!isTauri || !profile.data || !items.data || !sessions.data) return;
    const today = new Date().toDateString();
    let cancelled = false;
    (async () => {
      const lastPlanned = await getPref<string>("notifPlannedDate", "");
      if (cancelled || lastPlanned === today || plannedRef.current === today) return;
      plannedRef.current = today;
      await setPref("notifPlannedDate", today);
      void replanNotifications({ profile: profile.data!, items: items.data!, sessions: sessions.data!, coach });
    })();
    return () => { cancelled = true; };
    // Deliberately excludes `coach` — a coach refresh should not re-trigger a full OS reschedule;
    // only a new calendar day (or an explicit settings change, handled separately) should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data, items.data, sessions.data]);

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

        if (payload.actionId === "skip" && itemId) { void setStatus(itemId, "skipped"); return; }
        if (payload.actionId === "snooze") { void snoozeNotification(payload.title, payload.body ?? "", itemId); return; }
        nav(itemId ? `/item/${itemId}` : "/");
      }).then((l) => { off = () => l.unregister(); });
    }).catch(() => {});
    return () => off?.();
  }, [nav, setStatus]);

  return null;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>{children}</div>;
}

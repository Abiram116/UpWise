import { useEffect, useRef } from "react";
import { HashRouter, Route, Routes, useNavigate } from "react-router";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "./hooks/useAuth";
import { useItems, useProfile, useSessions, markNotificationOpened } from "./lib/api";
import { replanNotifications } from "./lib/notifications";
import { installShareBridge } from "./lib/share";
import { isTauri } from "./lib/platform";
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
  const nav = useNavigate();
  const planned = useRef<string>("");

  useEffect(() => {
    if (!isTauri || !profile.data || !items.data || !sessions.data) return;
    // Replan at most once per (day, item count, settings) so we don't spam the scheduler.
    const key = `${new Date().toDateString()}|${items.data.length}|${JSON.stringify(profile.data.settings)}|${coach?.fetched_at ?? 0}`;
    if (planned.current === key) return;
    planned.current = key;
    void replanNotifications({ profile: profile.data, items: items.data, sessions: sessions.data, coach });
  }, [profile.data, items.data, sessions.data, coach]);

  useEffect(() => {
    if (!isTauri) return;
    let off: (() => void) | undefined;
    import("@tauri-apps/plugin-notification").then(({ onAction }) => {
      onAction((n) => {
        void markNotificationOpened(n.title);
        const itemId = (n.extra as { itemId?: string } | undefined)?.itemId;
        nav(itemId ? `/item/${itemId}` : "/");
      }).then((l) => { off = () => l.unregister(); });
    }).catch(() => {});
    return () => off?.();
  }, [nav]);

  return null;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>{children}</div>;
}

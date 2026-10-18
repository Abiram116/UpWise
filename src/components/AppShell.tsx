import { Suspense, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { BarChart3, GalleryVertical, Home, Library, Plus, Settings } from "lucide-react";
import { AddSheet, useAddQueue } from "./AddSheet";
import { SessionBar } from "./SessionBar";
import { ConnectionBanner } from "./ConnectionBanner";
import { Owl } from "./BrandMark";
import { useBackHandler } from "../lib/backHandler";
import "../lib/android-bridge";
import { onShare } from "../lib/share";
import { extractUrl } from "../lib/utils";
import { Spinner, spring } from "./ui";

const dests = [
  { to: "/", label: "Today", icon: Home },
  { to: "/feed", label: "Scroll", icon: GalleryVertical },
  { to: "/library", label: "Library", icon: Library },
  { to: "/stats", label: "Progress", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

function Dest({ to, label, icon: Icon, layoutId }: (typeof dests)[number] & { layoutId: string }) {
  return (
    // replace: tabs are siblings, not a trail — switching them shouldn't pile up history
    // that the back gesture then has to walk through one tab at a time.
    <NavLink to={to} end={to === "/"} replace className="dest">
      {({ isActive }) => (
        <span data-active={isActive} className="dest" style={{ display: "contents" }}>
          <span className="dest-ind">
            {isActive && <motion.span layoutId={layoutId} className="dest-pill" transition={spring} />}
            <Icon size={22} strokeWidth={isActive ? 2.4 : 1.9} />
          </span>
          <span>{label}</span>
        </span>
      )}
    </NavLink>
  );
}

export function AppShell() {
  const loc = useLocation();
  const nav = useNavigate();
  const [addOpen, setAddOpen] = useState(false);

  // Launcher shortcuts (long-press the icon): jump straight to the Scroll feed, Today, or the
  // save sheet. Each request carries a token so the native side's retries only act once.
  useEffect(() => {
    const seen = new Set<string>();
    const go = (target: string, token?: string) => {
      if (token) { if (seen.has(token)) return; seen.add(token); }
      if (target === "feed") nav("/feed");
      else if (target === "today") nav("/");
      else if (target === "add" || target === "note" || target === "link") { nav("/"); setAddOpen(true); }
    };
    window.__upwiseGo = go;
    const pending = window.__upwisePendingGo;
    if (pending) { window.__upwisePendingGo = undefined; go(pending.t, pending.k); }
    return () => { if (window.__upwiseGo === go) window.__upwiseGo = undefined; };
  }, [nav]);

  // Android back, after any open sheet has had its turn: a detail screen goes back to where
  // it was opened from (or Today on a cold start from a notification), another tab goes to
  // Today, and Today itself lets the app go to the background.
  useBackHandler(true, () => {
    if (loc.pathname.startsWith("/item/")) {
      if (loc.key !== "default" && window.history.length > 1) nav(-1); else nav("/", { replace: true });
      return true;
    }
    if (loc.pathname !== "/") { nav("/", { replace: true }); return true; }
    return false;
  });
  // Which way did we just navigate? Tabs are ordered; opening an item goes deeper (forward).
  const prevPath = useRef(loc.pathname);
  const dirRef = useRef(1);
  if (prevPath.current !== loc.pathname) {
    const order = ["/", "/feed", "/library", "/stats", "/settings"];
    const rank = (p: string) => (p.startsWith("/item") ? 99 : Math.max(0, order.indexOf(p)));
    const a = rank(prevPath.current), b = rank(loc.pathname);
    dirRef.current = b >= a ? 1 : -1;
    prevPath.current = loc.pathname;
  }
  const showFab = loc.pathname === "/" || loc.pathname === "/library";

  // .app-main has no overflow rule of its own — the window/document is the real scroll
  // owner, and it persists across routes (only the Outlet's child remounts), so its scroll
  // position otherwise carries over: opening an item from partway down a list would land
  // already scrolled. Reset it on every navigation.
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <div className="app">
      <aside className="rail">
        <div className="rail-brand"><Owl size={40} /></div>
        <motion.button className="rail-fab" aria-label="Add link" onClick={() => setAddOpen(true)} whileTap={{ scale: 0.94 }} transition={spring}>
          <Plus size={24} strokeWidth={2.2} />
        </motion.button>
        {dests.map((d) => <Dest key={d.to} {...d} layoutId="rail-pill" />)}
      </aside>

      <main className="app-main">
        <ConnectionBanner />
        <Suspense fallback={<div style={{ display: "grid", placeItems: "center", minHeight: "40dvh" }}><Spinner size={26} /></div>}>
          <AnimatePresence mode="wait" initial={false} custom={dirRef.current}>
            <div key={loc.pathname.split("/")[1] || "home"}><Outlet /></div>
          </AnimatePresence>
        </Suspense>
      </main>

      <SessionBar />

      <AnimatePresence>
        {showFab && (
          <motion.button key="fab" className="fab" aria-label="Add link" onClick={() => setAddOpen(true)}
            initial={{ scale: 0.5, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.5, opacity: 0, y: 20 }}
            whileTap={{ scale: 0.9 }} transition={spring}>
            <Plus size={28} strokeWidth={2.2} />
          </motion.button>
        )}
      </AnimatePresence>

      <nav className="navbar">
        {dests.map((d) => <Dest key={d.to} {...d} layoutId="nav-pill" />)}
      </nav>

      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} />
      <GlobalAdd onOpen={() => setAddOpen(true)} />
    </div>
  );
}

// Opens the add sheet when a link is pasted anywhere (desktop) or shared from Android.
function GlobalAdd({ onOpen }: { onOpen: () => void }) {
  const push = useAddQueue((s) => s.push);
  const nav = useNavigate();
  useEffect(() => {
    const off = onShare((url) => { push(url, "share"); onOpen(); nav("/"); });
    const onPaste = (e: ClipboardEvent) => {
      const t = (e.target as HTMLElement | null)?.tagName;
      if (t === "INPUT" || t === "TEXTAREA") return;
      const url = extractUrl(e.clipboardData?.getData("text") ?? "");
      if (url) { push(url, "paste"); onOpen(); }
    };
    window.addEventListener("paste", onPaste);
    return () => { off(); window.removeEventListener("paste", onPaste); };
  }, [push, onOpen, nav]);
  return null;
}

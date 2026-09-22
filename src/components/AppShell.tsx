import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, BarChart3, Home, Library, Plus, Settings } from "lucide-react";
import { AddSheet, useAddQueue } from "./AddSheet";
import { SessionBar } from "./SessionBar";
import { onShare } from "../lib/share";
import { extractUrl } from "../lib/utils";
import { spring } from "./ui";

const dests = [
  { to: "/", label: "Today", icon: Home },
  { to: "/library", label: "Library", icon: Library },
  { to: "/stats", label: "Progress", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

function Dest({ to, label, icon: Icon, layoutId }: (typeof dests)[number] & { layoutId: string }) {
  return (
    <NavLink to={to} end={to === "/"} className="dest">
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
  const [addOpen, setAddOpen] = useState(false);
  const showFab = loc.pathname === "/" || loc.pathname === "/library";
  const mainRef = useRef<HTMLElement>(null);

  // .app-main persists across routes (only the Outlet's child remounts), so its scroll
  // position otherwise carries over — opening an item from partway down the list would
  // land already scrolled. Reset it on every navigation.
  useEffect(() => { mainRef.current?.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <div className="app">
      <aside className="rail">
        <div className="rail-brand"><ArrowUpRight size={18} strokeWidth={2.75} /></div>
        <motion.button className="rail-fab" aria-label="Add link" onClick={() => setAddOpen(true)} whileTap={{ scale: 0.94 }} transition={spring}>
          <Plus size={24} strokeWidth={2.2} />
        </motion.button>
        {dests.map((d) => <Dest key={d.to} {...d} layoutId="rail-pill" />)}
      </aside>

      <main className="app-main" ref={mainRef}>
        <AnimatePresence mode="wait" initial={false}>
          <div key={loc.pathname.split("/")[1] || "home"}><Outlet /></div>
        </AnimatePresence>
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

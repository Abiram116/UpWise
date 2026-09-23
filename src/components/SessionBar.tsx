import { useEffect, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { Check, Square } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { endSession, startSession } from "../lib/api";
import { supabase } from "../lib/supabase";
import { getPref, setPref } from "../lib/store";
import type { Item } from "../lib/types";
import { Pill, spring } from "./ui";

export interface ActiveSession { sessionId: string; itemId: string; title: string; startedAt: string; estimatedMinutes: number }

let active: ActiveSession | null = null;
let hydrated = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

const sessionStore = {
  get: () => active,
  subscribe: (l: () => void) => { subs.add(l); return () => subs.delete(l); },
  async hydrate() {
    if (hydrated) return;
    hydrated = true;
    const saved = await getPref<ActiveSession | null>("activeSession", null);
    if (!saved) return;
    // Sessions older than 4h were abandoned: close them with a sane cap instead of counting the gap.
    const ageMin = (Date.now() - new Date(saved.startedAt).getTime()) / 60000;
    if (ageMin > 240) {
      try { await endSession(saved.sessionId, saved.startedAt, Math.round(saved.estimatedMinutes * 1.5 * 60)); } catch { /* ignore */ }
      await setPref("activeSession", null);
      return;
    }
    active = saved; emit();
  },
  async start(item: Item) {
    if (active) await sessionStore.stop(false);
    const s = await startSession(item.id);
    await supabase.from("items").update({ status: "in_progress", started_at: item.started_at ?? new Date().toISOString() }).eq("id", item.id);
    active = { sessionId: s.id, itemId: item.id, title: item.title ?? "Learning", startedAt: s.started_at, estimatedMinutes: item.estimated_minutes ?? 10 };
    await setPref("activeSession", active); emit();
  },
  async stop(complete: boolean) {
    if (!active) return;
    const a = active;
    active = null; emit();
    await setPref("activeSession", null);
    await endSession(a.sessionId, a.startedAt);
    if (complete) await supabase.from("items").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", a.itemId);
  },
};

export function useSessionStore<T>(sel: (s: typeof sessionStore) => T): T { return sel(sessionStore); }
export function useActiveSession(): ActiveSession | null { return useSyncExternalStore(sessionStore.subscribe, sessionStore.get); }

function useElapsed(startedAt: string | undefined) {
  const [now, setNow] = useState(Date.now());
  // Ticking forever regardless of session state would burn battery for no reason — only
  // run the interval while there's actually an active session to show elapsed time for.
  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return "";
  const s = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(s / 60), r = s % 60;
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

export function SessionBar() {
  const a = useActiveSession();
  const nav = useNavigate();
  const qc = useQueryClient();
  const elapsed = useElapsed(a?.startedAt);
  useEffect(() => { void sessionStore.hydrate(); }, []);

  const finish = async (complete: boolean) => {
    await sessionStore.stop(complete);
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["activity"] });
    qc.invalidateQueries({ queryKey: ["sessions"] });
  };

  return (
    <AnimatePresence>
      {a && (
        <motion.div className="live-pill" initial={{ y: 30, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0, scale: 0.96 }} transition={spring}>
          <span className="live-dot" />
          <button className="grow" style={{ textAlign: "left", minWidth: 0 }} onClick={() => nav(`/item/${a.itemId}`)}>
            <div className="truncate" style={{ fontWeight: 500, fontSize: 14 }}>{a.title}</div>
            <div className="meta num" style={{ color: "var(--on-surface-2)" }}>{elapsed}</div>
          </button>
          <Pill variant="text" size="sm" icon aria-label="Stop" onClick={() => finish(false)} style={{ color: "var(--on-surface-2)" }}><Square size={15} /></Pill>
          <Pill variant="filled" size="sm" onClick={() => finish(true)}><Check size={16} strokeWidth={2.5} /> Done</Pill>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useMemo, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { fetchCheer, type CheerEvent } from "../lib/api";
import { recentLines, remember } from "../lib/coach";
import { haptic } from "../lib/haptics";
import { Owl } from "./BrandMark";
import { queryClient } from "../lib/queryClient";
import type { Item } from "../lib/types";

// Wins get celebrated in the app — never as phone notifications. Dynamic so it never goes
// stale: one of five animations (never the same twice in a row), a line picked from a pool
// that skips anything said recently, swapped for a fresh AI line if one lands in time, and a
// Pixel haptic that matches the size of the win. Transform-only animations, gone in ~3s.

type Variant = "burst" | "rings" | "rise" | "stamp" | "owl";
interface Active extends CheerEvent { id: number; variant: Variant; line: string; stamp: string }

const PRIORITY: Record<CheerEvent["kind"], number> = { done: 1, cleared: 2, streak: 3, goal: 3 };
const LINES: Record<CheerEvent["kind"], string[]> = {
  done: ["Another one in the brain.", "Learned. Filed. Yours now.", "That one's yours forever.", "Brain +1.", "Quietly getting sharper.",
    "Look at you, actually finishing things.", "One less tab open in your head.", "Knowledge acquired. Carry on."],
  goal: ["Today's goal: handled.", "Goal hit. The rest of the day is yours.", "Daily done. Proud of you.", "Target reached — anything else is bonus.",
    "Goal met. Future you says thanks."],
  streak: ["{n} days straight. That's a habit now.", "{n}-day streak. Don't look down.", "{n} days in a row — you're onto something."],
  cleared: ["List cleared. Absolute legend.", "Zero left. Go find something new.", "Everything saved is learned or sorted."],
};
const STAMPS: Record<CheerEvent["kind"], string[]> = {
  done: ["Learned.", "Nailed it.", "In the bag."], goal: ["Goal.", "Done today."], streak: ["{n} days."], cleared: ["All clear."],
};

let current: Active | null = null;
let lastVariant: Variant | null = null;
let timer: number | undefined;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());
const fill = (t: string, e: CheerEvent) => t.replace("{n}", String(e.streak ?? ""));
const pickOne = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function dismissIn(ms: number) {
  window.clearTimeout(timer);
  const id = current?.id;
  timer = window.setTimeout(() => { if (current?.id === id) { current = null; emit(); } }, ms);
}

export async function celebrate(e: CheerEvent) {
  if (current && PRIORITY[e.kind] < PRIORITY[current.kind]) return; // never downgrade a bigger win on screen
  const variants: Variant[] = (["burst", "rings", "rise", "stamp", "owl"] as Variant[]).filter((v) => v !== lastVariant);
  const variant = pickOne(variants);
  lastVariant = variant;
  const recent = await recentLines();
  const pool = LINES[e.kind].map((l) => fill(l, e));
  const fresh = pool.filter((l) => !recent.includes(l));
  const line = pickOne(fresh.length ? fresh : pool);
  current = { ...e, id: Date.now(), variant, line, stamp: fill(pickOne(STAMPS[e.kind]), e) };
  emit();
  if (e.kind === "done") haptic.celebrate(); else haptic.spin();
  dismissIn(2800);
  const id = current.id;
  const ai = await fetchCheer(e, recent);
  if (ai && current?.id === id) {
    current = { ...current, line: ai };
    emit();
    dismissIn(1800); // give the new line time to be read
  }
  void remember(ai ?? line);
}

/** Finishing an item — counts what else got finished today for a more specific line. */
export function celebrateDone(title: string | null | undefined) {
  const today = new Date().toDateString();
  const n = queryClient.getQueryData<Item[]>(["items"])?.filter((i) => i.completed_at && new Date(i.completed_at).toDateString() === today).length ?? 1;
  void celebrate({ kind: "done", title: title ?? undefined, finished_today: Math.max(1, n) });
}

const COLORS = ["var(--primary)", "var(--warm)", "var(--primary-container)", "var(--warm-container)"];

function Particles({ variant }: { variant: Variant }) {
  const bits = useMemo(() => Array.from({ length: variant === "rise" ? 16 : variant === "burst" ? 26 : 12 }, (_, i) => {
    const a = Math.random() * Math.PI * 2, d = 110 + Math.random() * 170;
    return { i, a, d, s: 6 + Math.random() * 6, c: COLORS[i % COLORS.length], r: Math.random() * 540 - 270, round: Math.random() > 0.5, x0: (Math.random() - 0.5) * 280 };
  }), [variant]);
  if (variant === "rings") {
    return <>{[0, 1, 2].map((k) => (
      <motion.span key={k} className="celebrate-ring" initial={{ scale: 0.2, opacity: 0.55 }} animate={{ scale: 2.8, opacity: 0 }}
        transition={{ duration: 1.1, delay: k * 0.14, ease: [0.05, 0.7, 0.1, 1] }} />
    ))}</>;
  }
  return <>{bits.map((b) => (
    <motion.span key={b.i} className="celebrate-bit" style={{ width: b.s, height: variant === "rise" ? b.s : b.s * 1.6, background: b.c, borderRadius: b.round || variant === "rise" ? 999 : 2 }}
      initial={variant === "rise" ? { x: b.x0, y: 260, opacity: 0 } : { x: 0, y: 0, opacity: 1, rotate: 0 }}
      animate={variant === "rise"
        ? { x: b.x0 + Math.sin(b.a) * 30, y: -260 - Math.random() * 120, opacity: [0, 1, 0] }
        : { x: Math.cos(b.a) * b.d, y: [0, Math.sin(b.a) * b.d, Math.sin(b.a) * b.d + 70], rotate: b.r, opacity: [1, 1, 0] }}
      transition={{ duration: variant === "rise" ? 1.6 : 1.15, delay: variant === "rise" ? (b.i % 8) * 0.06 : 0, ease: [0.05, 0.7, 0.1, 1] }} />
  ))}</>;
}

export function CelebrationLayer() {
  const c = useSyncExternalStore((l) => { subs.add(l); return () => { subs.delete(l); }; }, () => current);
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {c && (
        <motion.div key={c.id} className="celebrate" role="status" aria-live="polite" onClick={() => { current = null; emit(); }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
          {!reduce && <div className="celebrate-origin"><Particles variant={c.variant} /></div>}
          <motion.div className="celebrate-card" initial={reduce ? { opacity: 0 } : { scale: 0.82, y: 24, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}>
            {c.variant === "owl" && (
              <motion.div initial={{ y: 12, rotate: -10 }} animate={{ y: [12, -6, 0], rotate: [-10, 6, 0] }} transition={{ duration: 0.6 }}>
                <Owl size={64} mood="happy" />
              </motion.div>
            )}
            {c.variant === "stamp" && (
              <motion.div className="celebrate-stamp" initial={{ scale: 2.4, rotate: -14, opacity: 0 }} animate={{ scale: 1, rotate: -4, opacity: 1 }}
                transition={{ type: "spring", stiffness: 520, damping: 17 }}>{c.stamp}</motion.div>
            )}
            {(c.variant === "rings" || c.variant === "burst" || c.variant === "rise") && (
              <motion.span className="celebrate-check" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 420, damping: 16, delay: 0.05 }}>
                <Check size={30} strokeWidth={3} />
              </motion.span>
            )}
            <AnimatePresence mode="wait">
              <motion.p key={c.line} className="celebrate-line" initial={{ opacity: 0, y: 6, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.28 }}>
                {c.line}
              </motion.p>
            </AnimatePresence>
            {c.kind === "done" && c.title && <p className="meta truncate" style={{ maxWidth: 260 }}>{c.title}</p>}
            {c.kind === "goal" && c.minutes != null && <p className="meta num">{c.minutes} min today</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion, type TargetAndTransition } from "motion/react";
import { Check } from "lucide-react";
import { fetchCheer, type CheerEvent } from "../lib/api";
import { recentLines, remember } from "../lib/coach";
import { confetti, stopConfetti, type Pattern } from "../lib/confetti";
import { haptic } from "../lib/haptics";
import { Owl } from "./BrandMark";
import { queryClient } from "../lib/queryClient";
import type { Item } from "../lib/types";

// Wins get celebrated in the app — never as phone notifications — and never the same way
// twice in a row. Every celebration rolls its own entrance, confetti pattern, kicker word,
// line (skipping anything said recently) and owl pose; kinds have their own hero: the owl +
// check for finishing, a filling ring for the daily goal, a flame for streaks, sparkles for a
// cleared list. An AI line replaces ours if it arrives while the card is still up.

type Kind = CheerEvent["kind"];
type Enter = "pop" | "drop" | "swing";
type Pose = "hop" | "spin" | "tilt";
interface Active extends CheerEvent { id: number; enter: Enter; pose: Pose; kicker: string; line: string }

const PRIORITY: Record<Kind, number> = { done: 1, cleared: 2, streak: 3, goal: 3 };
const PATTERNS: Record<Kind, Pattern[]> = {
  done: ["pop", "burst", "cannons", "fountain"],
  goal: ["cannons", "fountain", "spiral", "rain"],
  streak: ["rain", "spiral", "burst"],
  cleared: ["rain", "cannons", "burst", "spiral"],
};
const KICKERS: Record<Kind, string[]> = {
  done: ["Boom.", "Locked in.", "Nailed it.", "Learned.", "Big brain.", "Done & dusted."],
  goal: ["Goal hit.", "Daily done.", "Target smashed.", "Check."],
  streak: ["On fire.", "Unstoppable.", "Habit unlocked.", "Still going."],
  cleared: ["All clear.", "Zero left.", "Inbox zero."],
};
const LINES: Record<Kind, string[]> = {
  done: ["Another one in the brain.", "Learned. Filed. Yours now.", "That one's yours forever.", "Brain +1.", "Quietly getting sharper.",
    "Look at you, actually finishing things.", "One less tab open in your head.", "Knowledge acquired. Carry on.", "Future you just nodded.",
    "That's how it's done."],
  goal: ["Today's goal: handled.", "Goal hit. The rest of the day is yours.", "Daily done. Proud of you.", "Target reached — anything else is bonus.",
    "Goal met. Future you says thanks.", "Minutes banked. Go enjoy your evening."],
  streak: ["{n} days straight. That's a habit now.", "{n}-day streak. Don't look down.", "{n} days in a row — you're onto something.",
    "{n} days. Most people quit by day 3."],
  cleared: ["List cleared. Absolute legend.", "Zero left. Go find something new.", "Everything saved is learned or sorted.", "Not a single link left behind."],
};
const LATE = ["At this hour? Respect.", "Learning while the world sleeps."];
const EARLY = ["Early bird energy.", "Before most people are even up."];

let current: Active | null = null;
const last: { enter?: Enter; pose?: Pose; pattern?: Pattern; kicker?: string } = {};
let timer: number | undefined;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());
const fill = (t: string, e: CheerEvent) => t.replace("{n}", String(e.streak ?? ""));
const pickOne = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
/** A random pick that avoids repeating the previous one. */
function fresh<T>(pool: T[], prev?: T): T { const p = pool.filter((x) => x !== prev); return pickOne(p.length ? p : pool); }

function dismissIn(ms: number) {
  window.clearTimeout(timer);
  const id = current?.id;
  timer = window.setTimeout(() => { if (current?.id === id) { current = null; emit(); } }, ms);
}

export async function celebrate(e: CheerEvent) {
  if (current && PRIORITY[e.kind] < PRIORITY[current.kind]) return; // never downgrade a bigger win on screen
  const recent = await recentLines();
  const hour = new Date().getHours();
  const pool = [...LINES[e.kind], ...(e.kind === "done" || e.kind === "goal" ? (hour >= 23 || hour < 4 ? LATE : hour < 6 ? EARLY : []) : [])].map((l) => fill(l, e));
  const unsaid = pool.filter((l) => !recent.includes(l));
  const line = pickOne(unsaid.length ? unsaid : pool);
  const pattern = fresh(PATTERNS[e.kind], last.pattern);
  const enter = fresh<Enter>(["pop", "drop", "swing"], last.enter);
  const pose = fresh<Pose>(["hop", "spin", "tilt"], last.pose);
  const kicker = fresh(KICKERS[e.kind], last.kicker);
  Object.assign(last, { pattern, enter, pose, kicker });

  current = { ...e, id: Date.now(), enter, pose, kicker, line };
  emit();
  if (e.kind === "done") haptic.celebrate(); else haptic.spin();
  confetti(pattern, e.kind === "done" ? 0.8 : 1.15);
  dismissIn(e.kind === "done" ? 3000 : 3800);
  const id = current.id;
  const ai = await fetchCheer(e, recent);
  if (ai && current?.id === id) {
    current = { ...current, line: ai };
    emit();
    dismissIn(2200); // give the new line time to be read
  }
  void remember(ai ?? line);
}

// Dev-only handle so the animations can be exercised without finishing real items.
if (import.meta.env.DEV) (window as unknown as { __celebrate?: typeof celebrate }).__celebrate = celebrate;

/** Finishing an item — counts what else got finished today for a more specific line. */
export function celebrateDone(title: string | null | undefined) {
  const today = new Date().toDateString();
  const n = queryClient.getQueryData<Item[]>(["items"])?.filter((i) => i.completed_at && new Date(i.completed_at).toDateString() === today).length ?? 1;
  void celebrate({ kind: "done", title: title ?? undefined, finished_today: Math.max(1, n) });
}

// ---------- hero visuals ----------
function useCount(to: number, from = 0, ms = 900, delay = 250) {
  const [v, setV] = useState(from);
  useEffect(() => {
    let raf = 0, t0 = 0;
    const tick = (t: number) => {
      t0 ||= t + delay;
      const k = Math.min(1, Math.max(0, (t - t0) / ms));
      setV(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, from, ms, delay]);
  return v;
}

const POSE: Record<Pose, TargetAndTransition> = {
  hop: { y: [0, -26, 0, -10, 0], transition: { duration: 0.9, delay: 0.25, times: [0, 0.35, 0.6, 0.8, 1] } },
  spin: { rotate: [0, 360], scale: [1, 1.12, 1], transition: { duration: 0.8, delay: 0.2, ease: [0.3, 0.7, 0.2, 1] } },
  tilt: { rotate: [0, -12, 10, -6, 0], transition: { duration: 0.9, delay: 0.25 } },
};

function DoneHero({ pose }: { pose: Pose }) {
  return (
    <div className="celebrate-hero">
      <motion.div animate={POSE[pose]}><Owl size={92} mood="happy" face={false} /></motion.div>
      <motion.span className="celebrate-badge" initial={{ scale: 0, rotate: -60 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 420, damping: 13, delay: 0.35 }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
          <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.5 }} />
        </svg>
      </motion.span>
    </div>
  );
}

function GoalHero({ minutes = 0 }: { minutes?: number }) {
  const n = useCount(minutes, Math.round(minutes * 0.6), 1000);
  const C = 2 * Math.PI * 52;
  return (
    <div className="celebrate-hero" style={{ width: 150, height: 150 }}>
      <svg width="150" height="150" viewBox="0 0 150 150" style={{ transform: "rotate(-90deg)" }}>
        <defs><linearGradient id="gr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFF3C4" /><stop offset="1" stopColor="#FFC24F" /></linearGradient></defs>
        <circle cx="75" cy="75" r="52" fill="none" stroke="#fff" strokeOpacity=".2" strokeWidth="13" />
        <motion.circle cx="75" cy="75" r="52" fill="none" stroke="url(#gr)" strokeWidth="13" strokeLinecap="round" strokeDasharray={C}
          initial={{ strokeDashoffset: C * 0.4 }} animate={{ strokeDashoffset: 0 }} transition={{ duration: 1, delay: 0.25, ease: [0.2, 0.8, 0.2, 1] }} />
      </svg>
      <motion.div className="celebrate-ring-ripple" initial={{ scale: 0.8, opacity: 0.7 }} animate={{ scale: 1.7, opacity: 0 }} transition={{ duration: 0.9, delay: 1.1 }} />
      <div className="celebrate-ring-num"><b className="num">{n}</b><span>min</span></div>
    </div>
  );
}

function StreakHero({ n = 1 }: { n?: number }) {
  const v = useCount(n, Math.max(0, n - 1), 700, 350);
  return (
    <div className="celebrate-hero" style={{ width: 140, height: 140 }}>
      <motion.svg width="140" height="140" viewBox="0 0 120 120" animate={{ scaleY: [1, 1.07, 0.97, 1.05, 1], skewX: [0, 2.5, -2, 1.5, 0] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }} style={{ transformOrigin: "60px 112px" }}>
        <defs>
          <linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFC24F" /><stop offset="1" stopColor="#FF6B4A" /></linearGradient>
          <linearGradient id="fi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFF3C4" /><stop offset="1" stopColor="#FFC24F" /></linearGradient>
        </defs>
        <path d="M60 6C70 30 94 40 94 70C94 94 78 112 60 112C42 112 26 94 26 70C26 56 34 46 41 37C43 50 50 55 55 55C52 38 54 22 60 6Z" fill="url(#fl)" />
        <path d="M60 52C66 66 78 72 78 88C78 100 70 108 60 108C50 108 42 100 42 88C42 80 47 74 52 68C54 74 57 76 59 76C58 68 58 60 60 52Z" fill="url(#fi)" />
      </motion.svg>
      <div className="celebrate-flame-num"><b className="num">{v}</b></div>
    </div>
  );
}

function ClearedHero() {
  return (
    <div className="celebrate-hero">
      <Owl size={92} mood="happy" face={false} />
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.svg key={i} className="celebrate-spark" width="18" height="18" viewBox="0 0 24 24" fill="#FFC24F"
          style={{ left: `${50 + 52 * Math.cos((i / 5) * 6.283 - 1.2)}%`, top: `${48 + 52 * Math.sin((i / 5) * 6.283 - 1.2)}%` }}
          animate={{ scale: [0, 1.2, 0.5, 1, 0], rotate: [0, 90, 180] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 + i * 0.22 }}>
          <path d="M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" />
        </motion.svg>
      ))}
    </div>
  );
}

const ENTER: Record<Enter, { initial: TargetAndTransition; transition: TargetAndTransition["transition"] }> = {
  pop: { initial: { scale: 0.55, y: 30, opacity: 0 }, transition: { type: "spring", stiffness: 380, damping: 16 } },
  drop: { initial: { y: -220, opacity: 0, scale: 0.9 }, transition: { type: "spring", stiffness: 260, damping: 12 } },
  swing: { initial: { rotate: -9, y: 70, scale: 0.8, opacity: 0 }, transition: { type: "spring", stiffness: 300, damping: 13 } },
};

export function CelebrationLayer() {
  const c = useSyncExternalStore((l) => { subs.add(l); return () => { subs.delete(l); }; }, () => current);
  const reduce = useReducedMotion();
  const close = () => { current = null; stopConfetti(); emit(); };
  return (
    <AnimatePresence>
      {c && (
        <motion.div key={c.id} className="celebrate" role="status" aria-live="polite" onClick={close}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.3 } }}>
          {!reduce && <motion.div className="celebrate-glow" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: [0.4, 1.15, 1], opacity: [0, 0.9, 0.7] }} transition={{ duration: 1.1 }} />}
          <motion.div className="celebrate-card" initial={reduce ? { opacity: 0 } : ENTER[c.enter].initial} animate={{ scale: 1, y: 0, rotate: 0, opacity: 1 }} transition={reduce ? undefined : ENTER[c.enter].transition}>
            {!reduce && <motion.span className="celebrate-shine" initial={{ x: "-120%" }} animate={{ x: "220%" }} transition={{ duration: 0.9, delay: 0.55, ease: "easeInOut" }} />}
            {c.kind === "goal" ? <GoalHero minutes={c.minutes} />
              : c.kind === "streak" ? <StreakHero n={c.streak} />
              : c.kind === "cleared" ? <ClearedHero />
              : <DoneHero pose={c.pose} />}
            <motion.p className="celebrate-kicker" initial={{ opacity: 0, letterSpacing: "0.4em" }} animate={{ opacity: 1, letterSpacing: "0.16em" }} transition={{ delay: 0.3, duration: 0.5 }}>{c.kicker}</motion.p>
            <AnimatePresence mode="wait">
              <motion.p key={c.line} className="celebrate-line" initial={{ opacity: 0, y: 8, filter: "blur(5px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.3, delay: 0.1 }}>
                {c.line}
              </motion.p>
            </AnimatePresence>
            {c.kind === "done" && c.title && <p className="meta truncate celebrate-sub"><Check size={13} strokeWidth={3} style={{ verticalAlign: -2 }} /> {c.title}</p>}
            {c.kind === "done" && (c.finished_today ?? 0) > 1 && <p className="meta celebrate-sub">{c.finished_today} learned today</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

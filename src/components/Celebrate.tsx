import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion, type TargetAndTransition } from "motion/react";
import { Check } from "lucide-react";
import { fetchCheer, type CheerEvent } from "../lib/api";
import { recentLines, remember } from "../lib/coach";
import { confetti, stopConfetti, type Pattern } from "../lib/confetti";
import { haptic } from "../lib/haptics";
import { useBackHandler } from "../lib/backHandler";
import { Owl } from "./BrandMark";
import { MaskText } from "./MaskText";
import { queryClient } from "../lib/queryClient";
import type { Item } from "../lib/types";

// Wins get celebrated in the app — never as phone notifications — and the card stays until you
// tap it (or swipe back), so there's always time to read it. Wins that arrive together queue up
// and show one after another instead of replacing each other. Nothing repeats: every card rolls
// its own entrance, confetti pattern, hero, kicker and line, and finishing the 1st, 10th, 25th…
// thing gets its own milestone treatment.

type Kind = CheerEvent["kind"];
type Enter = "pop" | "drop" | "swing";
type Pose = "hop" | "spin" | "tilt";
type Hero = "owl" | "cap" | "trophy";
interface Active extends CheerEvent { id: number; enter: Enter; pose: Pose; hero: Hero; kicker: string; line: string }

const PATTERNS: Record<Kind, Pattern[]> = {
  done: ["pop", "burst", "cannons", "fountain"],
  goal: ["cannons", "fountain", "spiral", "rain"],
  streak: ["rain", "spiral", "burst"],
  cleared: ["rain", "cannons", "burst", "spiral"],
  shield: ["pop", "spiral", "burst"],
};
const KICKERS: Record<Kind, string[]> = {
  done: ["Boom.", "Locked in.", "Nailed it.", "Learned.", "Big brain.", "Done & dusted."],
  goal: ["Goal hit.", "Daily done.", "Target smashed.", "Check."],
  streak: ["On fire.", "Unstoppable.", "Habit unlocked.", "Still going."],
  cleared: ["All clear.", "Zero left.", "Inbox zero."],
  shield: ["Shield up.", "Streak armour.", "Freeze earned."],
};
const LINES: Record<Kind, string[]> = {
  done: ["Another one in the brain.", "Learned. Filed. Yours now.", "That one's yours forever.", "Brain +1.", "Quietly getting sharper.",
    "Look at you, actually finishing things.", "One less tab open in your head.", "Knowledge acquired. Carry on.", "Future you just nodded.", "That's how it's done."],
  goal: ["Today's goal: handled.", "Goal hit. The rest of the day is yours.", "Daily done. Proud of you.", "Target reached — anything else is bonus.",
    "Goal met. Future you says thanks.", "Minutes banked. Go enjoy your evening."],
  streak: ["{n} days straight. That's a habit now.", "{n}-day streak. Don't look down.", "{n} days in a row — you're onto something.", "{n} days. Most people quit by day 3."],
  cleared: ["List cleared. Absolute legend.", "Zero left. Go find something new.", "Everything saved is learned or sorted.", "Not a single link left behind."],
  shield: ["+2 freeze days. Miss a couple and your streak stays.", "Two days of cover, earned. It kicks in on its own.", "You can slip twice now and keep the streak."],
};
const MILESTONE: Record<number, string> = {
  1: "Your very first one. It starts here.", 5: "Five learned. This is a thing now.", 10: "Double digits.", 25: "A quarter hundred.",
  50: "Fifty things learned.", 75: "Seventy-five. Seriously good.", 100: "One hundred. Legend.", 150: "A hundred and fifty. Wow.", 200: "Two hundred. Unreal.", 365: "A year's worth of learning.",
};
const LATE = ["At this hour? Respect.", "Learning while the world sleeps."];
const EARLY = ["Early bird energy.", "Before most people are even up."];

let current: Active | null = null;
const queue: CheerEvent[] = [];
// True from the moment a card is requested until it is closed: wins arriving in the same tick
// (finished something AND hit the goal) must line up, not race each other to the screen.
let busy = false;
const last: { enter?: Enter; pose?: Pose; pattern?: Pattern; kicker?: string; hero?: Hero } = {};
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());
const fill = (t: string, e: CheerEvent) => t.replace("{n}", String(e.streak ?? ""));
const pickOne = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
/** A random pick that avoids repeating the previous one. */
function fresh<T>(pool: T[], prev?: T): T { const p = pool.filter((x) => x !== prev); return pickOne(p.length ? p : pool); }

async function show(e: CheerEvent) {
  const recent = await recentLines();
  const hour = new Date().getHours();
  const milestone = e.kind === "done" && e.total ? MILESTONE[e.total] : undefined;
  const pool = [...LINES[e.kind], ...(e.kind === "done" || e.kind === "goal" ? (hour >= 23 || hour < 4 ? LATE : hour < 6 ? EARLY : []) : [])].map((l) => fill(l, e));
  const unsaid = pool.filter((l) => !recent.includes(l));
  const line = milestone ?? pickOne(unsaid.length ? unsaid : pool);
  const pattern = fresh(PATTERNS[e.kind], last.pattern);
  const enter = fresh<Enter>(["pop", "drop", "swing"], last.enter);
  const pose = fresh<Pose>(["hop", "spin", "tilt"], last.pose);
  const hero = milestone ? "trophy" : fresh<Hero>(["owl", "cap", "trophy"], last.hero);
  const kicker = milestone && e.total ? `#${e.total} learned` : fresh(KICKERS[e.kind], last.kicker);
  Object.assign(last, { pattern, enter, pose, kicker, hero });

  current = { ...e, id: Date.now(), enter, pose, hero, kicker, line };
  emit();
  if (e.kind === "done") haptic.celebrate(); else haptic.spin();
  confetti(pattern, e.kind === "done" ? 0.9 : 1.2);
  const id = current.id;
  const ai = e.kind === "shield" ? null : await fetchCheer(e, recent);
  if (ai && current?.id === id && !milestone) { current = { ...current, line: ai }; emit(); }
  void remember(ai && !milestone ? ai : line);
}

function closeCurrent() {
  current = null; stopConfetti(); emit();
  const next = queue.shift();
  if (next) window.setTimeout(() => { void show(next); }, 420);
  else busy = false;
}

export async function celebrate(e: CheerEvent) {
  if (e.quiet) { if (!current) { haptic.celebrate(); confetti("pop", 0.7); } return; }
  if (busy) {
    // One of each kind waits at most; a 4th pending win isn't worth the wait.
    if (queue.length < 3 && !queue.some((q) => q.kind === e.kind) && current?.kind !== e.kind) queue.push(e);
    return;
  }
  busy = true;
  await show(e);
}

/** Finishing an item — knows how many you've learned in total and today, for milestones. */
export function celebrateDone(title: string | null | undefined, opts: { quiet?: boolean } = {}) {
  const today = new Date().toDateString();
  const items = queryClient.getQueryData<Item[]>(["items"]) ?? [];
  const todayN = items.filter((i) => i.completed_at && new Date(i.completed_at).toDateString() === today).length;
  const total = items.filter((i) => i.status === "completed").length;
  void celebrate({ kind: "done", title: title ?? undefined, finished_today: Math.max(1, todayN), total: Math.max(1, total), quiet: opts.quiet });
}

// Dev-only handle so the animations can be exercised without finishing real items.
if (import.meta.env.DEV) (window as unknown as { __celebrate?: typeof celebrate }).__celebrate = celebrate;

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

function Badge() {
  return (
    <motion.span className="celebrate-badge" initial={{ scale: 0, rotate: -60 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 420, damping: 13, delay: 0.35 }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.5 }} />
      </svg>
    </motion.span>
  );
}

/** The owl graduates: its cap flies off, spins, and lands back on its head. */
function CapHero() {
  return (
    <div className="celebrate-hero">
      <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 0.7, delay: 0.5 }}><Owl size={92} mood="happy" face={false} /></motion.div>
      <motion.svg className="celebrate-cap" width="84" height="52" viewBox="0 0 84 52"
        initial={{ y: 0, rotate: 0 }} animate={{ y: [0, -70, -70, 2], rotate: [0, 200, 360, 360], scale: [1, 1.15, 1.15, 1] }}
        transition={{ duration: 1.5, delay: 0.35, times: [0, 0.4, 0.55, 1], ease: "easeInOut" }}>
        <path d="M42 4L80 20L42 36L4 20Z" fill="#14281f" />
        <path d="M20 28v10c0 5 10 9 22 9s22-4 22-9V28L42 38Z" fill="#1d3a2d" />
        <path d="M76 22v16" stroke="#FFC24F" strokeWidth="3" strokeLinecap="round" />
        <circle cx="76" cy="41" r="4" fill="#FFC24F" />
      </motion.svg>
      <Badge />
    </div>
  );
}

function TrophyHero({ total }: { total?: number }) {
  return (
    <div className="celebrate-hero" style={{ width: 130, height: 130 }}>
      <motion.svg width="130" height="130" viewBox="0 0 120 120" initial={{ scale: 0.3, rotate: -14, y: 20 }} animate={{ scale: 1, rotate: 0, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 11, delay: 0.1 }}>
        <defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE08A" /><stop offset="1" stopColor="#F2A31F" /></linearGradient></defs>
        <path d="M30 14h60v26c0 18-13 30-30 30S30 58 30 40Z" fill="url(#tg)" />
        <path d="M30 22H14c0 16 8 26 20 28M90 22h16c0 16-8 26-20 28" fill="none" stroke="#F2A31F" strokeWidth="6" strokeLinecap="round" />
        <rect x="52" y="68" width="16" height="16" fill="#E39512" /><rect x="38" y="84" width="44" height="12" rx="5" fill="url(#tg)" />
        <path d="M42 20v22" stroke="#fff" strokeOpacity=".55" strokeWidth="5" strokeLinecap="round" />
      </motion.svg>
      {total != null && <motion.b className="celebrate-trophy-num num" initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5, type: "spring", stiffness: 400, damping: 14 }}>#{total}</motion.b>}
      <motion.span className="celebrate-glint" initial={{ opacity: 0, x: -20 }} animate={{ opacity: [0, 1, 0], x: 30 }} transition={{ delay: 0.7, duration: 0.8 }} />
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
        transition={{ duration: 1.1, repeat: 5, ease: "easeInOut" }} style={{ transformOrigin: "60px 112px" }}>
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

/** A freeze shield: frosty blue, snowflakes drifting off it. */
function ShieldHero() {
  return (
    <div className="celebrate-hero" style={{ width: 130, height: 130 }}>
      <motion.svg width="124" height="124" viewBox="0 0 120 120" initial={{ scale: 0.3, y: 24 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 320, damping: 12, delay: 0.1 }}>
        <defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#D6F1FF" /><stop offset="1" stopColor="#5BB6F0" /></linearGradient></defs>
        <path d="M60 8l42 14v30c0 28-18 48-42 58C36 100 18 80 18 52V22Z" fill="url(#sg)" />
        <path d="M60 24v56M36 40l48 24M84 40L36 64" stroke="#fff" strokeOpacity=".75" strokeWidth="5" strokeLinecap="round" />
      </motion.svg>
      <motion.b className="celebrate-trophy-num num" style={{ color: "#0d3b5c", bottom: 30 }} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5, type: "spring", stiffness: 400, damping: 14 }}>+2</motion.b>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <motion.span key={i} className="celebrate-flake" style={{ left: `${20 + i * 12}%` }} initial={{ y: 0, opacity: 0 }} animate={{ y: [0, 60], opacity: [0, 1, 0], rotate: [0, 120] }} transition={{ duration: 1.8, repeat: 2, delay: i * 0.3 }}>❄</motion.span>
      ))}
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
          animate={{ scale: [0, 1.2, 0.5, 1, 0], rotate: [0, 90, 180] }} transition={{ duration: 1.5, repeat: 2, delay: 0.3 + i * 0.22 }}>
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
  const [ready, setReady] = useState(false);
  useBackHandler(!!c, () => { closeCurrent(); return true; });
  // The "tap to continue" hint appears once the card has had a moment to land.
  useEffect(() => { setReady(false); if (!c) return; const t = window.setTimeout(() => setReady(true), 1500); return () => window.clearTimeout(t); }, [c?.id]);
  return (
    <AnimatePresence>
      {c && (
        <motion.div key={c.id} className="celebrate" data-kind={c.kind} role="dialog" aria-live="polite" onClick={closeCurrent}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.3 } }}>
          {!reduce && <><div className="celebrate-rays" />{[0, 1, 2].map((i) => <span key={i} className="celebrate-wave" style={{ animationDelay: `${0.12 + i * 0.2}s` }} />)}</>}
          {!reduce && <motion.div className="celebrate-glow" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: [0.4, 1.15, 1], opacity: [0, 0.9, 0.7] }} transition={{ duration: 1.1 }} />}
          <motion.div className="celebrate-card" initial={reduce ? { opacity: 0 } : ENTER[c.enter].initial} animate={{ scale: 1, y: 0, rotate: 0, opacity: 1 }} transition={reduce ? undefined : ENTER[c.enter].transition}>
            {!reduce && <motion.span className="celebrate-shine" initial={{ x: "-120%" }} animate={{ x: "220%" }} transition={{ duration: 0.9, delay: 0.55, ease: "easeInOut" }} />}
            {c.kind === "goal" ? <GoalHero minutes={c.minutes} />
              : c.kind === "streak" ? <StreakHero n={c.streak} />
              : c.kind === "cleared" ? <ClearedHero />
              : c.kind === "shield" ? <ShieldHero />
              : c.hero === "cap" ? <CapHero />
              : c.hero === "trophy" ? <TrophyHero total={c.total} />
              : <div className="celebrate-hero"><motion.div animate={POSE[c.pose]}><Owl size={92} mood="happy" face={false} /></motion.div><Badge /></div>}
            <p className="celebrate-kicker"><MaskText key={c.kicker} text={c.kicker} delay={0.35} step={0.08} /></p>
            <p className="celebrate-line" key={c.line}><MaskText text={c.line} delay={c.id ? 0.5 : 0} step={0.05} /></p>
            {c.kind === "done" && c.title && <p className="meta truncate celebrate-sub"><Check size={13} strokeWidth={3} style={{ verticalAlign: -2 }} /> {c.title}</p>}
            {c.kind === "done" && (c.finished_today ?? 0) > 1 && <p className="meta celebrate-sub">{c.finished_today} learned today</p>}
          </motion.div>
          <motion.p className="celebrate-tap" initial={{ opacity: 0 }} animate={{ opacity: ready ? 0.85 : 0 }} transition={{ duration: 0.5 }}>
            {queue.length ? "Tap for the next one" : "Tap anywhere to continue"}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

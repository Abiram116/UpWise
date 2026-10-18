import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useAnimationControls, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react";
import { haptic } from "../lib/haptics";
import { subscribePointer } from "../lib/pointerHub";

// The UpWise owl. Same geometry as the launcher icon (1024 box — keep in sync with the icon
// generator) in fixed brand colours (a wallpaper palette would wash a mascot out).
//
// One owl, made to feel real rather than busy:
//   • eyes       real upper eyelids that slide down (fast close, a beat, slower open), blinks at
//                natural random intervals, sometimes twice, often when its gaze shifts
//   • gaze       quick saccades between resting points, then stillness — never a floaty drift;
//                (interactive) follows your finger / cursor
//   • body       slow breathing bob, the odd ear-tuft twitch
//   • reacts     tap → wink / hoot / puff / nod / head tilt; 5 quick taps → dizzy; stroke it →
//                eyes close contentedly and hearts float up
//   • moods      idle · happy · think · sleepy · waiting · excited · love · dizzy
export type OwlMood = "idle" | "happy" | "think" | "sleepy" | "waiting" | "excited" | "love" | "dizzy";
type Reaction = "wink" | "hoot" | "puff" | "nod" | "tilt" | "love" | "dizzy" | "yawn";

const SPEECH = ["hoo!", "hoot hoot", "psst…", "hm?", "hi :)"];

// ---- geometry ----
export const C = { bg0: "#52CC92", bg1: "#1B7A58", head: "#0E5C40", cream: "#FFF7E8", pupil: "#0E2B20", beak0: "#FFC24F", beak1: "#F28E1F", shine: "#FFE0A0", blush: "#FF8A7A", lid: "#2A8465", ear: "#37B484" };
export const EYES = [356, 668] as const;
export const EY = 500, R = 142, PR = 64;
export const HEAD = "M270 232 L404 300 C466 280 558 280 620 300 L754 232 C812 330 848 430 848 540 C848 696 706 800 512 800 C318 800 176 696 176 540 C176 430 212 330 270 232 Z";
export const BEAK = "M448 572 Q512 544 576 572 Q562 650 512 706 Q462 650 448 572 Z";
export const BEAK_LOW = "M474 634 Q512 618 550 634 Q536 676 512 706 Q488 676 474 634 Z";
export const BEAK_SHINE = "M480 580 Q512 568 536 578 Q520 584 500 600 Z";
const GAZE: [number, number][] = [[26, -26], [-30, -22], [40, 8], [0, 30], [-38, 4], [4, -40], [26, -26]];
const MAXLOOK = 56;
const HEART = "M0 22 C-26 0 -34 -14 -34 -24 C-34 -38 -22 -46 -12 -46 C-6 -46 0 -42 0 -34 C0 -42 6 -46 12 -46 C22 -46 34 -38 34 -24 C34 0 26 0 0 22Z";

// An upper eyelid: a lid-coloured block with a curved lower edge, clipped to the eye. It travels
// LID_TRAVEL down to fully close; `shut` (0 open → 1 closed) drives it.
const LID_TRAVEL = 2 * R + 70;
const lidPath = (x: number) => `M${x - R - 12} ${EY - 3 * R} H${x + R + 12} V${EY + R} Q${x} ${EY + R + 64} ${x - R - 12} ${EY + R} Z`;
const BLINK: { duration: number; times: number[]; ease: ("easeIn" | "linear" | "easeOut")[] } = { duration: 0.24, times: [0, 0.3, 0.45, 1], ease: ["easeIn", "linear", "easeOut"] };

function Lid({ x, clip, shut }: { x: number; clip: string; shut: MotionValue<number> }) {
  const y = useTransform(shut, (v) => (v - 1) * LID_TRAVEL);
  return (
    <g clipPath={`url(#${clip})`}>
      <motion.path d={lidPath(x)} fill={C.lid} stroke={C.head} strokeOpacity=".55" strokeWidth="12" style={{ y }} />
    </g>
  );
}

export function Owl({ size = 40, mood = "idle", alive = false, face = true, interactive = false, speakKey, speakMs = 1800, onLongPress, onTap }: {
  size?: number; mood?: OwlMood; alive?: boolean; face?: boolean; interactive?: boolean;
  speakKey?: string; speakMs?: number; onLongPress?: () => void; onTap?: () => void;
}) {
  const id = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const live = alive && !reduce;
  const root = useRef<HTMLDivElement>(null);
  const hop = useAnimationControls();
  const earL = useAnimationControls();
  const earR = useAnimationControls();
  const lookX = useMotionValue(GAZE[0][0]);
  const lookY = useMotionValue(GAZE[0][1]);
  // Saccades: quick and critically damped (no wobble), like a real eye snapping to a new point.
  const px = useSpring(lookX, { stiffness: 420, damping: 38 });
  const py = useSpring(lookY, { stiffness: 420, damping: 38 });
  const shutL = useMotionValue(0);
  const shutR = useMotionValue(0);
  const rest = useRef(0); // how far the lids sit closed at rest (sleepy owls are heavy-lidded)
  const pointerUntil = useRef(0);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [talking, setTalking] = useState(false);
  const [hearts, setHearts] = useState(0);
  const reactTimer = useRef<number | undefined>(undefined);

  const mode: OwlMood = reaction === "love" ? "love" : reaction === "dizzy" ? "dizzy" : reaction === "yawn" ? "sleepy" : mood;

  const blinkNow = (slow = false, eyes: MotionValue<number>[] = [shutL, shutR]) => {
    if (document.hidden) return;
    const r = rest.current;
    for (const m of eyes) void animate(m, [r, 1, 1, r], slow ? { ...BLINK, duration: 0.7 } : BLINK);
  };

  // ----- gaze: finger/cursor first, otherwise a wandering glance, otherwise the mood's own look -----
  useEffect(() => {
    if (!interactive || !live) return;
    return subscribePointer((x, y) => {
      const r = root.current?.getBoundingClientRect();
      if (!r || r.width === 0) return;
      const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height * 0.49);
      const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 220);
      lookX.set((dx / d) * MAXLOOK * k); lookY.set((dy / d) * MAXLOOK * k);
      pointerUntil.current = performance.now() + 2600;
    });
  }, [interactive, live, lookX, lookY]);

  useEffect(() => {
    if (!live || mode === "think" || mode === "happy" || mode === "waiting" || mode === "dizzy" || mode === "love") return;
    let t: number, last = 0;
    const next = () => {
      if (!document.hidden && performance.now() > pointerUntil.current) {
        let i = Math.floor(Math.random() * GAZE.length);
        if (i === last) i = (i + 1) % GAZE.length;
        last = i; lookX.set(GAZE[i][0]); lookY.set(GAZE[i][1]);
        if (Math.random() < 0.35) blinkNow(mode === "sleepy"); // eyes often blink as they shift
      }
      t = window.setTimeout(next, 2200 + Math.random() * 3600);
    };
    t = window.setTimeout(next, 1500 + Math.random() * 1500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, mode, lookX, lookY]);

  useEffect(() => {
    if (mode === "waiting") { lookX.set(0); lookY.set(22); return; }
    if (mode === "think") {
      // thinking: a glance up and away, a pause, the other way — not a mechanical circle
      let t: number, i = 0;
      const spots: [number, number][] = [[-36, -38], [-30, -42], [34, -36], [0, -44]];
      const step = () => { const [x, y] = spots[i++ % spots.length]; lookX.set(x); lookY.set(y); t = window.setTimeout(step, 900 + Math.random() * 900); };
      step();
      return () => window.clearTimeout(t);
    }
    if (mode === "happy" || mode === "idle" || mode === "excited") { lookX.set(GAZE[0][0]); lookY.set(GAZE[0][1]); }
  }, [mode, lookX, lookY]);

  // ----- eyelids: resting position per mood, plus natural random blinks -----
  useEffect(() => {
    rest.current = mode === "sleepy" ? 0.5 : mode === "love" ? 1 : 0;
    void animate(shutL, rest.current, { duration: 0.5, ease: "easeInOut" });
    void animate(shutR, rest.current, { duration: 0.5, ease: "easeInOut" });
  }, [mode, shutL, shutR]);

  useEffect(() => {
    if (!live || mode === "happy" || mode === "love" || mode === "dizzy") return;
    let t: number;
    const go = () => {
      blinkNow(mode === "sleepy");
      if (Math.random() < 0.15 && mode !== "sleepy") window.setTimeout(() => blinkNow(), 300); // the odd double blink
      t = window.setTimeout(go, (mode === "sleepy" ? 2600 : 3000) + Math.random() * 4000);
    };
    t = window.setTimeout(go, 900 + Math.random() * 1800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, mode]);

  useEffect(() => {
    if (!live) return;
    let t: number;
    const twitch = () => {
      const c = Math.random() < 0.5 ? earL : earR;
      if (!document.hidden) void c.start({ rotate: [0, -6, 3, 0], transition: { duration: 0.4, ease: "easeOut" } });
      t = window.setTimeout(twitch, 6000 + Math.random() * 9000);
    };
    t = window.setTimeout(twitch, 4000);
    return () => window.clearTimeout(t);
  }, [live, earL, earR]);

  // ----- reactions -----
  const react = (r: Reaction, ms: number, say?: string) => {
    window.clearTimeout(reactTimer.current);
    setReaction(r);
    if (say) setBubble(say);
    if (r === "love") setHearts((n) => n + 1);
    reactTimer.current = window.setTimeout(() => { setReaction(null); setBubble(null); }, ms);
  };
  useEffect(() => () => window.clearTimeout(reactTimer.current), []);
  const say = () => SPEECH[Math.floor(Math.random() * SPEECH.length)];

  // Speaking: a small hop with squash-and-stretch, beak chatter for roughly as long as the line takes to read.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduce || speakKey == null) return;
    void hop.start({ y: [0, -size * 0.12, 0], scaleY: [1, 1.06, 0.96, 1], scaleX: [1, 0.97, 1.03, 1], transition: { duration: 0.5, ease: [0.2, 0.8, 0.3, 1] } });
    setTalking(true);
    const t = window.setTimeout(() => setTalking(false), speakMs);
    return () => window.clearTimeout(t);
  }, [speakKey, speakMs, reduce, size, hop]);

  // Waking up: coming out of sleepy, a quick double blink and a little hop.
  const prevMood = useRef(mood);
  useEffect(() => {
    if (prevMood.current === "sleepy" && mood !== "sleepy" && !reduce) {
      void hop.start({ y: [0, -size * 0.14, 0], transition: { duration: 0.45, ease: "easeOut" } });
      window.setTimeout(() => { blinkNow(); window.setTimeout(() => blinkNow(), 300); }, 200);
    }
    prevMood.current = mood;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, reduce, size, hop]);

  // ----- touch: tap (wink / hoot / puff / nod / tilt), rapid taps (dizzy), stroke (content), hold (onLongPress) -----
  const taps = useRef<number[]>([]);
  const press = useRef({ x: 0, y: 0, moved: 0, down: false, held: false, timer: undefined as number | undefined, petted: false });
  const onDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    press.current = { x: e.clientX, y: e.clientY, moved: 0, down: true, held: false, petted: false, timer: onLongPress ? window.setTimeout(() => { press.current.held = true; haptic.select(); onLongPress(); }, 560) : undefined };
  };
  const onMoveOwl = (e: React.PointerEvent) => {
    const p = press.current;
    if (!interactive || !p.down || p.held) return;
    p.moved += Math.hypot(e.clientX - p.x, e.clientY - p.y); p.x = e.clientX; p.y = e.clientY;
    if (p.moved > 46 && !p.petted) { p.petted = true; window.clearTimeout(p.timer); react("love", 2600); haptic.celebrate(); }
  };
  const onUp = () => {
    const p = press.current;
    if (!interactive) return;
    window.clearTimeout(p.timer);
    if (!p.down) return;
    p.down = false;
    if (p.held || p.petted) return;
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 1500), now];
    haptic.tap();
    onTap?.();
    if (taps.current.length >= 5) { taps.current = []; react("dizzy", 3000, "whoa… 😵"); haptic.warn(); return; }
    const pick = (["wink", "hoot", "puff", "nod", "tilt"] as const)[Math.floor(Math.random() * 5)];
    if (pick === "wink") { react("wink", 700); void animate(shutR, [0, 1, 1, 0], { duration: 0.55, times: [0, 0.2, 0.65, 1] }); }
    else if (pick === "hoot") { react("hoot", 1700, say()); void hop.start({ y: [0, -size * 0.1, 0], transition: { duration: 0.35 } }); }
    else if (pick === "puff") { react("puff", 800); void hop.start({ scaleX: [1, 1.12, 1.12, 1], scaleY: [1, 1.08, 1.08, 1], transition: { duration: 0.8, times: [0, 0.25, 0.6, 1], ease: "easeInOut" } }); }
    else if (pick === "nod") { react("nod", 700); void hop.start({ y: [0, size * 0.05, 0, size * 0.035, 0], transition: { duration: 0.6, ease: "easeInOut" } }); }
    else { react("tilt", 1100); const d = Math.random() < 0.5 ? -1 : 1; void hop.start({ rotate: [0, 12 * d, 12 * d, 0], transition: { duration: 1.1, times: [0, 0.2, 0.75, 1], ease: "easeInOut" } }); }
  };

  const happy = mode === "happy";
  const eyeArc = (x: number) => `M${x - R * 0.72} ${EY + 24} Q${x} ${EY - R * 0.95} ${x + R * 0.72} ${EY + 24}`;
  const pupilR = PR * (mode === "excited" ? 1.18 : 1);
  const bob = mode === "excited" ? 0.06 : 0.035;
  const period = mode === "excited" ? 1.3 : mode === "sleepy" ? 5.2 : 4.2;

  return (
    // The idle breathing bob is a CSS keyframe (compositor-driven, no per-frame JavaScript), and
    // pauses on its own when the app isn't visible.
    <div ref={root} className="owl-root" data-live={live} data-sway={live && mode === "waiting"}
      onPointerDown={onDown} onPointerMove={onMoveOwl} onPointerUp={onUp} onPointerCancel={() => { window.clearTimeout(press.current.timer); press.current.down = false; }}
      style={{ width: size, height: size, lineHeight: 0, position: "relative", touchAction: interactive ? "manipulation" : undefined, cursor: interactive ? "pointer" : undefined, userSelect: "none", WebkitUserSelect: "none",
        "--bob": `${size * bob}px`, "--period": `${period}s`, "--tilt": "0deg", "--sway": "7deg", "--swayT": "6s" } as React.CSSProperties}>
      <motion.svg width={size} height={size} viewBox="0 0 1024 1024" animate={hop} aria-hidden style={{ overflow: "visible", transformOrigin: "50% 80%" }}>
        <defs>
          <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.bg0} /><stop offset="1" stopColor={C.bg1} /></linearGradient>
          <radialGradient id={`${id}gl`} cx=".3" cy=".22" r=".8"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
          <linearGradient id={`${id}bk`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.beak0} /><stop offset="1" stopColor={C.beak1} /></linearGradient>
          {EYES.map((x) => <clipPath key={x} id={`${id}c${x}`}><circle cx={x} cy={EY} r={R + 6} /></clipPath>)}
        </defs>
        {face && <><rect width="1024" height="1024" rx="232" fill={`url(#${id}bg)`} /><rect width="1024" height="1024" rx="232" fill={`url(#${id}gl)`} /></>}

        <path d={HEAD} fill={C.head} fillOpacity=".55" stroke={C.head} strokeOpacity=".55" strokeWidth="26" strokeLinejoin="round" />
        <motion.path d="M270 232 L340 272 L262 320 Z" fill={C.ear} fillOpacity=".5" animate={earL} style={{ transformOrigin: "300px 306px" }} />
        <motion.path d="M754 232 L684 272 L762 320 Z" fill={C.ear} fillOpacity=".5" animate={earR} style={{ transformOrigin: "724px 306px" }} />

        {EYES.map((x, i) => happy ? (
          <g key={x}>
            <motion.path d={eyeArc(x)} stroke={C.cream} strokeWidth="46" strokeLinecap="round" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.22 }} />
            <motion.circle cx={x + (x < 512 ? -66 : 66)} cy={EY + 140} r="38" fill={C.blush} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 0.55, scale: 1 }} style={{ transformOrigin: `${x + (x < 512 ? -66 : 66)}px ${EY + 140}px` }} />
          </g>
        ) : (
          <g key={x}>
            <circle cx={x} cy={EY} r={R + 10} fill="#0F4A35" opacity=".35" />
            <circle cx={x} cy={EY} r={R} fill={C.cream} />
            <motion.g style={{ x: px, y: py }}>
              {mode === "dizzy" ? (
                <motion.g style={{ transformOrigin: `${x}px ${EY}px` }} animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}>
                  <path d={`M${x} ${EY} m0 -4 a10 10 0 1 1 -10 10 a24 24 0 1 1 28 -34 a42 42 0 1 1 -62 54 a60 60 0 1 1 90 -80`} fill="none" stroke={C.pupil} strokeWidth="14" strokeLinecap="round" />
                </motion.g>
              ) : (
                <>
                  <circle cx={x} cy={EY} r={pupilR} fill={C.pupil} />
                  <circle cx={x - 22} cy={EY - 24} r="20" fill={C.cream} />
                  <circle cx={x + 22} cy={EY + 20} r="8" fill={C.cream} opacity=".85" />
                </>
              )}
            </motion.g>
            <Lid x={x} clip={`${id}c${x}`} shut={i === 0 ? shutL : shutR} />
            {mode === "love" && <circle cx={x + (x < 512 ? -66 : 66)} cy={EY + 140} r="38" fill={C.blush} opacity=".55" />}
          </g>
        ))}

        <motion.g animate={talking || reaction === "hoot" ? { scaleY: [1, 0.8, 1, 0.88, 1, 0.82, 1] } : reaction === "yawn" ? { scaleY: [1, 1.5, 1.5, 1] } : { scaleY: 1 }}
          transition={talking || reaction === "hoot" ? { duration: 0.55, repeat: Infinity } : reaction === "yawn" ? { duration: 1.6 } : { duration: 0.15 }} style={{ transformOrigin: "512px 572px" }}>
          <path d={BEAK} fill={`url(#${id}bk)`} />
          <path d={BEAK_LOW} fill={C.beak1} opacity=".55" />
          <path d={BEAK_SHINE} fill={C.shine} opacity=".9" />
        </motion.g>

        {mode === "sleepy" && live && [0, 1, 2].map((i) => (
          <text key={i} className="owl-z" x="790" y="300" fontSize={130 - i * 14} fontWeight="800" fill={C.cream} fontFamily="system-ui, sans-serif" style={{ animationDelay: `${i * 0.85}s` }}>z</text>
        ))}

        <AnimatePresence>
          {reaction === "love" && [0, 1, 2].map((i) => (
            <motion.path key={`${hearts}-${i}`} d={HEART} fill="#FF5A7A" initial={{ x: 420 + i * 90, y: 260, scale: 0, opacity: 0 }}
              animate={{ y: -60 - i * 40, scale: [0, 0.8 + i * 0.1, 0.6], opacity: [0, 1, 0], rotate: [-8, 8, -4] }} transition={{ duration: 1.8, delay: i * 0.25, ease: "easeOut" }} />
          ))}
        </AnimatePresence>
      </motion.svg>

      <AnimatePresence>
        {bubble && (
          <motion.div className="owl-bubble" initial={{ opacity: 0, scale: 0.5, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
            {bubble}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Welcome/PIN screens: the owl pops in with a wobble, then settles into being alive. */
export function BrandMark({ size = 88 }: { size?: number }) {
  return (
    <motion.div initial={{ scale: 0.5, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 240, damping: 14 }} style={{ width: size, height: size }}>
      <Owl size={size} alive interactive />
    </motion.div>
  );
}

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, animate, motion, useAnimationControls, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { haptic } from "../lib/haptics";

// The UpWise owl. Same geometry as the launcher icon (1024 box — keep in sync with the icon
// generator) in fixed brand colours (a wallpaper palette would wash a mascot out).
//
// It's a character, not a logo:
//   • alive      wanders its gaze, blinks at random, bobs, twitches an ear
//   • follows    (interactive) its eyes track your finger / cursor
//   • reacts     tap → wink / hoot / puff / spin; 5 quick taps → dizzy; stroke it → purrs
//   • moods      idle · happy · think · sleepy · waiting · excited · love · dizzy
//   • persona    classic · scholar (glasses) · chill (headphones) · hype (headband) · sassy (brow),
//                each with its own accessories, movement and speech
export type OwlMood = "idle" | "happy" | "think" | "sleepy" | "waiting" | "excited" | "love" | "dizzy";
export type OwlPersona = "classic" | "scholar" | "chill" | "hype" | "sassy";
type Reaction = "wink" | "hoot" | "puff" | "spin" | "love" | "dizzy" | "yawn";

export const PERSONAS: { id: OwlPersona; name: string; tagline: string }[] = [
  { id: "classic", name: "Classic", tagline: "Warm, curious, on your side" },
  { id: "scholar", name: "Scholar", tagline: "Dry wit, loves a good fact" },
  { id: "chill", name: "Chill", tagline: "Zero pressure, all vibes" },
  { id: "hype", name: "Hype", tagline: "Your loudest cheerleader" },
  { id: "sassy", name: "Sassy", tagline: "Teases you. Lovingly." },
];

// ---- persona store (module-level so every owl in the app wears the same one) ----
const PKEY = "upwise:persona";
const readPersona = (): OwlPersona => { try { const v = localStorage.getItem(PKEY) as OwlPersona | null; return PERSONAS.some((p) => p.id === v) ? v! : "classic"; } catch { return "classic"; } };
let persona: OwlPersona = readPersona();
const psubs = new Set<() => void>();
export const owlPersona = {
  get: () => persona,
  set(p: OwlPersona) { if (p === persona) return; persona = p; try { localStorage.setItem(PKEY, p); } catch { /* ignore */ } psubs.forEach((s) => s()); },
  subscribe: (l: () => void) => { psubs.add(l); return () => { psubs.delete(l); }; },
};
export const useOwlPersona = () => useSyncExternalStore(owlPersona.subscribe, owlPersona.get);

const TRAITS: Record<OwlPersona, { bob: number; period: number; sway: number; blink: number; pupil: number; lid: number; speech: string[] }> = {
  classic: { bob: 0.045, period: 3.6, sway: 0, blink: 2400, pupil: 1, lid: 0, speech: ["hoo!", "hoot hoot", "psst…"] },
  scholar: { bob: 0.03, period: 4.8, sway: 0, blink: 3200, pupil: 1, lid: 0, speech: ["indeed.", "hm, curious", "ahem…"] },
  chill: { bob: 0.03, period: 6.5, sway: 3, blink: 3800, pupil: 0.95, lid: 0.34, speech: ["mmm…", "no rush", "vibes"] },
  hype: { bob: 0.08, period: 1.3, sway: 0, blink: 2000, pupil: 1.18, lid: 0, speech: ["LET'S GO", "hoot hoot!!", "you got this!"] },
  sassy: { bob: 0.04, period: 3.4, sway: 0, blink: 2800, pupil: 1, lid: 0.14, speech: ["really?", "mhm.", "oh, now you show up"] },
};

// ---- geometry ----
export const C = { bg0: "#52CC92", bg1: "#1B7A58", head: "#0E5C40", cream: "#FFF7E8", pupil: "#0E2B20", beak0: "#FFC24F", beak1: "#F28E1F", shine: "#FFE0A0", blush: "#FF8A7A", lid: "#2A8465", ear: "#37B484" };
export const EYES = [356, 668] as const;
export const EY = 500, R = 142, PR = 64;
export const HEAD = "M270 232 L404 300 C466 280 558 280 620 300 L754 232 C812 330 848 430 848 540 C848 696 706 800 512 800 C318 800 176 696 176 540 C176 430 212 330 270 232 Z";
export const BEAK = "M448 572 Q512 544 576 572 Q562 650 512 706 Q462 650 448 572 Z";
export const BEAK_LOW = "M474 634 Q512 618 550 634 Q536 676 512 706 Q488 676 474 634 Z";
export const BEAK_SHINE = "M480 580 Q512 568 536 578 Q520 584 500 600 Z";
const GAZE: [number, number][] = [[26, -26], [-30, -22], [40, 8], [0, 38], [-38, 4], [4, -42], [26, -26]];
const MAXLOOK = 56;
const HEART = "M0 22 C-26 0 -34 -14 -34 -24 C-34 -38 -22 -46 -12 -46 C-6 -46 0 -42 0 -34 C0 -42 6 -46 12 -46 C22 -46 34 -38 34 -24 C34 0 26 0 0 22Z";

export function Owl({ size = 40, mood = "idle", persona: personaProp, alive = false, face = true, interactive = false, speakKey, speakMs = 1800, onLongPress, onTap }: {
  size?: number; mood?: OwlMood; persona?: OwlPersona; alive?: boolean; face?: boolean; interactive?: boolean;
  speakKey?: string; speakMs?: number; onLongPress?: () => void; onTap?: () => void;
}) {
  const stored = useOwlPersona();
  const who = personaProp ?? stored;
  const T = TRAITS[who];
  const id = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const live = alive && !reduce;
  const root = useRef<HTMLDivElement>(null);
  const blink = useAnimationControls();
  const hop = useAnimationControls();
  const earL = useAnimationControls();
  const earR = useAnimationControls();
  const lookX = useMotionValue(GAZE[0][0]);
  const lookY = useMotionValue(GAZE[0][1]);
  const px = useSpring(lookX, { stiffness: 150, damping: 17 });
  const py = useSpring(lookY, { stiffness: 150, damping: 17 });
  const pointerUntil = useRef(0);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [talking, setTalking] = useState(false);
  const [hearts, setHearts] = useState(0);
  const reactTimer = useRef<number | undefined>(undefined);

  const mode = reaction === "love" ? "love" : reaction === "dizzy" ? "dizzy" : reaction === "yawn" ? "sleepy" : mood;

  // ----- gaze: finger/cursor first, otherwise a wandering glance, otherwise the mood's own look -----
  useEffect(() => {
    if (!interactive || !live) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = root.current?.getBoundingClientRect();
        if (!r || r.width === 0) return;
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * 0.49);
        const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 220);
        lookX.set((dx / d) * MAXLOOK * k); lookY.set((dy / d) * MAXLOOK * k);
        pointerUntil.current = performance.now() + 2600;
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerdown", onMove); cancelAnimationFrame(raf); };
  }, [interactive, live, lookX, lookY]);

  useEffect(() => {
    if (!live || mode === "think" || mode === "happy" || mode === "waiting" || mode === "dizzy" || mode === "love") return;
    let t: number, last = 0;
    const next = () => {
      if (performance.now() > pointerUntil.current) {
        let i = Math.floor(Math.random() * GAZE.length);
        if (i === last) i = (i + 1) % GAZE.length;
        last = i; lookX.set(GAZE[i][0]); lookY.set(GAZE[i][1]);
      }
      t = window.setTimeout(next, 1800 + Math.random() * 3200);
    };
    t = window.setTimeout(next, 1500 + Math.random() * 1500);
    return () => window.clearTimeout(t);
  }, [live, mode, lookX, lookY]);

  useEffect(() => {
    if (mode === "waiting") { lookX.set(0); lookY.set(22); return; }
    if (mode === "think") {
      const a = animate(lookX, [40, 0, -40, 0, 40], { duration: 1.4, repeat: Infinity, ease: "linear" });
      const b = animate(lookY, [0, -40, 0, 40, 0], { duration: 1.4, repeat: Infinity, ease: "linear" });
      return () => { a.stop(); b.stop(); };
    }
    if (mode === "happy" || mode === "idle" || mode === "excited") { lookX.set(GAZE[0][0]); lookY.set(GAZE[0][1]); }
  }, [mode, lookX, lookY]);

  // ----- blinking (personas blink at their own pace; sleepy owls slowly) + ear twitches -----
  useEffect(() => {
    if (!live || mode === "happy" || mode === "love" || mode === "dizzy") return;
    let t: number;
    const go = () => {
      const double = Math.random() < 0.18;
      void blink.start({ scaleY: double ? [1, 0.08, 1, 0.08, 1] : [1, 0.08, 1], transition: { duration: mode === "sleepy" ? 0.55 : double ? 0.4 : 0.2 } });
      t = window.setTimeout(go, (mode === "sleepy" ? 1400 : T.blink) + Math.random() * 3200);
    };
    t = window.setTimeout(go, 1200);
    return () => window.clearTimeout(t);
  }, [live, mode, blink, T.blink]);

  useEffect(() => {
    if (!live) return;
    let t: number;
    const twitch = () => {
      const c = Math.random() < 0.5 ? earL : earR;
      void c.start({ rotate: [0, -9, 5, 0], transition: { duration: 0.45 } });
      t = window.setTimeout(twitch, 4000 + Math.random() * 7000);
    };
    t = window.setTimeout(twitch, 3000);
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
  const say = () => T.speech[Math.floor(Math.random() * T.speech.length)];

  // Speaking: squash-and-stretch hop, beak chatter for roughly as long as the line takes to read.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduce || speakKey == null) return;
    void hop.start({ y: [0, -size * 0.16, 0], scaleY: [1, 1.08, 0.94, 1], scaleX: [1, 0.95, 1.05, 1], transition: { duration: 0.5, ease: [0.2, 0.8, 0.3, 1] } });
    setTalking(true);
    const t = window.setTimeout(() => setTalking(false), speakMs);
    return () => window.clearTimeout(t);
  }, [speakKey, speakMs, reduce, size, hop]);

  // Waking up: coming out of sleepy, it startles awake and hops.
  const prevMood = useRef(mood);
  useEffect(() => {
    if (prevMood.current === "sleepy" && mood !== "sleepy" && !reduce) void hop.start({ y: [0, -size * 0.22, 0, -size * 0.08, 0], rotate: [0, -8, 8, 0], transition: { duration: 0.8 } });
    prevMood.current = mood;
  }, [mood, reduce, size, hop]);

  // ----- touch: tap (wink / hoot / puff / spin), rapid taps (dizzy), stroke (purr), hold (menu) -----
  const taps = useRef<number[]>([]);
  const press = useRef({ x: 0, y: 0, moved: 0, held: false, timer: 0 as number | undefined, petted: false });
  const onDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    press.current = { x: e.clientX, y: e.clientY, moved: 0, held: false, petted: false, timer: window.setTimeout(() => { press.current.held = true; haptic.select(); onLongPress?.(); }, 560) };
  };
  const onMoveOwl = (e: React.PointerEvent) => {
    const p = press.current;
    if (!interactive || !p.timer || p.held) return;
    p.moved += Math.hypot(e.clientX - p.x, e.clientY - p.y); p.x = e.clientX; p.y = e.clientY;
    if (p.moved > 46 && !p.petted) { p.petted = true; window.clearTimeout(p.timer); react("love", 2600); haptic.celebrate(); }
  };
  const onUp = () => {
    const p = press.current;
    if (!interactive) return;
    window.clearTimeout(p.timer);
    if (p.held || p.petted) { p.timer = undefined; return; }
    p.timer = undefined;
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 1500), now];
    haptic.tap();
    onTap?.();
    if (taps.current.length >= 5) { taps.current = []; react("dizzy", 3200, "whoa… stop 😵"); haptic.warn(); return; }
    const pick = (["wink", "hoot", "puff", "spin"] as const)[Math.floor(Math.random() * 4)];
    if (pick === "wink") react("wink", 1100);
    else if (pick === "hoot") { react("hoot", 1700, say()); void hop.start({ y: [0, -size * 0.12, 0], transition: { duration: 0.35 } }); }
    else if (pick === "puff") { react("puff", 700); void hop.start({ scaleX: [1, 1.14, 1], scaleY: [1, 1.14, 1], transition: { duration: 0.5, ease: "easeOut" } }); }
    else { react("spin", 900); void hop.start({ rotate: [0, 360], scale: [1, 1.1, 1], transition: { duration: 0.7, ease: [0.3, 0.7, 0.2, 1] } }); }
  };

  const happy = mode === "happy";
  const eyeArc = (x: number) => `M${x - R * 0.72} ${EY + 24} Q${x} ${EY - R * 0.95} ${x + R * 0.72} ${EY + 24}`;
  const winkArc = (x: number) => `M${x - R * 0.7} ${EY - 8} L${x + R * 0.6} ${EY + 22} L${x - R * 0.7} ${EY + 50}`;
  const pupilR = PR * T.pupil * (mode === "excited" ? 1.22 : 1);
  const bob = mode === "excited" ? T.bob * 1.6 : T.bob;
  const period = mode === "excited" ? Math.min(T.period, 1.1) : T.period;
  const tilt = who === "sassy" && !happy ? 6 : 0;

  return (
    <motion.div ref={root}
      animate={live ? (mode === "waiting" || T.sway ? { y: [0, -size * bob, 0], rotate: [tilt, tilt - Math.max(7, T.sway), tilt, tilt + Math.max(7, T.sway), tilt] } : { y: [0, -size * bob, 0], rotate: tilt }) : { rotate: tilt }}
      transition={live ? { y: { duration: period, repeat: Infinity, ease: "easeInOut" }, rotate: { duration: mode === "waiting" ? 6 : 8, repeat: Infinity, ease: "easeInOut" } } : { duration: 0.3 }}
      onPointerDown={onDown} onPointerMove={onMoveOwl} onPointerUp={onUp} onPointerCancel={() => window.clearTimeout(press.current.timer)}
      style={{ width: size, height: size, lineHeight: 0, position: "relative", touchAction: interactive ? "manipulation" : undefined, cursor: interactive ? "pointer" : undefined, userSelect: "none", WebkitUserSelect: "none" }}>
      <motion.svg width={size} height={size} viewBox="0 0 1024 1024" animate={hop} aria-hidden style={{ overflow: "visible", transformOrigin: "50% 80%" }}>
        <defs>
          <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.bg0} /><stop offset="1" stopColor={C.bg1} /></linearGradient>
          <radialGradient id={`${id}gl`} cx=".3" cy=".22" r=".8"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
          <linearGradient id={`${id}bk`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.beak0} /><stop offset="1" stopColor={C.beak1} /></linearGradient>
          {EYES.map((x) => <clipPath key={x} id={`${id}c${x}`}><circle cx={x} cy={EY} r={R + 2} /></clipPath>)}
        </defs>
        {face && <><rect width="1024" height="1024" rx="232" fill={`url(#${id}bg)`} /><rect width="1024" height="1024" rx="232" fill={`url(#${id}gl)`} /></>}

        {who === "hype" && live && [[150, 250, 0], [880, 280, 0.6], [820, 150, 1.2]].map(([x, y, d]) => (
          <motion.path key={`${x}`} d="M0 -34 L9 -9 L34 0 L9 9 L0 34 L-9 9 L-34 0 L-9 -9Z" fill="#FFE08A" style={{ x, y }} animate={{ scale: [0, 1, 0], rotate: [0, 90] }} transition={{ duration: 1.6, repeat: Infinity, delay: d }} />
        ))}

        {who === "chill" && <path d="M200 520 C196 300 330 262 512 262 C694 262 828 300 824 520" fill="none" stroke="#2D2D40" strokeWidth="38" strokeLinecap="round" />}
        <path d={HEAD} fill={C.head} fillOpacity=".55" stroke={C.head} strokeOpacity=".55" strokeWidth="26" strokeLinejoin="round" />
        <motion.path d="M270 232 L340 272 L262 320 Z" fill={C.ear} fillOpacity=".5" animate={earL} style={{ transformOrigin: "300px 306px" }} />
        <motion.path d="M754 232 L684 272 L762 320 Z" fill={C.ear} fillOpacity=".5" animate={earR} style={{ transformOrigin: "724px 306px" }} />
        {who === "chill" && [[146, 470], [792, 470]].map(([x, y]) => (
          <g key={x}><rect x={x} y={y} width="86" height="190" rx="40" fill="#2D2D40" /><rect x={x + 14} y={y + 16} width="58" height="158" rx="30" fill="none" stroke="#52CC92" strokeWidth="9" strokeOpacity=".9" /></g>
        ))}

        {EYES.map((x, i) => {
          const arc = happy || (reaction === "wink" && i === 1) || reaction === "yawn";
          const lid = mode === "sleepy" ? 0.5 : who === "sassy" ? (i === 0 ? 0.26 : 0.04) : T.lid;
          return arc ? (
            <g key={x}>
              <motion.path d={reaction === "wink" ? winkArc(x) : eyeArc(x)} stroke={C.cream} strokeWidth="46" strokeLinecap="round" strokeLinejoin="round" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.22 }} />
              {happy && <motion.circle cx={x + (x < 512 ? -66 : 66)} cy={EY + 140} r="38" fill={C.blush} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 0.55, scale: 1 }} style={{ transformOrigin: `${x + (x < 512 ? -66 : 66)}px ${EY + 140}px` }} />}
            </g>
          ) : (
            <motion.g key={x} animate={blink} style={{ transformOrigin: `${x}px ${EY}px` }}>
              <circle cx={x} cy={EY} r={R + 10} fill="#0F4A35" opacity=".35" />
              <circle cx={x} cy={EY} r={R} fill={C.cream} />
              <motion.g style={{ x: px, y: py }}>
                {mode === "love" ? (
                  <motion.path d={HEART} fill="#FF5A7A" transform={`translate(${x} ${EY + 8}) scale(1.35)`} animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 0.6, repeat: Infinity }} />
                ) : mode === "dizzy" ? (
                  <motion.g style={{ transformOrigin: `${x}px ${EY}px` }} animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }}>
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
              {lid > 0 && <g clipPath={`url(#${id}c${x})`}><motion.rect x={x - R - 4} y={EY - R - 4} width={2 * R + 8} height={2 * R * lid + 4} fill={C.lid} initial={{ scaleY: 0.3 }} animate={{ scaleY: 1 }} style={{ transformOrigin: `${x}px ${EY - R}px` }} transition={{ duration: 0.7 }} /></g>}
              {mode === "sleepy" && <g clipPath={`url(#${id}c${x})`}><motion.rect x={x - R - 4} y={EY - R - 4} width={2 * R + 8} height={R + 4} fill={C.lid} initial={{ scaleY: 0.2 }} animate={{ scaleY: 1 }} style={{ transformOrigin: `${x}px ${EY - R}px` }} transition={{ duration: 0.8 }} /></g>}
            </motion.g>
          );
        })}

        {who === "scholar" && (
          <g fill="none" stroke="#D9A441" strokeWidth="15" strokeLinecap="round">
            {EYES.map((x) => <g key={x}><circle cx={x} cy={EY} r={R + 24} /><path d={`M${x - 70} ${EY - 96} Q${x - 100} ${EY - 40} ${x - 100} ${EY + 4}`} stroke="#fff" strokeOpacity=".5" strokeWidth="11" /></g>)}
            <path d="M506 478 Q512 462 518 478" /><path d="M214 470 L168 452" /><path d="M810 470 L856 452" />
          </g>
        )}
        {who === "sassy" && (
          <g stroke={C.head} strokeWidth="26" strokeLinecap="round" fill="none">
            <motion.path d="M252 350 L452 386" animate={{ y: [0, 0, 6, 0] }} transition={{ duration: 5, repeat: live ? Infinity : 0 }} />
            <motion.path d="M580 352 Q700 292 780 306" animate={{ y: [0, -10, 0] }} transition={{ duration: 3.2, repeat: live ? Infinity : 0, ease: "easeInOut" }} />
          </g>
        )}

        <motion.g animate={talking || reaction === "hoot" ? { scaleY: [1, 0.78, 1, 0.86, 1, 0.8, 1] } : reaction === "yawn" ? { scaleY: [1, 1.5, 1.5, 1] } : { scaleY: 1 }}
          transition={talking || reaction === "hoot" ? { duration: 0.55, repeat: Infinity } : reaction === "yawn" ? { duration: 1.6 } : { duration: 0.15 }} style={{ transformOrigin: "512px 572px" }}>
          <path d={BEAK} fill={`url(#${id}bk)`} />
          <path d={BEAK_LOW} fill={C.beak1} opacity=".55" />
          <path d={BEAK_SHINE} fill={C.shine} opacity=".9" />
        </motion.g>

        {who === "hype" && (
          <g>
            <path d="M190 342 Q512 262 834 342" fill="none" stroke="#FF5A5F" strokeWidth="46" strokeLinecap="round" />
            <path d="M190 330 Q512 250 834 330" fill="none" stroke="#fff" strokeOpacity=".28" strokeWidth="10" strokeLinecap="round" />
            <path d="M512 262 l16 32 l36 5 l-26 25 l6 36 l-32 -17 l-32 17 l6 -36 l-26 -25 l36 -5Z" fill="#FFE08A" transform="translate(0 -52) scale(.9) translate(52 6)" />
          </g>
        )}

        {mode === "sleepy" && live && [0, 1, 2].map((i) => (
          <motion.text key={i} x="790" y="300" fontSize={130 - i * 14} fontWeight="800" fill={C.cream} fontFamily="system-ui, sans-serif"
            initial={{ opacity: 0 }} animate={{ opacity: [0, 0.95, 0], y: [0, -150], x: [0, 40] }} transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.85, ease: "easeOut" }}>z</motion.text>
        ))}

        <AnimatePresence>
          {reaction === "love" && [0, 1, 2, 3].map((i) => (
            <motion.path key={`${hearts}-${i}`} d={HEART} fill="#FF5A7A" initial={{ x: 380 + i * 90, y: 250, scale: 0, opacity: 0 }}
              animate={{ y: -80 - i * 40, scale: [0, 0.8 + i * 0.1, 0.6], opacity: [0, 1, 0], rotate: [-10, 10, -6] }} transition={{ duration: 1.8, delay: i * 0.25, repeat: 1 }} />
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
    </motion.div>
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

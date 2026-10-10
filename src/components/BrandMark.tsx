import { useEffect, useId, useRef, useState } from "react";
import { motion, useAnimationControls, useReducedMotion } from "motion/react";

// The UpWise owl. Same geometry as the launcher icon (1024 box — keep in sync with the icon
// generator). Fixed brand colours on purpose: the wallpaper palette would wash a mascot out.
//
// Alive: wanders its gaze, blinks at random, bobs. Moods change how it looks, `speakKey` makes
// it hop and chatter its beak when it has something new to say.
export type OwlMood = "idle" | "happy" | "think" | "sleepy" | "waiting";

const C = { bg0: "#52CC92", bg1: "#1B7A58", head: "#0E5C40", cream: "#FFF7E8", pupil: "#0E2B20", beak0: "#FFC24F", beak1: "#F28E1F", shine: "#FFE0A0", blush: "#FF8A7A", lid: "#2A8465" };
const EYES = [356, 668] as const;
const EY = 500, R = 142, PR = 64;
const HEAD = "M270 232 L404 300 C466 280 558 280 620 300 L754 232 C812 330 848 430 848 540 C848 696 706 800 512 800 C318 800 176 696 176 540 C176 430 212 330 270 232 Z";
const BEAK = "M448 572 Q512 544 576 572 Q562 650 512 706 Q462 650 448 572 Z";
const BEAK_LOW = "M474 634 Q512 618 550 634 Q536 676 512 706 Q488 676 474 634 Z";
const BEAK_SHINE = "M480 580 Q512 568 536 578 Q520 584 500 600 Z";
// Where the pupils can glance (offsets from the eye centre; the default up-right look first).
const GAZE: [number, number][] = [[26, -26], [-30, -22], [40, 8], [0, 38], [-38, 4], [4, -42], [26, -26]];

export function Owl({ size = 40, mood = "idle", alive = false, face = true, speakKey, speakMs = 1800 }: {
  size?: number; mood?: OwlMood; alive?: boolean; face?: boolean; speakKey?: string; speakMs?: number;
}) {
  const id = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const live = alive && !reduce;
  const blink = useAnimationControls();
  const hop = useAnimationControls();
  const [gaze, setGaze] = useState<[number, number]>(GAZE[0]);
  const [talking, setTalking] = useState(false);

  // Wander: a new glance every few seconds, never the same spot twice running.
  useEffect(() => {
    if (!live || mood === "think" || mood === "happy" || mood === "waiting") return;
    let t: number, last = 0;
    const next = () => {
      let i = Math.floor(Math.random() * GAZE.length);
      if (i === last) i = (i + 1) % GAZE.length;
      last = i; setGaze(GAZE[i]);
      t = window.setTimeout(next, 1800 + Math.random() * 3200);
    };
    t = window.setTimeout(next, 1500 + Math.random() * 1500);
    return () => window.clearTimeout(t);
  }, [live, mood]);

  // Blink at random (sleepy owls blink slowly, and a lot).
  useEffect(() => {
    if (!live || mood === "happy") return;
    let t: number;
    const go = () => {
      void blink.start({ scaleY: [1, 0.08, 1], transition: { duration: mood === "sleepy" ? 0.5 : 0.2, times: [0, 0.45, 1] } });
      t = window.setTimeout(go, (mood === "sleepy" ? 1400 : 2400) + Math.random() * 3200);
    };
    t = window.setTimeout(go, 1200);
    return () => window.clearTimeout(t);
  }, [live, mood, blink]);

  // Waking up: coming out of sleepy, it startles awake and hops.
  const prevMood = useRef(mood);
  useEffect(() => {
    if (prevMood.current === "sleepy" && mood !== "sleepy" && !reduce) {
      void hop.start({ y: [0, -size * 0.22, 0, -size * 0.08, 0], rotate: [0, -8, 8, 0], transition: { duration: 0.8 } });
    }
    prevMood.current = mood;
  }, [mood, reduce, size, hop]);

  // Speaking: a squash-and-stretch hop, then the beak chatters for roughly as long as the line takes to read in.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduce || speakKey == null) return;
    void hop.start({ y: [0, -size * 0.16, 0], scaleY: [1, 1.08, 0.94, 1], scaleX: [1, 0.95, 1.05, 1], transition: { duration: 0.5, ease: [0.2, 0.8, 0.3, 1] } });
    setTalking(true);
    const t = window.setTimeout(() => setTalking(false), speakMs);
    return () => window.clearTimeout(t);
  }, [speakKey, speakMs, reduce, size, hop]);

  const pupil = mood === "waiting"
    // Waiting for you: pupils settle straight at the viewer, a touch low.
    ? { x: -GAZE[0][0], y: 22 - GAZE[0][1], transition: { type: "spring" as const, stiffness: 90, damping: 18 } }
    : mood === "think"
    ? { x: [40, 0, -40, 0, 40], y: [0, -40, 0, 40, 0], transition: { duration: 1.4, repeat: Infinity, ease: "linear" as const } }
    : { x: gaze[0] - GAZE[0][0], y: gaze[1] - GAZE[0][1], transition: { type: "spring" as const, stiffness: 140, damping: 16 } };

  return (
    <motion.div
      animate={live ? (mood === "waiting" ? { y: [0, -size * 0.03, 0], rotate: [0, -7, 0, 7, 0] } : { y: [0, -size * 0.045, 0] }) : undefined}
      transition={live ? { y: { duration: 3.6, repeat: Infinity, ease: "easeInOut" }, rotate: { duration: 6, repeat: Infinity, ease: "easeInOut" } } : undefined}
      style={{ width: size, height: size, lineHeight: 0 }}>
      <motion.svg width={size} height={size} viewBox="0 0 1024 1024" animate={hop} aria-hidden style={{ overflow: "visible", transformOrigin: "50% 80%" }}>
        <defs>
          <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.bg0} /><stop offset="1" stopColor={C.bg1} /></linearGradient>
          <radialGradient id={`${id}gl`} cx=".3" cy=".22" r=".8"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
          <linearGradient id={`${id}bk`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.beak0} /><stop offset="1" stopColor={C.beak1} /></linearGradient>
        </defs>
        {face && <><rect width="1024" height="1024" rx="232" fill={`url(#${id}bg)`} /><rect width="1024" height="1024" rx="232" fill={`url(#${id}gl)`} /></>}
        <path d={HEAD} fill={C.head} fillOpacity=".55" stroke={C.head} strokeOpacity=".55" strokeWidth="26" strokeLinejoin="round" />

        {EYES.map((x) => mood === "happy" ? (
          <g key={x}>
            <motion.path d={`M${x - R * 0.72} ${EY + 24} Q${x} ${EY - R * 0.95} ${x + R * 0.72} ${EY + 24}`} stroke={C.cream} strokeWidth="46" strokeLinecap="round" fill="none"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.25 }} />
            <motion.circle cx={x + (x < 512 ? -66 : 66)} cy={EY + 140} r="38" fill={C.blush} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 0.55, scale: 1 }} style={{ transformOrigin: `${x + (x < 512 ? -66 : 66)}px ${EY + 140}px` }} />
          </g>
        ) : (
          <motion.g key={x} animate={blink} style={{ transformOrigin: `${x}px ${EY}px` }}>
            <circle cx={x} cy={EY} r={R + 10} fill="#0F4A35" opacity=".35" />
            <circle cx={x} cy={EY} r={R} fill={C.cream} />
            <motion.g animate={pupil}>
              <circle cx={x + GAZE[0][0]} cy={EY + GAZE[0][1]} r={PR} fill={C.pupil} />
              <circle cx={x + GAZE[0][0] - 22} cy={EY + GAZE[0][1] - 24} r="20" fill={C.cream} />
              <circle cx={x + GAZE[0][0] + 22} cy={EY + GAZE[0][1] + 20} r="8" fill={C.cream} opacity=".85" />
            </motion.g>
            {mood === "sleepy" && (
              <motion.path d={`M${x - R - 4} ${EY} A${R + 4} ${R + 4} 0 0 1 ${x + R + 4} ${EY} Z`} fill={C.lid}
                initial={{ scaleY: 0.2 }} animate={{ scaleY: 1 }} transition={{ duration: 0.8 }} style={{ transformOrigin: `${x}px ${EY - R}px` }} />
            )}
          </motion.g>
        ))}

        {mood === "sleepy" && live && [0, 1, 2].map((i) => (
          <motion.text key={i} x="790" y="300" fontSize={130 - i * 14} fontWeight="800" fill={C.cream} fontFamily="system-ui, sans-serif"
            initial={{ opacity: 0 }} animate={{ opacity: [0, 0.95, 0], y: [0, -150], x: [0, 40] }} transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.85, ease: "easeOut" }}>z</motion.text>
        ))}

        <motion.g animate={talking ? { scaleY: [1, 0.78, 1, 0.86, 1, 0.8, 1] } : { scaleY: 1 }} transition={talking ? { duration: 0.55, repeat: Infinity } : { duration: 0.15 }} style={{ transformOrigin: "512px 572px" }}>
          <path d={BEAK} fill={`url(#${id}bk)`} />
          <path d={BEAK_LOW} fill={C.beak1} opacity=".55" />
          <path d={BEAK_SHINE} fill={C.shine} opacity=".9" />
        </motion.g>
      </motion.svg>
    </motion.div>
  );
}

/** Welcome/PIN screens: the owl pops in with a wobble, then settles into being alive. */
export function BrandMark({ size = 88 }: { size?: number }) {
  return (
    <motion.div initial={{ scale: 0.5, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 240, damping: 14 }} style={{ width: size, height: size }}>
      <Owl size={size} alive />
    </motion.div>
  );
}

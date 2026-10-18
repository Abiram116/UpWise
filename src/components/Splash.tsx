import { useEffect, useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BEAK, BEAK_LOW, BEAK_SHINE, C, EYES, EY, HEAD, PR, R } from "./BrandMark";
import { haptic } from "../lib/haptics";

// Cold-start intro (~1.5s + a 0.6s exit), cut like a channel ident:
//   0.00  darkness. Two eyes open (real upper lids lifting), glowing, huge in frame
//   0.30  they glance left, right — then look up at you
//   0.58  SNAP: the camera slams back, the owl irises open around the eyes, a flash,
//         shockwave rings and a spark burst, and a haptic click in your hand
//   0.78  the wordmark slams in letter by letter, tracking tightening; a rule draws under it
//   1.20  one natural blink
//   exit  a curtain lifts up off the screen (Up-Wise), revealing the app already waiting
// Transforms/opacity plus one SVG clip; nothing runs once it's gone.
const SNAP = 0.58;
const D = 1.5; // length of the eye timeline (lids + pupils)
const WORD = "UpWise".split("");
const EXPO = [0.16, 1, 0.3, 1] as const;

// Upper eyelid: an ellipse clip rising from below the eye reveals it with a curved lid edge;
// sliding it back down is a blink (fast close, a hair of hold, slower open — like a real one).
const LID_RY = R * 1.4, LID_RX = R * 1.6;
const OPEN = EY + R * 0.35, SHUT = EY + R + LID_RY + 6;
const at = (t: number) => t / D;
const LID = {
  cy: [SHUT, SHUT, OPEN, OPEN, SHUT, SHUT, OPEN],
  times: [0, at(0.06), at(0.4), at(1.2), at(1.27), at(1.3), at(1.45)],
  ease: ["linear", [0.2, 0.7, 0.3, 1], "linear", [0.5, 0, 0.9, 0.6], "linear", [0.2, 0.8, 0.4, 1]],
};
const PUPIL = {
  x: [0, 0, -38, -38, 36, 36, 22],
  y: [0, 0, 8, 8, 6, 6, -24],
  times: [0, at(0.3), at(0.36), at(0.46), at(0.52), at(0.6), at(0.72)],
};

export function Splash({ leaving = false }: { leaving?: boolean }) {
  const reduce = useReducedMotion() === true;
  useEffect(() => {
    if (reduce) return;
    const t = window.setTimeout(() => haptic.tap(), SNAP * 1000);
    return () => window.clearTimeout(t);
  }, [reduce]);
  const sparks = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.35, d = 120 + Math.random() * 110;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, s: 4 + Math.random() * 6, c: ["#FFC24F", "#52CC92", "#FFF7E8"][i % 3], k: Math.random() * 0.08 };
  }), []);

  const s = (delay: number) => ({ delay: reduce ? 0 : delay });
  return (
    <motion.div className="intro" role="img" aria-label="UpWise"
      initial={{ clipPath: "inset(0% 0% 0% 0% round 0px)" }}
      animate={{ clipPath: leaving ? (reduce ? "inset(0% 0% 0% 0% round 0px)" : "inset(0% 0% 100% 0% round 0px 0px 48px 48px)") : "inset(0% 0% 0% 0% round 0px)", opacity: leaving && reduce ? 0 : 1 }}
      transition={leaving ? { duration: reduce ? 0.2 : 0.62, ease: [0.76, 0, 0.24, 1] } : { duration: 0 }}>
      {!reduce && <motion.div className="intro-flash" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.55, 0] }} transition={{ duration: 0.34, delay: SNAP, times: [0, 0.15, 1] }} />}
      <motion.div className="intro-stage" animate={leaving && !reduce ? { y: -70, opacity: 0 } : { y: 0, opacity: 1 }} transition={{ duration: 0.45, ease: [0.5, 0, 0.75, 0] }}>
        <div className="intro-mark">
          {!reduce && [0, 1, 2].map((i) => (
            <motion.div key={i} className="intro-ring" data-i={i} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: [0.9, 2.5 + i * 0.5], opacity: [0, 0.9, 0] }}
              transition={{ duration: 0.8 + i * 0.12, delay: SNAP + 0.06 + i * 0.07, ease: EXPO, times: [0, 0.12, 1] }} />
          ))}
          {!reduce && sparks.map((p, i) => (
            <motion.i key={i} className="intro-spark" style={{ width: p.s, height: p.s, background: p.c }} initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
              animate={{ x: p.x, y: p.y, scale: [0, 1, 0.3], opacity: [0, 1, 0] }} transition={{ duration: 0.7, delay: SNAP + 0.08 + p.k, ease: EXPO }} />
          ))}
          {/* the camera: starts pushed in tight on the eyes, then snaps back */}
          <motion.div className="intro-camera" initial={reduce ? false : { scale: 3.2, y: 34 }} animate={{ scale: 1, y: 0 }}
            transition={{ duration: 0.62, delay: SNAP, ease: EXPO }}>
            <svg width="168" height="168" viewBox="0 0 1024 1024" style={{ overflow: "visible", display: "block" }}>
              <defs>
                <linearGradient id="inbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.bg0} /><stop offset="1" stopColor={C.bg1} /></linearGradient>
                <linearGradient id="inbk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.beak0} /><stop offset="1" stopColor={C.beak1} /></linearGradient>
                <radialGradient id="inglow"><stop offset="0.55" stopColor="#FFE9B8" stopOpacity="0.55" /><stop offset="1" stopColor="#FFE9B8" stopOpacity="0" /></radialGradient>
                {/* the body irises open from the eyes outward at the snap */}
                <clipPath id="iniris"><motion.circle cx="512" cy={EY} initial={{ r: reduce ? 900 : 0 }} animate={{ r: 900 }} transition={{ duration: 0.55, delay: SNAP, ease: EXPO }} /></clipPath>
                {EYES.map((x, i) => (
                  <clipPath id={`inlid${i}`} key={x}>
                    <motion.ellipse cx={x} rx={LID_RX} ry={LID_RY} initial={{ cy: reduce ? OPEN : SHUT }}
                      animate={reduce ? { cy: OPEN } : { cy: LID.cy }} transition={{ duration: D, times: LID.times, ease: LID.ease as never, delay: i * 0.02 }} />
                  </clipPath>
                ))}
              </defs>
              <g clipPath="url(#iniris)">
                <rect width="1024" height="1024" rx="232" fill="url(#inbg)" />
                <path d={HEAD} fill={C.head} fillOpacity=".55" stroke={C.head} strokeOpacity=".55" strokeWidth="26" strokeLinejoin="round" />
              </g>
              {/* in the dark, the eyes glow; the glow dies as the light comes up */}
              {!reduce && EYES.map((x) => (
                <motion.circle key={x} cx={x} cy={EY} r={R * 1.9} fill="url(#inglow)" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }}
                  transition={{ duration: SNAP + 0.3, times: [0, 0.35, 0.66, 1] }} />
              ))}
              {EYES.map((x, i) => (
                <g key={x}>
                  <circle cx={x} cy={EY} r={R + 10} fill="#0F4A35" opacity=".35" clipPath="url(#iniris)" />
                  <g clipPath={`url(#inlid${i})`}>
                    <circle cx={x} cy={EY} r={R} fill={C.cream} />
                    <motion.g initial={reduce ? { x: 22, y: -24 } : { x: 0, y: 0 }} animate={reduce ? { x: 22, y: -24 } : { x: PUPIL.x, y: PUPIL.y }}
                      transition={{ duration: D, times: PUPIL.times, ease: "easeInOut" }}>
                      <circle cx={x} cy={EY} r={PR} fill={C.pupil} />
                      <circle cx={x - 22} cy={EY - 24} r="20" fill={C.cream} />
                      <circle cx={x + 22} cy={EY + 20} r="8" fill={C.cream} opacity=".85" />
                    </motion.g>
                  </g>
                </g>
              ))}
              <motion.g style={{ transformOrigin: "512px 600px" }} initial={reduce ? false : { scale: 0, y: 40 }} animate={{ scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 520, damping: 14, delay: SNAP + 0.14 }}>
                <path d={BEAK} fill="url(#inbk)" /><path d={BEAK_LOW} fill={C.beak1} opacity=".55" /><path d={BEAK_SHINE} fill={C.shine} opacity=".9" />
              </motion.g>
            </svg>
          </motion.div>
        </div>
        <motion.div className="intro-word" aria-hidden initial={reduce ? false : { letterSpacing: "0.32em" }} animate={{ letterSpacing: "-0.03em" }}
          transition={{ duration: 0.7, ...s(SNAP + 0.2), ease: EXPO }}>
          {WORD.map((ch, i) => (
            <span key={i} className="mask-word" style={{ margin: 0, padding: "0.08em 0.012em 0.18em" }}>
              <span className={`mask-in${i < 2 ? " intro-up" : ""}`} style={{ animationDelay: reduce ? "0s" : `${SNAP + 0.2 + i * 0.045}s` }}>{ch}</span>
            </span>
          ))}
        </motion.div>
        <motion.div className="intro-rule" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.5, ...s(SNAP + 0.48), ease: EXPO }} />
      </motion.div>
    </motion.div>
  );
}

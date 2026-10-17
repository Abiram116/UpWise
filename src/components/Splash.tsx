import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BEAK, BEAK_LOW, BEAK_SHINE, C, EYES, EY, HEAD, PR, R } from "./BrandMark";

// Launch animation (≈1.2s). The owl assembles itself: squircle springs in, head rises, eyes pop,
// pupils dart around, the beak pops with a burst of sparks, a blink, then the wordmark types
// itself in. Everything is transforms + opacity, so it stays on the GPU and costs almost nothing.
const spring = (delay: number, stiffness = 320, damping = 13) => ({ type: "spring" as const, stiffness, damping, delay });
const WORD = "UpWise".split("");

export function Splash() {
  const reduce = useReducedMotion();
  const sparks = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4, d = 260 + Math.random() * 180;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d - 40, s: 10 + Math.random() * 14, c: ["#FFC24F", "#FFE08A", "#52CC92", "#FFF7E8"][i % 4] };
  }), []);
  return (
    <div className="splash" role="img" aria-label="UpWise">
      <motion.div className="splash-glow" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: [0.3, 1.1, 1], opacity: [0, 0.9, 0.6] }} transition={{ duration: 1.3, delay: reduce ? 0 : 0.1 }} />
      <motion.svg width="168" height="168" viewBox="0 0 1024 1024" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="spbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.bg0} /><stop offset="1" stopColor={C.bg1} /></linearGradient>
          <linearGradient id="spbk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.beak0} /><stop offset="1" stopColor={C.beak1} /></linearGradient>
        </defs>
        <motion.rect width="1024" height="1024" rx="232" fill="url(#spbg)" style={{ transformOrigin: "512px 512px" }}
          initial={reduce ? false : { scale: 0.5, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={spring(0, 240, 15)} />
        <motion.path d={HEAD} fill={C.head} fillOpacity=".55" stroke={C.head} strokeOpacity=".55" strokeWidth="26" strokeLinejoin="round" style={{ transformOrigin: "512px 800px" }}
          initial={reduce ? false : { scaleY: 0.35, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={spring(0.12, 260, 14)} />
        <motion.g animate={reduce ? undefined : { scaleY: [1, 1, 0.08, 1] }} transition={{ duration: 0.3, delay: 1.0, times: [0, 0.2, 0.55, 1] }} style={{ transformOrigin: `512px ${EY}px` }}>
          {EYES.map((x, i) => (
            <motion.g key={x} style={{ transformOrigin: `${x}px ${EY}px` }} initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={spring(0.28 + i * 0.07, 380, 11)}>
              <circle cx={x} cy={EY} r={R + 10} fill="#0F4A35" opacity=".35" />
              <circle cx={x} cy={EY} r={R} fill={C.cream} />
              <motion.g initial={reduce ? false : { scale: 0, x: 0, y: 0 }} animate={reduce ? { scale: 1, x: 26, y: -26 } : { scale: 1, x: [0, -34, 36, 26], y: [0, 14, -8, -26] }}
                style={{ transformOrigin: `${x}px ${EY}px` }} transition={{ scale: spring(0.5, 420, 12), x: { duration: 0.8, delay: 0.62, times: [0, 0.3, 0.7, 1] }, y: { duration: 0.8, delay: 0.62, times: [0, 0.3, 0.7, 1] } }}>
                <circle cx={x} cy={EY} r={PR} fill={C.pupil} />
                <circle cx={x - 22} cy={EY - 24} r="20" fill={C.cream} />
                <circle cx={x + 22} cy={EY + 20} r="8" fill={C.cream} opacity=".85" />
              </motion.g>
            </motion.g>
          ))}
        </motion.g>
        <motion.g style={{ transformOrigin: "512px 572px" }} initial={reduce ? false : { scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={spring(0.5, 520, 10)}>
          <path d={BEAK} fill="url(#spbk)" /><path d={BEAK_LOW} fill={C.beak1} opacity=".55" /><path d={BEAK_SHINE} fill={C.shine} opacity=".9" />
        </motion.g>
        {!reduce && sparks.map((s, i) => (
          <motion.circle key={i} cx="512" cy="640" r={s.s} fill={s.c} initial={{ x: 0, y: 0, opacity: 0, scale: 0 }} animate={{ x: s.x, y: s.y, opacity: [0, 1, 0], scale: [0, 1, 0.4] }} transition={{ duration: 0.95, delay: 0.55, ease: [0.1, 0.7, 0.2, 1] }} />
        ))}
      </motion.svg>
      <div className="splash-word" aria-hidden>
        {WORD.map((ch, i) => (
          <motion.span key={i} initial={reduce ? false : { opacity: 0, y: 16, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.45, delay: 0.62 + i * 0.05, ease: [0.05, 0.7, 0.1, 1] }}>{ch}</motion.span>
        ))}
      </div>
    </div>
  );
}

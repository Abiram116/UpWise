import { useEffect, useMemo, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BEAK, BEAK_LOW, BEAK_SHINE, C, EYES, EY, HEAD, PR, R } from "./BrandMark";

// Launch sequence (~1.25s), built like a title card:
//   0.00  a drifting field of light motes fades in; a diagonal light-sweep crosses the frame
//   0.00  the squircle springs in, the head rises, a slow camera push-in begins
//   0.28  eyes pop (spring overshoot) and ignite — a bloom flashes behind them
//   0.50  pupils dart left, right, centre; the beak pops with a burst of sparks
//   0.62  wordmark letters slide up out of their masks; an amber rule draws underneath
//   1.00  one blink
//   exit  an iris closes onto the owl, revealing the app already waiting underneath
// Everything is transforms/opacity except the one-off clip-path iris and a ~50-particle canvas
// that runs only while the splash is up, so it's cheap even at 120 Hz.
const spring = (delay: number, stiffness = 320, damping = 13) => ({ type: "spring" as const, stiffness, damping, delay });
const WORD = "UpWise".split("");

function Motes() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const W = window.innerWidth, H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr);
    const motes = Array.from({ length: 52 }, () => ({ x: Math.random() * W, y: H * (0.4 + Math.random() * 0.8), r: 0.8 + Math.random() * 2.2, v: 14 + Math.random() * 40, p: Math.random() * 6.28, hue: Math.random() < 0.7 ? "82, 204, 146" : "255, 194, 79" }));
    let last = performance.now(), raf = 0, t = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      const fade = Math.min(1, t / 0.5);
      for (const m of motes) {
        m.y -= m.v * dt; m.x += Math.sin(t * 0.8 + m.p) * 6 * dt;
        if (m.y < -10) { m.y = H + 10; m.x = Math.random() * W; }
        const a = (0.25 + 0.35 * Math.sin(t * 2 + m.p)) * fade;
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 5);
        g.addColorStop(0, `rgba(${m.hue}, ${Math.max(0, a)})`); g.addColorStop(1, `rgba(${m.hue}, 0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 5, 0, 6.283); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="splash-motes" />;
}

export function Splash({ leaving = false }: { leaving?: boolean }) {
  const reduce = useReducedMotion();
  const sparks = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4, d = 260 + Math.random() * 180;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d - 40, s: 10 + Math.random() * 14, c: ["#FFC24F", "#FFE08A", "#52CC92", "#FFF7E8"][i % 4] };
  }), []);
  return (
    <motion.div className="splash" role="img" aria-label="UpWise"
      initial={{ clipPath: "circle(150% at 50% 42%)" }}
      animate={{ clipPath: leaving && !reduce ? "circle(0% at 50% 42%)" : "circle(150% at 50% 42%)" }}
      transition={leaving ? { duration: 0.72, ease: [0.7, 0, 0.2, 1] } : { duration: 0 }}>
      {!reduce && <Motes />}
      <div className="splash-vignette" />
      {!reduce && <motion.div className="splash-sweep" initial={{ x: "-140%" }} animate={{ x: "140%" }} transition={{ duration: 1.15, delay: 0.12, ease: [0.4, 0, 0.2, 1] }} />}
      <motion.div className="splash-glow" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: [0.3, 1.1, 1], opacity: [0, 0.9, 0.6] }} transition={{ duration: 1.3, delay: reduce ? 0 : 0.1 }} />
      <motion.div className="splash-camera" initial={{ scale: 1 }} animate={{ scale: reduce ? 1 : 1.07 }} transition={{ duration: 1.9, ease: "easeOut" }}>
        <div style={{ position: "relative", width: 168, height: 168 }}>
          <motion.svg width="168" height="168" viewBox="0 0 1024 1024" style={{ overflow: "visible", position: "relative" }}>
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
          {/* the eyes ignite: a bloom flares behind them as they pop open */}
          {!reduce && <motion.div className="splash-bloom" initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 1.5, 1.9], opacity: [0, 0.95, 0] }} transition={{ duration: 0.8, delay: 0.38, ease: "easeOut" }} />}
        </div>
        <div className="splash-word" aria-hidden>
          {WORD.map((ch, i) => (
            <span key={i} className="mask-word" style={{ margin: 0, padding: "0.08em 0.012em 0.18em" }}>
              <span className="mask-in" style={{ animationDelay: reduce ? "0s" : `${0.64 + i * 0.06}s` }}>{ch}</span>
            </span>
          ))}
        </div>
        <motion.div className="splash-rule" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.55, delay: reduce ? 0 : 1.0, ease: [0.2, 0.8, 0.2, 1] }} />
      </motion.div>
    </motion.div>
  );
}

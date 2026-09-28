import { motion } from "motion/react";

// The UpWise owl: two eyes glancing up-right (curious, looking ahead) and a small beak.
// Same geometry as the launcher icon (1024 box scaled to 88). Colours follow the theme tokens,
// so it matches light/dark and the wallpaper palette.
type Mood = "idle" | "happy";

const EYES = [31.8, 56.2];
const EYE_Y = 41.2, R = 11.7, PR = 5, PDX = 2.2, PDY = -2.6;
const BEAK = "M40.7 52.1 Q44 50.9 47.3 52.1 Q45.9 56.4 44 58.1 Q42.1 56.4 40.7 52.1 Z";

export function Owl({ size = 40, mood = "idle", blink = false, face = true }: { size?: number; mood?: Mood; blink?: boolean; face?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 88 88" aria-hidden>
      {face && <rect x="0" y="0" width="88" height="88" rx="26" fill="var(--primary)" />}
      {mood === "happy"
        ? EYES.map((x) => <path key={x} d={`M${x - R} ${EYE_Y + 3} Q${x} ${EYE_Y - R + 1} ${x + R} ${EYE_Y + 3}`} stroke="var(--owl-eye, #F4EFE6)" strokeWidth="5.5" strokeLinecap="round" fill="none" />)
        : EYES.map((x) => (
          <motion.g key={x} style={{ transformOrigin: `${x}px ${EYE_Y}px` }}
            animate={blink ? { scaleY: [1, 1, 0.12, 1] } : undefined}
            transition={blink ? { duration: 0.28, times: [0, 0.4, 0.6, 1], repeat: Infinity, repeatDelay: 4.2 } : undefined}>
            <circle cx={x} cy={EYE_Y} r={R} fill="var(--owl-eye, #F4EFE6)" />
            <circle cx={x + PDX} cy={EYE_Y + PDY} r={PR} fill="var(--owl-pupil, #153A2B)" />
            <circle cx={x + PDX - 1.7} cy={EYE_Y + PDY - 1.9} r="1.5" fill="var(--owl-eye, #F4EFE6)" />
          </motion.g>
        ))}
      <path d={BEAK} fill="var(--owl-beak, #E9A66B)" />
    </svg>
  );
}

/** Welcome/PIN screens: the owl pops in, then settles and blinks. */
export function BrandMark({ size = 88 }: { size?: number }) {
  return (
    <motion.div initial={{ scale: 0.6, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }} style={{ width: size, height: size }}>
      <Owl size={size} blink />
    </motion.div>
  );
}

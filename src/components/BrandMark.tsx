import { motion } from "motion/react";

// The app's arrow mark, drawing itself in — shared between Onboarding's welcome step and PinGate.
export function BrandMark({ size = 88 }: { size?: number }) {
  return (
    <motion.svg width={size} height={size} viewBox="0 0 88 88" fill="none" initial="hidden" animate="show">
      <motion.rect x="2" y="2" width="84" height="84" rx="26" fill="var(--primary-container)"
        variants={{ hidden: { scale: 0.6, opacity: 0 }, show: { scale: 1, opacity: 1, transition: { type: "spring", stiffness: 260, damping: 22 } } }} style={{ transformOrigin: "44px 44px" }} />
      <motion.path d="M30 58 L56 32" stroke="var(--on-primary-container)" strokeWidth="6" strokeLinecap="round"
        variants={{ hidden: { pathLength: 0, opacity: 0 }, show: { pathLength: 1, opacity: 1, transition: { delay: 0.08, duration: 0.3, ease: [0.05, 0.7, 0.1, 1] } } }} />
      <motion.path d="M40 31 L58 31 L58 49" stroke="var(--on-primary-container)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none"
        variants={{ hidden: { pathLength: 0, opacity: 0 }, show: { pathLength: 1, opacity: 1, transition: { delay: 0.24, duration: 0.22, ease: [0.05, 0.7, 0.1, 1] } } }} />
    </motion.svg>
  );
}

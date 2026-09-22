import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useAuth } from "../hooks/useAuth";
import { PIN_LENGTH } from "../lib/pin";
import { BrandMark } from "../components/BrandMark";
import { Spinner, easeOut, spring } from "../components/ui";
import { haptic } from "../lib/haptics";

const wordsIn = { hidden: {}, show: { transition: { staggerChildren: 0.03, delayChildren: 0 } } };
const word = { hidden: { opacity: 0, y: 18, filter: "blur(6px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.05, 0.7, 0.1, 1] as const } } };

export function PinGate() {
  const { unlock } = useAuth();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (pin.length !== PIN_LENGTH || busy) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      const ok = await unlock(pin);
      if (cancelled) return;
      setBusy(false);
      if (ok) {
        haptic.success();
      } else {
        haptic.warn();
        setPin("");
        setShake((s) => s + 1);
        inputRef.current?.focus();
      }
    })();
    return () => { cancelled = true; };
  }, [pin, busy, unlock]);

  return (
    <div className="onboard" style={{ overflow: "hidden" }}>
      <div className="onboard-body" style={{ alignItems: "center", textAlign: "center" }}>
        <BrandMark />
        <motion.h1 className="display" variants={wordsIn} initial="hidden" animate="show" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0 0.28em" }}>
          {"Enter your password".split(" ").map((w, i) => <motion.span key={i} variants={word}>{w}</motion.span>)}
        </motion.h1>
        <motion.p className="body-lg" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOut, delay: 0.15 }}>
          Just once — UpWise remembers you after this.
        </motion.p>

        <motion.button
          key={shake}
          type="button"
          aria-label="Enter your 5-digit password"
          onClick={() => inputRef.current?.focus()}
          className="row"
          style={{ gap: 14, justifyContent: "center", marginTop: 8 }}
          initial={shake ? false : { opacity: 0, y: 10 }}
          animate={shake ? { x: [0, -12, 12, -10, 10, -6, 6, 0] } : { opacity: 1, y: 0 }}
          transition={shake ? { duration: 0.4, ease: "easeInOut" } : { ...spring, delay: 0.2 }}
        >
          {Array.from({ length: PIN_LENGTH }).map((_, i) => {
            const filled = i < pin.length;
            return (
              <motion.span
                key={i}
                className="pin-dot"
                data-filled={filled}
                data-error={shake > 0 && pin.length === 0}
                animate={filled ? { scale: [0.4, 1.15, 1] } : { scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 22, mass: 0.7 }}
              />
            );
          })}
        </motion.button>

        <div style={{ height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {busy && <Spinner size={20} />}
        </div>

        <input
          ref={inputRef}
          value={pin}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH); if (v.length > pin.length) haptic.tap(); setPin(v); }}
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={PIN_LENGTH}
          disabled={busy}
          aria-hidden="true"
          style={{ position: "fixed", top: 0, left: 0, opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
        />
      </div>
    </div>
  );
}

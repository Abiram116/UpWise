import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { currentVersion } from "../lib/updater";
import { RELEASE_REPO } from "../lib/config";
import { haptic } from "../lib/haptics";
import { isTauri } from "../lib/platform";
import { BrandMark } from "./BrandMark";
import { Pill, spring, easeOut } from "./ui";

const SEEN_KEY = "upwise:lastSeenVersion";

// GitHub's auto-generated notes look like "* fix: thing by @user in <url>" (or similar) plus
// a "## What's Changed" heading and a "**Full Changelog**" footer — keep just the human part.
function extractNotes(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("*") || l.startsWith("-"))
    .map((l) => l.replace(/^[-*]\s*/, "").replace(/\s+by\s+@[\w-]+.*$/i, "").trim())
    .filter((l) => l.length > 0 && !/^full changelog/i.test(l))
    .slice(0, 6);
}

export function WhatsNewGate({ children }: { children: ReactNode }) {
  const [reveal, setReveal] = useState<{ version: string; notes: string[] } | null>(null);

  useEffect(() => {
    if (!isTauri) return;
    (async () => {
      try {
        const version = await currentVersion();
        let seen: string | null = null;
        try { seen = localStorage.getItem(SEEN_KEY); } catch { /* ignore */ }
        if (!seen) { try { localStorage.setItem(SEEN_KEY, version); } catch { /* ignore */ } return; } // first install ever — nothing to celebrate yet
        if (seen === version) return;
        const r = await fetch(`https://api.github.com/repos/${RELEASE_REPO}/releases/tags/v${version}`);
        if (!r.ok) { try { localStorage.setItem(SEEN_KEY, version); } catch { /* ignore */ } return; }
        const rel = await r.json();
        setReveal({ version, notes: extractNotes(rel.body ?? "") });
      } catch { /* non-critical, never block the app over this */ }
    })();
  }, []);

  const dismiss = () => {
    if (reveal) { try { localStorage.setItem(SEEN_KEY, reveal.version); } catch { /* ignore */ } }
    haptic.success();
    setReveal(null);
  };

  return (
    <>
      {children}
      <AnimatePresence>{reveal && <WhatsNewOverlay version={reveal.version} notes={reveal.notes} onDismiss={dismiss} />}</AnimatePresence>
    </>
  );
}

function WhatsNewOverlay({ version, notes, onDismiss }: { version: string; notes: string[]; onDismiss: () => void }) {
  useEffect(() => { haptic.tap(); }, []);
  return (
    <motion.div className="whatsnew-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <motion.div className="whatsnew-card" initial={{ opacity: 0, y: 32, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.97 }} transition={spring}>
        <BrandMark size={72} />
        <motion.h1 className="display" style={{ fontSize: 32 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOut, delay: 0.12 }}>
          What's new
        </motion.h1>
        <motion.p className="body-lg" style={{ color: "var(--primary)", fontWeight: 500 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...easeOut, delay: 0.2 }}>
          Updated to v{version}
        </motion.p>
        {notes.length > 0 && (
          <motion.ul className="whatsnew-list" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.32 } } }}>
            {notes.map((n, i) => (
              <motion.li key={i}
                variants={{ hidden: { opacity: 0, x: -16 }, show: { opacity: 1, x: 0 } }}
                transition={easeOut}
                onAnimationComplete={() => haptic.tap()}
              >
                {n}
              </motion.li>
            ))}
          </motion.ul>
        )}
        <Pill variant="filled" size="lg" style={{ marginTop: 8, width: "100%" }} onClick={onDismiss}>Let's go</Pill>
      </motion.div>
    </motion.div>
  );
}

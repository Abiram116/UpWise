import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell } from "lucide-react";
import { isPermissionGranted } from "@tauri-apps/plugin-notification";
import { currentVersion } from "../lib/updater";
import { RELEASE_REPO } from "../lib/config";
import { haptic } from "../lib/haptics";
import { isTauri } from "../lib/platform";
import { ensurePermission } from "../lib/notifications";
import { extractNotes } from "../lib/changelog";
import { BrandMark } from "./BrandMark";
import { Pill, spring, easeOut } from "./ui";

const SEEN_KEY = "upwise:lastSeenVersion";

export function WhatsNewGate({ children }: { children: ReactNode }) {
  const [reveal, setReveal] = useState<{ version: string; notes: string[] } | null>(null);
  const [needsNotifPermission, setNeedsNotifPermission] = useState(false);

  useEffect(() => {
    if (!isTauri) return;
    (async () => {
      try {
        const version = await currentVersion();
        let seen: string | null = null;
        try { seen = localStorage.getItem(SEEN_KEY); } catch { /* ignore */ }
        // This component only ever renders for an already-onboarded user (a fresh install
        // goes through Onboarding, a separate path) — so even the very first time this code
        // runs on a device, it's provably because of an update, never a first install. Always
        // show when the version doesn't match, including that first time.
        if (seen === version) return;
        const [relRes, granted] = await Promise.all([
          fetch(`https://api.github.com/repos/${RELEASE_REPO}/releases/tags/v${version}`),
          isPermissionGranted().catch(() => true),
        ]);
        setNeedsNotifPermission(!granted);
        if (!relRes.ok) { try { localStorage.setItem(SEEN_KEY, version); } catch { /* ignore */ } return; }
        const rel = await relRes.json();
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
      <AnimatePresence>
        {reveal && <WhatsNewOverlay version={reveal.version} notes={reveal.notes} needsNotifPermission={needsNotifPermission} onDismiss={dismiss} />}
      </AnimatePresence>
    </>
  );
}

function WhatsNewOverlay({ version, notes, needsNotifPermission, onDismiss }: {
  version: string; notes: string[]; needsNotifPermission: boolean; onDismiss: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [granted, setGranted] = useState(false);
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
        {needsNotifPermission && !granted && (
          <motion.div className="row" style={{ gap: 10, width: "100%", marginTop: 10, padding: "10px 12px", background: "var(--surface-mid)", borderRadius: 14, alignItems: "center" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...easeOut, delay: 0.4 }}>
            <Bell size={18} style={{ color: "var(--primary)", flexShrink: 0 }} />
            <span className="body" style={{ flex: 1, textAlign: "left" }}>Turn on nudges to hear about them</span>
            <Pill variant="tonal" size="sm" loading={asking} onClick={async () => { setAsking(true); const ok = await ensurePermission(); setAsking(false); setGranted(ok); if (ok) haptic.success(); }}>Enable</Pill>
          </motion.div>
        )}
        <Pill variant="filled" size="lg" style={{ marginTop: 8, width: "100%" }} onClick={onDismiss}>Let's go</Pill>
      </motion.div>
    </motion.div>
  );
}

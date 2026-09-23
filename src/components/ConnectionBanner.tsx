import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CloudOff, DatabaseZap } from "lucide-react";
import { recheckConnection, useConnection } from "../lib/connection";
import { BACKEND_DOWN, SUPABASE_DASHBOARD_URL } from "../lib/errors";
import { useOutboxCount } from "../lib/outbox";
import { openExternal } from "../lib/links";
import { pluralize } from "../lib/utils";
import { Pill, easeOut } from "./ui";

// The one place connectivity is talked about. Offline is normal on a phone, so it's a quiet
// line; a paused database needs you to act, so it gets a warm slab with the way out.
export function ConnectionBanner() {
  const status = useConnection();
  const pending = useOutboxCount();
  const [checking, setChecking] = useState(false);

  const retry = async () => {
    setChecking(true);
    try { await recheckConnection(); } finally { setChecking(false); }
  };

  const waiting = pending > 0 ? ` · ${pluralize(pending, "change")} waiting to sync` : "";

  return (
    <AnimatePresence initial={false}>
      {status === "offline" && (
        <motion.div key="offline" className="conn-line" role="status"
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={easeOut}>
          <CloudOff size={16} aria-hidden />
          <span>Offline — showing saved data{waiting}</span>
        </motion.div>
      )}
      {status === "backend" && (
        <motion.section key="backend" className="slab slab-warm conn-slab" role="alert"
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={easeOut}>
          <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <DatabaseZap size={20} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
            <div className="col" style={{ gap: 4 }}>
              <h2 className="title">{BACKEND_DOWN.title}</h2>
              <p className="body">{BACKEND_DOWN.message}{waiting && ` Your ${pluralize(pending, "change")} will sync then.`}</p>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
            <Pill variant="filled" size="sm" onClick={() => void openExternal(SUPABASE_DASHBOARD_URL)}>Open Supabase</Pill>
            <Pill variant="text" size="sm" loading={checking} onClick={retry} style={{ color: "inherit" }}>Check again</Pill>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

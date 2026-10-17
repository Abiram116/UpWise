import { motion } from "motion/react";
import { Flame, Minus, Moon, Shield, Snowflake } from "lucide-react";
import { FREEZE_BLOCK, FREEZE_REWARD, type DayState, type StreakState } from "../lib/stats";
import { pluralize } from "../lib/utils";
import { Sheet, spring } from "./ui";

// The streak, explained at a glance: how long it is, how much freeze cover you've banked (it
// spends itself automatically on missed days), how close the next +2 is, and the last 7 days.
const CELL: Record<DayState, { icon: typeof Flame; color: string; bg: string; label: string }> = {
  active: { icon: Flame, color: "#fff", bg: "linear-gradient(160deg,#FFB347,#FF6B4A)", label: "Learned" },
  frozen: { icon: Snowflake, color: "#fff", bg: "linear-gradient(160deg,#8FD6FF,#4FA6E8)", label: "Frozen" },
  missed: { icon: Minus, color: "var(--on-surface-3)", bg: "var(--surface-high)", label: "Missed" },
  break: { icon: Moon, color: "var(--on-surface-2)", bg: "var(--surface-mid)", label: "Break" },
  today: { icon: Flame, color: "var(--on-surface-3)", bg: "transparent", label: "Today" },
  future: { icon: Minus, color: "var(--on-surface-3)", bg: "transparent", label: "" },
};

export function StreakSheet({ open, onClose, s }: { open: boolean; onClose: () => void; s: StreakState }) {
  const filled = FREEZE_BLOCK - s.toNext;
  return (
    <Sheet open={open} onClose={onClose} title="Your streak">
      <div className="col" style={{ gap: 20 }}>
        <div className="row" style={{ gap: 14, alignItems: "flex-end" }}>
          <motion.div initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={spring} className="streak-flame" data-ice={s.onIce}>
            {s.onIce ? <Snowflake size={34} strokeWidth={2.2} /> : <Flame size={34} strokeWidth={2.2} fill="currentColor" />}
          </motion.div>
          <div className="col" style={{ gap: 0 }}>
            <span className="display num" style={{ fontSize: 56, lineHeight: 1 }}>{s.current}</span>
            <span className="meta">{s.onIce ? "on ice — learn today to thaw it" : s.doneToday ? "day streak · today's done" : s.current ? "day streak · learn today to keep it" : "start one today"}</span>
          </div>
        </div>

        <div className="slab slab-mid col" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <Shield size={20} style={{ color: s.bank ? "#4FA6E8" : "var(--on-surface-3)" }} />
            <div className="grow col" style={{ gap: 2 }}>
              <span className="title-sm">{s.bank ? `${pluralize(s.bank, "freeze day")} banked` : "No freeze days yet"}</span>
              <span className="meta">Miss a day and one is used automatically — your streak stays. Nothing to press.</span>
            </div>
          </div>
          <div className="col" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 6 }}>
              {Array.from({ length: FREEZE_BLOCK }, (_, i) => (
                <motion.i key={i} className="streak-seg" data-on={i < filled} initial={false} animate={{ scale: i === filled - 1 ? [1, 1.25, 1] : 1 }} transition={{ duration: 0.4 }} />
              ))}
            </div>
            <span className="meta">{s.toNext === 1 ? "1 more day" : `${s.toNext} more days`} in a row earns +{FREEZE_REWARD} freeze days</span>
          </div>
        </div>

        <div className="col" style={{ gap: 8 }}>
          <div className="row between">
            {s.week.map((d) => {
              const c = CELL[d.state]; const Icon = c.icon;
              return (
                <div key={d.day} className="col" style={{ gap: 6, alignItems: "center" }}>
                  <span className="streak-cell" data-state={d.state} style={{ background: c.bg, color: c.color }} title={c.label}><Icon size={18} strokeWidth={2.2} fill={d.state === "active" ? "currentColor" : "none"} /></span>
                  <span className="meta" style={{ fontSize: 11.5 }}>{new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: "narrow" })}</span>
                </div>
              );
            })}
          </div>
          <p className="meta">Best: <b className="num">{s.best}</b> days</p>
        </div>
      </div>
    </Sheet>
  );
}

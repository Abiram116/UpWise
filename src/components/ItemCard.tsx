import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { Check, Clapperboard, Film, Newspaper, Play } from "lucide-react";
import type { Item } from "../lib/types";
import { confidence, fmtMinutes, relativeTime } from "../lib/utils";
import { Dots, rise, spring } from "./ui";

export function ItemRow({ item, compact }: { item: Item; compact?: boolean }) {
  const nav = useNavigate();
  const Icon = item.source === "youtube" ? Film : item.source === "instagram" ? Clapperboard : Newspaper;
  const done = item.status === "completed";
  const trust = confidence(item);
  const tone = item.source === "youtube" ? "sage" : "warm";
  return (
    <motion.button variants={rise} className="rowitem" onClick={() => nav(`/item/${item.id}`)} whileTap={{ scale: 0.985 }} transition={spring}>
      <motion.div className="thumb" data-tone={item.thumbnail_url ? undefined : tone} layoutId={`thumb-${item.id}`} style={{ opacity: done ? 0.55 : 1 }}>
        {item.thumbnail_url ? <img src={item.thumbnail_url} alt="" loading="lazy" /> : <Icon size={22} strokeWidth={1.8} />}
      </motion.div>
      <div className="grow col" style={{ gap: 3 }}>
        <div className={compact ? "truncate" : "clamp-2"} style={{ fontSize: 15.5, lineHeight: 1.3, fontWeight: 500, color: done ? "var(--on-surface-3)" : "var(--on-surface)" }}>
          {item.title ?? item.url}
        </div>
        <div className="meta row wrap" style={{ gap: 8, rowGap: 2 }}>
          {item.category && <span>{item.category.name}</span>}
          {item.estimated_minutes != null && <span>{fmtMinutes(item.estimated_minutes)}</span>}
          <Dots n={item.relevance_score} />
          {!compact && <span>{relativeTime(item.created_at)}</span>}
          {trust && <span style={{ color: trust.tone === "error" ? "var(--error)" : "var(--warm)" }}>{trust.label}</span>}
        </div>
      </div>
      {item.status === "completed" && <span style={{ color: "var(--primary)" }}><Check size={18} strokeWidth={2.5} /></span>}
      {item.status === "in_progress" && <span style={{ color: "var(--primary)" }}><Play size={16} fill="currentColor" /></span>}
    </motion.button>
  );
}

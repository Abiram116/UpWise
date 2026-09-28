import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { Check, Clapperboard, Film, Image, Link2, Newspaper, Play, Smartphone } from "lucide-react";
import type { Item, ItemFormat } from "../lib/types";
import { FORMAT_LABEL, confidence, fmtMinutes, formatOf, relativeTime } from "../lib/utils";
import { rise, spring } from "./ui";

const ICONS: Record<ItemFormat, typeof Film> = { video: Film, short: Smartphone, reel: Clapperboard, post: Image, article: Newspaper, link: Link2 };

export function FormatIcon({ item, size = 18 }: { item: Item; size?: number }) {
  const Icon = ICONS[formatOf(item)];
  return <Icon size={size} strokeWidth={1.9} aria-hidden />;
}

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

export function ItemRow({ item, compact }: { item: Item; compact?: boolean }) {
  const nav = useNavigate();
  const format = formatOf(item);
  const done = item.status === "completed";
  const trust = confidence(item);
  return (
    <motion.button variants={rise} className="rowitem" onClick={() => nav(`/item/${item.id}`)} whileTap={{ scale: 0.985 }} transition={spring}>
      <motion.div className="thumb" data-tone={item.thumbnail_url ? undefined : format === "link" ? "warm" : "sage"} layoutId={`thumb-${item.id}`} style={{ opacity: done ? 0.55 : 1 }}>
        {item.thumbnail_url ? <img src={item.thumbnail_url} alt="" loading="lazy" decoding="async" /> : <FormatIcon item={item} size={22} />}
      </motion.div>
      <div className="grow col" style={{ gap: 3 }}>
        <div className={compact ? "truncate" : "clamp-2"} style={{ fontSize: 15.5, lineHeight: 1.3, fontWeight: 500, color: done ? "var(--on-surface-3)" : "var(--on-surface)" }}>
          {item.title ?? item.url}
        </div>
        <div className="meta row wrap" style={{ gap: 8, rowGap: 2 }}>
          <span className="row" style={{ gap: 4 }}><FormatIcon item={item} size={13} />{format === "link" ? host(item.url) || FORMAT_LABEL.link : FORMAT_LABEL[format]}</span>
          {item.estimated_minutes != null && format !== "link" && <span>{fmtMinutes(item.estimated_minutes)}</span>}
          {item.category && <span>{item.category.name}</span>}
          {!compact && <span>{relativeTime(item.created_at)}</span>}
          {trust && <span style={{ color: "var(--error)" }}>{trust.label}</span>}
        </div>
      </div>
      {done && <span style={{ color: "var(--primary)" }}><Check size={18} strokeWidth={2.5} /></span>}
      {item.status === "in_progress" && <span style={{ color: "var(--primary)" }}><Play size={16} fill="currentColor" /></span>}
    </motion.button>
  );
}

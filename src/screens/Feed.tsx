import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { BookOpen, Check, ChevronUp, ExternalLink, Play, SkipForward, Zap } from "lucide-react";
import { logManualMinutes, useActivity, useItems, useProfile, useSetStatus } from "../lib/api";
import { owlMoodFor, type CoachCtx } from "../lib/coach";
import { describeError } from "../lib/errors";
import { haptic } from "../lib/haptics";
import { openExternal } from "../lib/links";
import { startItem } from "../lib/startItem";
import { getPref, setPref } from "../lib/store";
import { breakDaySet, isOnBreak, streak, todayMinutes } from "../lib/stats";
import { FORMAT_LABEL, fmtMinutes, formatOf, isoDay, itemLink } from "../lib/utils";
import type { Item } from "../lib/types";
import { Owl } from "../components/BrandMark";
import { celebrateDone } from "../components/Celebrate";
import { FinishSheet } from "../components/FinishSheet";
import { FormatIcon } from "../components/ItemCard";
import { ItemThumb } from "../components/CoverArt";
import { useSessionStore } from "../components/SessionBar";
import { Pill, Skeleton, spring, useToast } from "../components/ui";

// Scroll through what you saved the way you scroll reels: one thing per screen, a one-line
// gist so you remember why you saved it, and the actions under your thumb. Quick things (shorts,
// reels, posts, anything ~5 min) come first, so a doomscroll habit becomes a learning one.

const PENDING = new Set(["inbox", "queued", "in_progress"]);
const est = (i: Item) => i.estimated_minutes ?? 10;
const isQuick = (i: Item) => ["short", "reel", "post"].includes(formatOf(i)) || est(i) <= 6;
const bucket = (i: Item) => (i.status === "in_progress" ? 0 : isQuick(i) ? 1 : est(i) <= 20 ? 2 : 3);

export function feedOrder(items: Item[]): Item[] {
  return items.filter((i) => PENDING.has(i.status)).sort((a, b) =>
    bucket(a) - bucket(b) || (b.relevance_score ?? 3) - (a.relevance_score ?? 3) || b.created_at.localeCompare(a.created_at));
}

type Mode = "all" | "quick" | "saved";

export function FeedScreen() {
  const items = useItems();
  const profile = useProfile();
  const activity = useActivity(400);
  const nav = useNavigate();
  const toast = useToast();
  const setStatus = useSetStatus();
  const start = useSessionStore((s) => s.start);
  const scroller = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<Mode>("all");
  const [asking, setAsking] = useState<Item | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hinted, setHinted] = useState(true);

  useEffect(() => { void getPref<Mode>("feedMode", "all").then(setMode); void getPref("feedHintSeen", false).then((v) => setHinted(v)); }, []);

  const all = useMemo(() => feedOrder(items.data ?? []), [items.data]);
  const quick = useMemo(() => all.filter(isQuick), [all]);
  // Things you saved to refer back to (reels, links, videos) — scrollable too, never in the study list.
  const saved = useMemo(() => (items.data ?? []).filter((i) => i.status === "saved" && formatOf(i) !== "note").sort((a, b) => b.created_at.localeCompare(a.created_at)), [items.data]);
  const noQuick = mode === "quick" && quick.length === 0 && all.length > 0;
  const list = mode === "saved" ? saved : mode === "quick" && !noQuick ? quick : all;
  const counts: Record<Mode, number> = { all: all.length, quick: quick.length, saved: saved.length };

  const ctx: CoachCtx | undefined = useMemo(() => {
    if (!items.data || !activity.data) return undefined;
    const lastActive = [...activity.data].reverse().find((d) => d.seconds > 0 || d.completed > 0)?.day;
    return {
      todayMinutes: todayMinutes(activity.data), target: profile.data?.daily_target_minutes ?? 30,
      streak: streak(activity.data, breakDaySet(profile.data?.settings)).current, finishedToday: items.data.filter((i) => i.completed_at && isoDay(new Date(i.completed_at)) === isoDay()).length,
      pendingCount: all.length, idleDays: lastActive ? Math.floor((Date.now() - new Date(lastActive).getTime()) / 86400e3) : null,
    };
  }, [items.data, activity.data, profile.data, all.length]);

  const pickMode = (m: Mode) => { setMode(m); void setPref("feedMode", m); scroller.current?.scrollTo({ top: 0 }); activeRef.current = 0; setActive(0); };

  // Which card is on screen: drives the counter and a soft tick every time one snaps into place.
  const onScroll = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const el = scroller.current;
      if (!el || !el.clientHeight) return;
      const i = Math.round(el.scrollTop / el.clientHeight);
      if (i !== activeRef.current) { activeRef.current = i; haptic.select(); setActive(i); if (i > 0 && !hinted) { setHinted(true); void setPref("feedHintSeen", true); } }
    });
  };

  const next = () => { const el = scroller.current; el?.scrollBy({ top: el.clientHeight, behavior: "smooth" }); };
  const fail = (what: string) => (e: unknown) => toast(`${what} — ${describeError(e).message}`);

  const begin = (it: Item) => startItem(it, start, toast);
  // Move on first, apply a beat later: the scroll stays smooth and the card you just left
  // leaves the list while you're already looking at the next one.
  const learned = async (it: Item, minutes: number) => {
    setBusy(it.id); haptic.success(); next();
    window.setTimeout(async () => {
      try {
        await logManualMinutes(it.id, minutes);
        await setStatus(it.id, "completed");
        celebrateDone(it.title, { quiet: true });
      } catch (e) { fail("Couldn't save that")(e); }
      finally { setBusy(null); }
    }, 420);
  };
  const skip = (it: Item) => {
    haptic.tap(); next();
    window.setTimeout(() => {
      setStatus(it.id, "skipped").then(
        () => toast("Skipped", { label: "Undo", onClick: () => void setStatus(it.id, "queued").catch(() => {}) }),
        fail("Couldn't skip it"));
    }, 420);
  };
  const onLearned = (it: Item) => (est(it) <= 10 ? learned(it, Math.max(1, Math.round(est(it)))) : setAsking(it));

  if (items.isPending) return <div className="feed-loading"><Skeleton h={380} r={32} /></div>;

  return (
    <>
      <div className="feed-top">
        <div className="row" style={{ gap: 10 }}>
          <Owl size={36} alive mood={owlMoodFor(ctx, { onBreak: isOnBreak(profile.data?.settings) })} />
          <div className="feed-seg" role="tablist" aria-label="What to scroll">
            {(["all", "quick", "saved"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} data-active={mode === m} onClick={() => { haptic.select(); pickMode(m); }}>
                {m === "quick" && <Zap size={13} strokeWidth={2.6} />}{m === "all" ? "To learn" : m === "quick" ? "Quick" : "Saved"}<span className="feed-seg-n num">{counts[m]}</span>
              </button>
            ))}
          </div>
        </div>
        {list.length > 0 && <span className="feed-count num">{Math.min(active + 1, list.length)} / {list.length}</span>}
      </div>

      <div className="feed" ref={scroller} onScroll={onScroll}>
        {noQuick && <p className="feed-note">Nothing quick right now — showing everything.</p>}
        {/* Windowed: only the card on screen and its neighbours are real; the rest are empty
            snap-points of the same height. DOM size, images and reconciliation stay constant
            however long the list gets. */}
        {list.map((it, i) => Math.abs(i - active) > 2 ? <section key={it.id} className="feed-card" aria-hidden /> : (
          <FeedCard key={it.id} item={it} near={Math.abs(i - active) <= 1} busy={busy === it.id} hint={i === 0 && !hinted && list.length > 1}
            reference={it.status === "saved"} onLearn={() => { haptic.success(); setStatus(it.id, "inbox").then(() => toast("Moved to To learn"), fail("Couldn't move it")); }}
            onOpen={() => nav(`/item/${it.id}`)} onStart={() => begin(it)} onLearned={() => onLearned(it)} onSkip={() => skip(it)} />
        ))}
        <section className="feed-card feed-end">
          <motion.div initial={{ scale: 0.7, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} transition={spring}>
            <Owl size={110} alive mood={list.length ? "idle" : "happy"} />
          </motion.div>
          <h2 className="headline">{list.length ? "That's everything for now." : mode === "saved" ? "Nothing saved yet." : "All caught up."}</h2>
          <p className="body" style={{ color: "var(--on-surface-2)", maxWidth: 300 }}>
            {list.length ? "Save a few more and they'll be waiting here." : "Nothing left to learn. Share something new from YouTube or Instagram."}
          </p>
          <Pill variant="tonal" size="lg" onClick={() => nav("/")}>Back to Today</Pill>
        </section>
      </div>

      <FinishSheet open={!!asking} onClose={() => setAsking(null)} onDone={async (m) => { const it = asking; setAsking(null); if (it) await learned(it, m); }} />
    </>
  );
}

function FeedCard({ item, near, busy, hint, reference, onLearn, onOpen, onStart, onLearned, onSkip }: {
  item: Item; near: boolean; busy: boolean; hint: boolean; reference: boolean; onLearn: () => void; onOpen: () => void; onStart: () => void; onLearned: () => void; onSkip: () => void;
}) {
  const format = formatOf(item);
  const tall = format === "short" || format === "reel";
  return (
    <section className="feed-card" data-busy={busy}>
      {near && item.thumbnail_url && <div className="feed-bg" style={{ backgroundImage: `url(${item.thumbnail_url})` }} />}
      {near && !item.thumbnail_url && <div className="feed-bg feed-bg-cover" />}
      <div className="feed-shade" />
      <button className="feed-media" onClick={onOpen} aria-label="Open details">
        <div className="feed-thumb" data-tall={tall} data-format={format}>
          {near && <ItemThumb item={item} />}
          {hint && (
            <span className="feed-hint">
              <span className="hint-bob"><ChevronUp size={18} /></span>
              Swipe up for the next
            </span>
          )}
        </div>
      </button>
      <div className="feed-info">
        <p className="feed-meta">
          <span className="row" style={{ gap: 5 }}><FormatIcon item={item} size={14} />{FORMAT_LABEL[format]}</span>
          {!reference && format !== "link" && <span>~{fmtMinutes(est(item))}</span>}
          {item.category?.name && <span>{item.category.name}</span>}
          {item.status === "in_progress" && <span className="feed-tag">In progress</span>}
        </p>
        <h2 className="feed-title clamp-3">{item.title ?? item.url}</h2>
        {item.ai?.summary && <p className="feed-gist clamp-2">{item.ai.summary}</p>}
        <div className="row" style={{ gap: 10, marginTop: 8 }}>
          {reference ? (
            <>
              <Pill variant="filled" size="lg" className="grow" onClick={() => void openExternal(itemLink(item))}><ExternalLink size={18} /> Open</Pill>
              <Pill variant="tonal" size="lg" icon aria-label="Move to To learn" onClick={onLearn}><BookOpen size={20} /></Pill>
            </>
          ) : (
            <>
              <Pill variant="filled" size="lg" className="grow" onClick={onStart}><Play size={18} fill="currentColor" /> {format === "topic" ? "Research" : "Start"}</Pill>
              <Pill variant="tonal" size="lg" icon aria-label="Learned it" onClick={onLearned} disabled={busy}><Check size={22} strokeWidth={2.6} /></Pill>
              <Pill variant="tonal" size="lg" icon aria-label="Skip" onClick={onSkip} disabled={busy}><SkipForward size={20} /></Pill>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

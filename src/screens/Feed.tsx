import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { BookOpen, Check, ChevronUp, ExternalLink, Play, SkipForward, Zap } from "lucide-react";
import { logManualMinutes, useActivity, useItems, useProfile, useSetStatus } from "../lib/api";
import { owlMoodFor, type CoachCtx } from "../lib/coach";
import { describeError } from "../lib/errors";
import { haptic } from "../lib/haptics";
import { openExternal } from "../lib/links";
import { startItem } from "../lib/startItem";
import { usePager } from "../lib/usePager";
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
  const counter = useRef<HTMLSpanElement>(null);
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

  const ctx: CoachCtx | undefined = useMemo(() => {
    if (!items.data || !activity.data) return undefined;
    const lastActive = [...activity.data].reverse().find((d) => d.seconds > 0 || d.completed > 0)?.day;
    return {
      todayMinutes: todayMinutes(activity.data), target: profile.data?.daily_target_minutes ?? 30,
      streak: streak(activity.data, breakDaySet(profile.data?.settings)).current, finishedToday: items.data.filter((i) => i.completed_at && isoDay(new Date(i.completed_at)) === isoDay()).length,
      pendingCount: all.length, idleDays: lastActive ? Math.floor((Date.now() - new Date(lastActive).getTime()) / 86400e3) : null,
    };
  }, [items.data, activity.data, profile.data, all.length]);

  // The pager owns the gesture; React only hears about it once a card has landed. Anything
  // that changes the list (learned / skipped) is queued until then, so the list never shifts
  // under a card that's still moving.
  const afterLand = useRef<(() => void) | null>(null);
  const activeId = useRef<string | null>(null);
  const idAt = (i: number) => list[i]?.id ?? "end";
  const writeCounter = (i: number) => {
    const text = counter.current?.firstChild; // the one text node React owns: update it in place
    if (text) text.nodeValue = `${Math.min(i + 1, list.length)}/${list.length}`;
  };
  const land = (i: number) => {
    if (i !== activeRef.current) {
      activeRef.current = i; activeId.current = idAt(i); haptic.select(); setActive(i);
      if (i > 0 && !hinted) { setHinted(true); void setPref("feedHintSeen", true); }
    }
    const job = afterLand.current; afterLand.current = null;
    if (job) window.setTimeout(job, 60);
  };
  const pager = usePager(list.length + 1, active, land, writeCounter);

  // The list changed (something learned, skipped or added): stay on the same card.
  useLayoutEffect(() => {
    const id = activeId.current;
    const idx = !id ? -1 : id === "end" ? list.length : list.findIndex((it) => it.id === id);
    const want = idx >= 0 ? idx : Math.min(activeRef.current, list.length);
    if (want !== activeRef.current) { activeRef.current = want; setActive(want); }
    activeId.current = idAt(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  const pickMode = (m: Mode) => { setMode(m); void setPref("feedMode", m); activeRef.current = 0; activeId.current = null; setActive(0); };

  // Laptop: arrow keys / j k move between cards.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowDown" || e.key === "j") pager.go(pager.current() + 1);
      else if (e.key === "ArrowUp" || e.key === "k") pager.go(pager.current() - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Decode the next few previews while you're still reading this one, so a card arriving never
  // has to decode or upload a big image in the middle of your swipe.
  const warmed = useRef(new Set<string>());
  useEffect(() => {
    for (let k = active - 1; k <= active + 3; k++) {
      const u = list[k]?.thumbnail_url;
      if (!u || warmed.current.has(u)) continue;
      warmed.current.add(u);
      const im = new Image(); im.decoding = "async"; im.src = u; void im.decode().catch(() => {});
    }
  }, [active, list]);

  const next = () => pager.go(activeRef.current + 1);
  const fail = (what: string) => (e: unknown) => toast(`${what} — ${describeError(e).message}`);

  const begin = (it: Item) => startItem(it, start, toast);
  // Move on first, apply a beat later: the scroll stays smooth and the card you just left
  // leaves the list while you're already looking at the next one.
  const learned = async (it: Item, minutes: number) => {
    setBusy(it.id); haptic.success();
    afterLand.current = async () => {
      try {
        await logManualMinutes(it.id, minutes);
        await setStatus(it.id, "completed");
        celebrateDone(it.title, { quiet: true });
      } catch (e) { fail("Couldn't save that")(e); }
      finally { setBusy(null); }
    };
    next();
  };
  const skip = (it: Item) => {
    haptic.tap();
    afterLand.current = () => {
      setStatus(it.id, "skipped").then(
        () => toast("Skipped", { label: "Undo", onClick: () => void setStatus(it.id, "queued").catch(() => {}) }),
        fail("Couldn't skip it"));
    };
    next();
  };
  const onLearned = (it: Item) => (est(it) <= 10 ? learned(it, Math.max(1, Math.round(est(it)))) : setAsking(it));

  if (items.isPending) return <div className="feed-loading"><Skeleton h={380} r={32} /></div>;

  return (
    <>
      <div className="feed-top">
        <div className="row" style={{ gap: 10, minWidth: 0 }}>
          <Owl size={36} alive mood={owlMoodFor(ctx, { onBreak: isOnBreak(profile.data?.settings) })} />
          <div className="feed-seg" role="tablist" aria-label="What to scroll">
            {(["all", "quick", "saved"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} data-active={mode === m} onClick={() => { haptic.select(); pickMode(m); }}>
                {m === "quick" && <Zap size={13} strokeWidth={2.6} />}{m === "all" ? "Learn" : m === "quick" ? "Quick" : "Saved"}
              </button>
            ))}
          </div>
        </div>
        {list.length > 0 && <span ref={counter} className="feed-count num">{`${Math.min(active + 1, list.length)}/${list.length}`}</span>}
      </div>

      <div className="feed" {...pager.bind}>
        {noQuick && <p className="feed-note">Nothing quick right now — showing everything.</p>}
        {/* Windowed: only the card on screen and its two neighbours each way exist at all. Each
            sits at its own slot (index × one screen); the track moves, the cards never do. */}
        <div className="feed-track" ref={pager.track}>
        {list.map((it, i) => Math.abs(i - active) > 2 ? null : (
          <FeedCard key={it.id} pos={i} item={it} near={Math.abs(i - active) <= 2} busy={busy === it.id} hint={i === 0 && !hinted && list.length > 1}
            reference={it.status === "saved"} onLearn={() => { haptic.success(); setStatus(it.id, "inbox").then(() => toast("Moved to To learn"), fail("Couldn't move it")); }}
            onOpen={() => nav(`/item/${it.id}`)} onStart={() => begin(it)} onLearned={() => onLearned(it)} onSkip={() => skip(it)} />
        ))}
        {Math.abs(list.length - active) <= 2 && <section className="feed-card feed-end" style={{ transform: `translate3d(0, ${list.length * 100}%, 0)` }}>
          <motion.div initial={{ scale: 0.7, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} transition={spring}>
            <Owl size={110} alive mood={list.length ? "idle" : "happy"} />
          </motion.div>
          <h2 className="headline">{list.length ? "That's everything for now." : mode === "saved" ? "Nothing saved yet." : "All caught up."}</h2>
          <p className="body" style={{ color: "var(--on-surface-2)", maxWidth: 300 }}>
            {list.length ? "Save a few more and they'll be waiting here." : "Nothing left to learn. Share something new from YouTube or Instagram."}
          </p>
          <Pill variant="tonal" size="lg" onClick={() => nav("/")}>Back to Today</Pill>
        </section>}
        </div>
      </div>

      <FinishSheet open={!!asking} onClose={() => setAsking(null)} onDone={async (m) => { const it = asking; setAsking(null); if (it) await learned(it, m); }} />
    </>
  );
}

/** The soft colour wash behind a card: the preview shrunk once to 24×42 and blurred there. */
function Ambient({ url }: { url: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let dead = false;
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    img.decode().then(() => {
      const cv = ref.current, ctx = cv?.getContext("2d");
      if (dead || !cv || !ctx) return;
      const { width: W, height: H } = cv;
      const k = Math.max(W / img.naturalWidth, H / img.naturalHeight); // cover
      const w = img.naturalWidth * k, h = img.naturalHeight * k;
      ctx.imageSmoothingQuality = "high";
      ctx.filter = "blur(1.5px) saturate(1.4) brightness(0.72)";
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      cv.dataset.ready = "true";
    }).catch(() => {});
    return () => { dead = true; };
  }, [url]);
  return <canvas ref={ref} className="feed-bg" width={24} height={42} aria-hidden />;
}

function FeedCard({ pos, item, near, busy, hint, reference, onLearn, onOpen, onStart, onLearned, onSkip }: {
  pos: number; item: Item; near: boolean; busy: boolean; hint: boolean; reference: boolean; onLearn: () => void; onOpen: () => void; onStart: () => void; onLearned: () => void; onSkip: () => void;
}) {
  const format = formatOf(item);
  const tall = format === "short" || format === "reel";
  return (
    <section className="feed-card" data-busy={busy} style={{ transform: `translate3d(0, ${pos * 100}%, 0)` }}>
      {near && item.thumbnail_url && <Ambient url={item.thumbnail_url} />}
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

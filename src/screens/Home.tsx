import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { Clock, Flame, Play } from "lucide-react";
import { useActivity, useItems, useProfile, useSessions } from "../lib/api";
import { loadOpens, bestSlot, fmtSlot } from "../lib/slot";
import { settingsOf } from "../lib/notifications";
import { heuristicPick, streak, todayMinutes, isOnBreak, breakDaySet } from "../lib/stats";
import { owlMoodFor, useCoach, useLocalLine, type CoachCtx } from "../lib/coach";
import { haptic } from "../lib/haptics";
import { FORMAT_LABEL, fmtMinutes, formatOf, isoDay } from "../lib/utils";
import type { Item } from "../lib/types";
import { ItemRow, FormatIcon } from "../components/ItemCard";
import { Owl } from "../components/BrandMark";
import { useSessionStore } from "../components/SessionBar";
import { ErrorState, Page, Pill, Rise, Skeleton, spring, stagger } from "../components/ui";

const TO_LEARN = new Set(["inbox", "queued", "in_progress"]);

function daysSince(iso: string) { return Math.floor((Date.now() - new Date(iso).getTime()) / 86400e3); }

export function HomeScreen() {
  const profile = useProfile();
  const items = useItems();
  const activity = useActivity(90);
  const nav = useNavigate();
  const startSession = useSessionStore((s) => s.start);
  const sessions = useSessions(30); // same query Background already runs
  const [opens, setOpens] = useState<number[]>([]);
  useEffect(() => { void loadOpens().then(setOpens); }, []);
  const [passed, setPassed] = useState<string[]>([]); // "Not now" — shuffles locally, no AI call

  const pending = useMemo(() => (items.data ?? []).filter((i) => TO_LEARN.has(i.status)), [items.data]);
  const pendingIds = useMemo(() => new Set(pending.map((i) => i.id)), [pending]);
  const onBreak = isOnBreak(profile.data?.settings);
  const target = profile.data?.daily_target_minutes ?? 30;
  const today = activity.data ? todayMinutes(activity.data) : 0;
  const st = activity.data ? streak(activity.data, breakDaySet(profile.data?.settings)).current : 0;

  const ctx: CoachCtx | undefined = useMemo(() => {
    if (!items.data || !activity.data) return undefined;
    const day = isoDay();
    const finished = items.data.filter((i) => i.completed_at && isoDay(new Date(i.completed_at)) === day)
      .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
    const lastActive = [...activity.data].reverse().find((d) => d.seconds > 0 || d.completed > 0)?.day;
    return {
      todayMinutes: today, target, streak: st, finishedToday: finished.length, lastFinishedTitle: finished[0]?.title ?? undefined,
      pendingCount: pending.length, idleDays: lastActive ? daysSince(lastActive) : null,
    };
  }, [items.data, activity.data, today, target, st, pending.length]);

  const { coach, refresh, loading } = useCoach(!onBreak, ctx, pendingIds);
  const pick: Item | null = useMemo(() => {
    const pool = pending.filter((i) => !passed.includes(i.id));
    const fromCoach = !passed.length && coach?.pick_item_id ? pool.find((i) => i.id === coach.pick_item_id) : null;
    return fromCoach ?? heuristicPick(pool.length ? pool : pending);
  }, [coach, pending, passed]);
  const nextUp = useMemo(() => {
    const ids = coach?.pick_item_id === pick?.id ? coach?.next_item_ids ?? [] : [];
    return ids.map((id) => pending.find((i) => i.id === id)).filter((i): i is Item => !!i);
  }, [coach, pick, pending]);

  // The study slot is learned from when you open the app and study — shown, never set. Only
  // while it's still ahead today, the goal isn't met, and notifications are on.
  const slot = useMemo(() => {
    const settings = settingsOf(profile.data);
    if (!settings.enabled || onBreak || !pick || today >= target || !sessions.data) return null;
    const sl = bestSlot(sessions.data, opens, settings);
    const now = new Date();
    return sl.hour * 60 + sl.minute > now.getHours() * 60 + now.getMinutes() ? sl : null;
  }, [profile.data, onBreak, pick, today, target, sessions.data, opens]);

  const localLine = useLocalLine(ctx, pick);
  const line = onBreak ? "On a break. Enjoy it — your streak's safe." : coach?.line || localLine;
  const continuing = pending.filter((i) => i.status === "in_progress" && i.id !== pick?.id);
  const recent = pending.filter((i) => i.status !== "in_progress" && i.id !== pick?.id).slice(0, 4);

  return (
    <Page>
      <header className="col" style={{ gap: 18 }}>
        <div className="row between">
          <motion.button className="owl-btn" aria-label="Say something else" whileTap={{ scale: 0.9, rotate: -6 }} transition={spring}
            onClick={() => { haptic.select(); void refresh(); }}>
            <Owl size={58} alive mood={owlMoodFor(ctx, { loading, onBreak })}
              speakKey={line} speakMs={Math.min(2600, 700 + line.length * 38)} />
          </motion.button>
          <div className="row" style={{ gap: 8 }}>
            {st > 0 && <span className="stat-pill" style={{ color: "var(--warm)" }}><Flame size={15} strokeWidth={2.4} /><b className="num">{st}</b></span>}
            {!onBreak && <GoalRing minutes={today} target={target} onClick={() => nav("/stats")} />}
          </div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1 key={line} className="display friend-line" data-long={line.length > 60}
            initial="hidden" animate="show" exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.035 } } }}>
            {line.split(" ").map((w, i) => (
              <motion.span key={i} style={{ display: "inline-block", marginRight: "0.26em" }}
                variants={{ hidden: { opacity: 0, y: 12, filter: "blur(5px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.42, ease: [0.05, 0.7, 0.1, 1] } } }}>{w}</motion.span>
            ))}
          </motion.h1>
        </AnimatePresence>
      </header>

      {!items.data && items.isError ? <ErrorState error={items.error} onRetry={() => items.refetch()} />
        : items.isPending ? <Skeleton h={260} r={28} />
        : pick ? (
          <Rise>
            <motion.section className="slab pick" layout transition={spring}>
              <button className="col" style={{ gap: 14, textAlign: "left", width: "100%" }} onClick={() => nav(`/item/${pick.id}`)}>
                {pick.thumbnail_url && <div className="thumb thumb-lg"><img src={pick.thumbnail_url} alt="" /></div>}
                <div className="col" style={{ gap: 8 }}>
                  <h2 className="headline focal clamp-3">{pick.title}</h2>
                  <p className="meta row wrap" style={{ gap: 10 }}>
                    <span className="row" style={{ gap: 5 }}><FormatIcon item={pick} size={15} /> {FORMAT_LABEL[formatOf(pick)]}</span>
                    {pick.estimated_minutes != null && <span>~{fmtMinutes(pick.estimated_minutes)}</span>}
                    {pick.category?.name && <span>{pick.category.name}</span>}
                  </p>
                  {pick.ai?.summary && <p className="body clamp-2" style={{ color: "var(--on-surface-2)" }}>{pick.ai.summary}</p>}
                </div>
              </button>
              {nextUp.length > 0 && (
                <div className="col" style={{ gap: 2, marginTop: 14 }}>
                  <p className="section-title">Then</p>
                  {nextUp.map((i) => (
                    <button key={i.id} className="row body" style={{ gap: 8, minHeight: 40, textAlign: "left" }} onClick={() => nav(`/item/${i.id}`)}>
                      <FormatIcon item={i} size={15} />
                      <span className="truncate grow">{i.title}</span>
                      {i.estimated_minutes != null && <span className="meta num">~{fmtMinutes(i.estimated_minutes)}</span>}
                    </button>
                  ))}
                </div>
              )}
              <div className="row" style={{ gap: 8, marginTop: 20 }}>
                <Pill variant="filled" size="lg" className="grow" onClick={async () => { await startSession(pick); nav(`/item/${pick.id}`); }}>
                  <Play size={18} fill="currentColor" /> Start
                </Pill>
                {pending.length > 1 && <Pill variant="text" size="lg" onClick={() => setPassed((p) => [...p, pick.id])}>Not now</Pill>}
              </div>
              {slot && (
                <p className="meta row" style={{ gap: 6, marginTop: 14 }}><Clock size={14} /> I'll nudge you around {fmtSlot(slot)}{slot.learned ? " — that's when you usually learn" : ""}</p>
              )}
            </motion.section>
          </Rise>
        ) : (
          <Rise><p className="body-lg" style={{ color: "var(--on-surface-2)" }}>Share a video, reel or article to UpWise from any app — or tap + to paste a link.</p></Rise>
        )}

      {continuing.length > 0 && <Section title="Continue" items={continuing} />}
      {recent.length > 0 && <Section title="Recently saved" items={recent} more={pending.length > 5 ? () => nav("/library") : undefined} />}
    </Page>
  );
}

/** Today's minutes against the goal, as a small ring — the whole "Today" panel in 36px. */
function GoalRing({ minutes, target, onClick }: { minutes: number; target: number; onClick: () => void }) {
  const pct = Math.min(1, minutes / Math.max(1, target));
  const C = 2 * Math.PI * 15;
  return (
    <button className="stat-pill" onClick={onClick} aria-label={`${minutes} of ${target} minutes today`}>
      <svg width="22" height="22" viewBox="0 0 36 36" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface-high)" strokeWidth="5" />
        <motion.circle cx="18" cy="18" r="15" fill="none" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - pct) }} transition={{ duration: 0.8, ease: [0.05, 0.7, 0.1, 1] }} />
      </svg>
      <span className="num"><b>{minutes}</b>/{target}m</span>
    </button>
  );
}

function Section({ title, items, more }: { title: string; items: Item[]; more?: () => void }) {
  return (
    <Rise>
      <section className="col" style={{ gap: 6 }}>
        <div className="row between" style={{ padding: "0 4px" }}>
          <span className="title-sm">{title}</span>
          {more && <button className="meta" style={{ color: "var(--primary)", fontWeight: 500 }} onClick={more}>See all</button>}
        </div>
        <motion.div className="rows" variants={stagger} initial="hidden" animate="show">
          {items.map((i) => <ItemRow key={i.id} item={i} compact />)}
        </motion.div>
      </section>
    </Rise>
  );
}

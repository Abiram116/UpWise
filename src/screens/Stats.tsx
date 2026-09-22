import { useEffect, useMemo, useState } from "react";
import { animate, motion } from "motion/react";
import { useActivity, useItems, useProfile, useSessions } from "../lib/api";
import { backlogHealth, byCategory, heatmap, streak, velocity, weekly } from "../lib/stats";
import { fmtMinutes, pluralize } from "../lib/utils";
import { Empty, ErrorState, Page, Rise, Skeleton, easeOut } from "../components/ui";

function Count({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const c = animate(0, to, { duration: 0.9, ease: [0.05, 0.7, 0.1, 1], onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [to]);
  return <span className="num">{v}{suffix}</span>;
}

export function StatsScreen() {
  const activity = useActivity(120);
  const items = useItems();
  const sessions = useSessions(120);
  const profile = useProfile();

  const data = useMemo(() => {
    if (!activity.data || !items.data || !sessions.data) return null;
    const weeks = weekly(activity.data, 8);
    return {
      heat: heatmap(activity.data, 12),
      streak: streak(activity.data),
      weeks,
      velocity: velocity(weeks),
      backlog: backlogHealth(items.data, weeks.slice(-4)),
      cats: byCategory(items.data, sessions.data),
      totalMinutes: Math.round(activity.data.reduce((a, d) => a + d.seconds, 0) / 60),
      totalDone: items.data.filter((i) => i.status === "completed").length,
      concepts: new Set(items.data.filter((i) => i.status === "completed").flatMap((i) => i.ai?.key_concepts ?? [])).size,
    };
  }, [activity.data, items.data, sessions.data]);

  if (activity.isError || items.isError) return <Page><h1 className="display">Progress</h1><ErrorState message={(activity.error ?? items.error)?.message ?? ""} onRetry={() => { activity.refetch(); items.refetch(); }} /></Page>;
  if (!data) return <Page><h1 className="display">Progress</h1><Skeleton h={120} r={28} /><Skeleton h={160} r={28} /></Page>;

  const maxMin = Math.max(1, ...data.weeks.map((w) => w.minutes));
  const target = profile.data?.daily_target_minutes ?? 30;
  const neglected = data.cats.filter((c) => c.neglectedDays != null && c.neglectedDays >= 14).sort((a, b) => (b.neglectedDays ?? 0) - (a.neglectedDays ?? 0));
  const trendWord = data.velocity.trend === "up" ? "up from" : data.velocity.trend === "down" ? "down from" : "level with";

  if (data.totalDone === 0 && data.totalMinutes === 0) {
    return <Page><Rise><h1 className="display">Progress</h1></Rise><Empty title="No data yet" body="Finish your first item and your progress starts here." /></Page>;
  }

  return (
    <Page>
      <Rise><header><h1 className="display">Progress</h1></header></Rise>

      {/* the numbers, as a sentence rather than tiles */}
      <Rise>
        <p className="headline" style={{ lineHeight: 1.3 }}>
          <span style={{ color: "var(--warm)" }}><Count to={data.streak.current} /></span>-day streak, best {data.streak.best}.<br />
          <Count to={data.totalDone} /> things learned, <Count to={data.concepts} /> concepts.<br />
          <span style={{ color: "var(--primary)" }}>{fmtMinutes(data.totalMinutes)}</span> invested.
        </p>
        <p className="body" style={{ marginTop: 10 }}>
          This week: {data.velocity.thisWeek} done, {trendWord} your usual {data.velocity.avgPrev}/week.
        </p>
      </Rise>

      <Rise>
        <section className="col" style={{ gap: 12 }}>
          <div className="row between"><p className="title-sm">Consistency</p><span className="meta">12 weeks · target {target} min/day</span></div>
          <motion.div className="heat" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.006 } } }}>
            {data.heat.map((c) => <motion.i key={c.day} data-l={c.level} title={`${c.day}: ${c.minutes} min, ${c.completed} done`} variants={{ hidden: { opacity: 0, scale: 0.6 }, show: { opacity: 1, scale: 1 } }} />)}
          </motion.div>
        </section>
      </Rise>

      <Rise>
        <section className="col" style={{ gap: 12 }}>
          <div className="row between"><p className="title-sm">Weekly</p><span className="meta">minutes · items done</span></div>
          <div className="bars">
            {data.weeks.map((w) => (
              <div key={w.label} title={`${w.label}: ${w.minutes} min, ${w.completed} done`}>
                <span className="meta num" style={{ color: w.isCurrent ? "var(--primary)" : undefined }}>{w.completed || ""}</span>
                <motion.div className="col-bar" data-now={w.isCurrent} initial={{ height: 0 }} animate={{ height: `${Math.max(5, (w.minutes / maxMin) * 100)}%` }} transition={{ ...easeOut, duration: 0.6 }} />
              </div>
            ))}
          </div>
          <div className="row between meta"><span>{data.weeks[0].label}</span><span>this week</span></div>
        </section>
      </Rise>

      <Rise>
        <section className="slab col" style={{ gap: 6 }}>
          <p className="title-sm">Backlog</p>
          <p className="body-lg" style={{ color: "var(--on-surface)" }}>
            {pluralize(data.backlog.pending, "item")} waiting, about {fmtMinutes(data.backlog.pendingMinutes)}.
          </p>
          <p className="body">
            You save {data.backlog.savedPerWeek} a week and finish {data.backlog.donePerWeek}.{" "}
            <span style={{ color: data.backlog.growing ? "var(--warm)" : "var(--primary)" }}>
              {data.backlog.growing ? "It's growing — finish before saving more." : data.backlog.weeksToClear ? `Clears in about ${pluralize(data.backlog.weeksToClear, "week")}.` : ""}
            </span>
          </p>
        </section>
      </Rise>

      <Rise>
        <section className="col" style={{ gap: 14 }}>
          <p className="title-sm">By area</p>
          {data.cats.map((c) => {
            const total = c.completed + c.pending;
            const pct = total ? (c.completed / total) * 100 : 0;
            return (
              <div key={c.id} className="col" style={{ gap: 6 }}>
                <div className="row between">
                  <span style={{ fontWeight: 500 }}>{c.name}</span>
                  <span className="meta num">{c.completed}/{total} · {fmtMinutes(c.minutes)}</span>
                </div>
                <div className="bar"><motion.i initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ ...easeOut, duration: 0.6 }} /></div>
              </div>
            );
          })}
          {neglected.length > 0 && (
            <p className="meta" style={{ color: "var(--warm)" }}>
              Neglected: {neglected.slice(0, 3).map((c) => `${c.name} (${c.neglectedDays === 999 ? "never" : `${c.neglectedDays}d`})`).join(", ")}
            </p>
          )}
        </section>
      </Rise>
    </Page>
  );
}

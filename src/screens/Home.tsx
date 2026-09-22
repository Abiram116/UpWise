import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { Flame, Play, RefreshCw } from "lucide-react";
import { fetchCoach, useActivity, useItems, useProfile } from "../lib/api";
import { heuristicPick, streak, todayMinutes, backlogHealth, weekly } from "../lib/stats";
import { getPref, setPref } from "../lib/store";
import { COACH_TTL_MS } from "../lib/config";
import { fmtMinutes, greeting, pluralize } from "../lib/utils";
import type { CoachResult, Item } from "../lib/types";
import { ItemRow } from "../components/ItemCard";
import { useSessionStore } from "../components/SessionBar";
import { Dots, Empty, ErrorState, Page, Pill, Rise, Skeleton, easeOut, spring, stagger, useToast } from "../components/ui";

export function useCoach(enabled: boolean) {
  const [cached, setCached] = useState<CoachResult | null | undefined>(undefined);
  useEffect(() => { getPref<CoachResult | null>("coach", null).then(setCached); }, []);
  const stale = !cached || Date.now() - (cached.fetched_at ?? 0) > COACH_TTL_MS;
  const q = useQuery({
    queryKey: ["coach"],
    queryFn: async () => { const c = await fetchCoach(); await setPref("coach", c); return c; },
    enabled: enabled && cached !== undefined && stale,
    staleTime: COACH_TTL_MS,
    retry: 1,
  });
  return { coach: q.data ?? cached ?? null, refresh: async () => { const c = await q.refetch(); if (c.data) await setPref("coach", c.data); }, loading: q.isFetching };
}

export function HomeScreen() {
  const profile = useProfile();
  const items = useItems();
  const activity = useActivity(90);
  const nav = useNavigate();
  const toast = useToast();
  const startSession = useSessionStore((s) => s.start);

  const pending = useMemo(() => (items.data ?? []).filter((i) => i.status === "inbox" || i.status === "queued" || i.status === "in_progress"), [items.data]);
  const { coach, refresh, loading: coachLoading } = useCoach(pending.length > 0);
  const pick: Item | null = useMemo(() => {
    const fromCoach = coach?.pick_item_id ? pending.find((i) => i.id === coach.pick_item_id) : null;
    return fromCoach ?? heuristicPick(items.data ?? []);
  }, [coach, pending, items.data]);
  const coached = !!(coach && pick && coach.pick_item_id === pick.id);

  const st = activity.data ? streak(activity.data) : null;
  const today = activity.data ? todayMinutes(activity.data) : 0;
  const target = profile.data?.daily_target_minutes ?? 30;
  const health = items.data && activity.data ? backlogHealth(items.data, weekly(activity.data, 4)) : null;
  const inbox = (items.data ?? []).filter((i) => i.status === "inbox");
  const inProgress = (items.data ?? []).filter((i) => i.status === "in_progress");
  const name = profile.data?.display_name?.split(" ")[0];

  return (
    <Page>
      <Rise>
        <header>
          <p className="meta row" style={{ gap: 10 }}>
            <span>{greeting()}{name ? `, ${name}` : ""}</span>
            {st && st.current > 0 && (
              <span className="row" style={{ gap: 4, color: "var(--warm)" }}><Flame size={14} strokeWidth={2.4} /> <b className="num">{st.current}</b>-day streak</span>
            )}
          </p>
          <h1 className="display">{coached ? coach!.headline : pick ? "Up next" : "All clear"}</h1>
        </header>
      </Rise>

      {items.isError ? <ErrorState message={items.error.message} onRetry={() => items.refetch()} /> : items.isLoading ? <Skeleton h={220} r={28} /> : pick ? (
        <Rise>
          <motion.section className="slab" layout transition={spring}>
            <button className="grow" style={{ textAlign: "left", width: "100%" }} onClick={() => nav(`/item/${pick.id}`)}>
              <h2 className="headline focal">{pick.title}</h2>
              <p className="meta row wrap" style={{ gap: 10, marginTop: 10 }}>
                {pick.category?.name && <span>{pick.category.name}</span>}
                {pick.estimated_minutes != null && <span>~{fmtMinutes(pick.estimated_minutes)}</span>}
                <Dots n={pick.relevance_score} />
              </p>
              {(coached ? coach!.message : pick.ai?.why_it_matters) && (
                <p className="body-lg" style={{ marginTop: 14 }}>{coached ? coach!.message : pick.ai?.why_it_matters}</p>
              )}
            </button>
            <div className="row" style={{ gap: 8, marginTop: 22 }}>
              <Pill variant="filled" size="lg" onClick={async () => { await startSession(pick); nav(`/item/${pick.id}`); }}>
                <Play size={18} fill="currentColor" /> Start
              </Pill>
              <Pill variant="text" size="lg" onClick={() => nav(`/item/${pick.id}`)}>Details</Pill>
              <span className="grow" />
              <button aria-label="Ask the coach again" className="pill pill-text pill-icon" onClick={async () => { await refresh(); toast("Coach refreshed"); }}>
                <RefreshCw size={17} style={{ animation: coachLoading ? "spin 0.8s linear infinite" : undefined }} />
              </button>
            </div>
          </motion.section>
        </Rise>
      ) : (
        <Rise><Empty title="Nothing waiting" body="Share a video from YouTube or paste a link. UpWise reads it and tells you whether it's worth your time." /></Rise>
      )}

      <Rise>
        <div className="col" style={{ gap: 10 }}>
          <div className="row between">
            <span className="title-sm">Today</span>
            <span className="meta num"><b style={{ color: "var(--on-surface)", fontWeight: 500 }}>{today}</b> / {target} min</span>
          </div>
          <div className="bar">
            <motion.i initial={{ width: 0 }} animate={{ width: `${Math.min(100, (today / target) * 100)}%` }} transition={{ ...easeOut, duration: 0.7 }}
              style={{ background: today >= target ? "var(--primary)" : undefined }} />
          </div>
          {health && health.pending > 0 && (
            <p className="meta">
              {pluralize(health.pending, "item")} · ~{fmtMinutes(health.pendingMinutes)} waiting.{" "}
              {health.growing
                ? <span style={{ color: "var(--warm)" }}>Saving {health.savedPerWeek}/wk, finishing {health.donePerWeek}/wk — it's growing.</span>
                : health.weeksToClear ? `Clears in ~${pluralize(health.weeksToClear, "week")} at this pace.` : ""}
            </p>
          )}
        </div>
      </Rise>

      {inProgress.length > 0 && <Section title="In progress" items={inProgress} />}
      {inbox.length > 0 && <Section title="New" items={inbox.slice(0, 6)} more={inbox.length > 6 ? () => nav("/library") : undefined} />}
    </Page>
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

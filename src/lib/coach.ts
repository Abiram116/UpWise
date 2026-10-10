import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCoach } from "./api";
import { getPref, setPref } from "./store";
import { useConnection } from "./connection";
import type { CoachResult, Item } from "./types";
import type { OwlMood } from "../components/BrandMark";

// The Today line reacts to your situation instead of a timer: it's regenerated only when
// something meaningful changed (new part of the day, finished something, hit the goal, saved
// something, came back after days away). That keeps it alive and costs a handful of calls a day.

export interface CoachCtx {
  todayMinutes: number;
  target: number;
  streak: number;
  finishedToday: number;
  lastFinishedTitle?: string;
  pendingCount: number;
  idleDays: number | null;
}

const MEMORY_KEY = "coachMemory";
const MIN_GAP_MS = 45_000;
let lastCallAt = 0;

export const partOfDay = (h = new Date().getHours()) => (h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 22 ? "evening" : "night");

export function situationSig(c: CoachCtx): string {
  return [new Date().toDateString(), partOfDay(), c.todayMinutes >= c.target ? 1 : 0, c.finishedToday, c.pendingCount].join("|");
}

/** What changed since the line on screen was written — told to the model as "just happened". */
function eventBetween(prevSig: string | undefined, c: CoachCtx): string | undefined {
  if (!prevSig) return c.idleDays != null && c.idleDays >= 3 ? `came back after ${c.idleDays} days away` : undefined;
  const [day, , goal, finished, pending] = prevSig.split("|");
  if (day !== new Date().toDateString()) return c.idleDays != null && c.idleDays >= 3 ? `came back after ${c.idleDays} days away` : "a new day started";
  if (goal === "0" && c.todayMinutes >= c.target) return "just hit today's goal";
  if (Number(finished) < c.finishedToday) return `just finished "${c.lastFinishedTitle ?? "something"}"`;
  if (Number(pending) < c.pendingCount) return "just saved something new";
  return undefined;
}

/** Short-term memory: what was said recently (Today lines and cheers), so nothing repeats. */
export async function remember(line: string) {
  if (!line) return;
  const m = await getPref<string[]>(MEMORY_KEY, []);
  await setPref(MEMORY_KEY, [line, ...m.filter((x) => x !== line)].slice(0, 10));
}
export const recentLines = () => getPref<string[]>(MEMORY_KEY, []);

export function useCoach(enabled: boolean, ctx?: CoachCtx, pendingIds?: Set<string>) {
  const [cached, setCached] = useState<CoachResult | null | undefined>(undefined);
  useEffect(() => { getPref<CoachResult | null>("coach", null).then(setCached); }, []);
  const conn = useConnection(); // re-evaluate "enabled" when the connection comes back, not just on data changes
  const sig = ctx ? situationSig(ctx) : "";
  const pickGone = !!cached?.pick_item_id && !!pendingIds && !pendingIds.has(cached.pick_item_id);
  const due = !!ctx && (cached?.sig !== sig || pickGone || !cached?.line);

  const q = useQuery({
    queryKey: ["coach", sig],
    queryFn: async () => {
      const wait = lastCallAt + MIN_GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastCallAt = Date.now();
      const c = await fetchCoach({
        previousPickId: cached?.pick_item_id, todayMinutes: ctx!.todayMinutes, streak: ctx!.streak,
        event: eventBetween(cached?.sig, ctx!), recentLines: await recentLines(),
      });
      const withSig = { ...c, sig };
      await setPref("coach", withSig);
      if (c.line) await remember(c.line);
      setCached(withSig);
      return withSig;
    },
    enabled: enabled && cached !== undefined && due && conn === "ok",
    staleTime: Infinity,
    retry: 0,
    meta: { persist: false },
  });

  const coach = q.data ?? cached ?? null;
  return { coach, loading: q.isFetching, refresh: () => q.refetch() };
}

/** Offline / before the first AI line: still sounds like a friend, still fits the moment. */
export function useLocalLine(ctx: CoachCtx | undefined, pick: Item | null): string {
  return useMemo(() => {
    if (!ctx) return "";
    const part = partOfDay();
    const pools: string[] =
      ctx.pendingCount === 0 ? ["Nothing waiting. Go find something that makes you curious.", "List's empty — dangerous amount of free time."]
      : ctx.todayMinutes >= ctx.target ? ["Goal's done. Anything else today is pure bonus.", "You already did the thing today. Rest is allowed."]
      : ctx.idleDays != null && ctx.idleDays >= 3 ? ["Look who's back. Start tiny — five minutes counts.", "Missed you. Something short to warm up?"]
      : part === "night" ? ["Late one. Keep it short, then sleep.", "One small thing, then bed."]
      : part === "morning" ? [`Morning. ${pick ? "One good thing before the day gets loud?" : "Fresh start."}`, "Early brain is the good brain — use it."]
      : ctx.streak > 1 ? [`${ctx.streak} days in a row. Let's not break it now.`, `Streak's at ${ctx.streak}. Keep it rolling?`]
      : ["Got a few minutes? This one's worth it.", "Small step today beats a big plan tomorrow."];
    // Stable for the day/part so it doesn't flicker between renders.
    const seed = [...`${new Date().toDateString()}${part}`].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    return pools[seed % pools.length];
  }, [ctx, pick]);
}

/** How the owl feels, from what's actually going on — shared by Today and the feed. */
export function owlMoodFor(c: CoachCtx | undefined, o: { loading?: boolean; onBreak?: boolean } = {}): OwlMood {
  if (o.loading) return "think";
  if (o.onBreak) return "sleepy";
  if (!c) return "idle";
  if (c.todayMinutes >= c.target) return "happy";
  if ((c.idleDays ?? 0) >= 4) return "sleepy";
  // Past 5 pm with nothing learned yet and things waiting: it sits there, watching you.
  if (c.todayMinutes === 0 && c.pendingCount > 0 && new Date().getHours() >= 17) return "waiting";
  return "idle";
}

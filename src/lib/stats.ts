import type { DailyActivity, Item, LearningSession } from "./types";
import { isoDay, pluralize } from "./utils";

export interface HeatCell { day: string; level: 0 | 1 | 2 | 3 | 4; minutes: number; completed: number }

export function heatmap(activity: DailyActivity[], weeks = 12): HeatCell[] {
  const byDay = new Map(activity.map((a) => [a.day, a]));
  const today = new Date();
  // start on the Monday `weeks` ago so columns are full weeks
  const start = new Date(today);
  start.setDate(today.getDate() - (weeks * 7 - 1) - ((today.getDay() + 6) % 7));
  const cells: HeatCell[] = [];
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const key = isoDay(d);
    const a = byDay.get(key);
    const minutes = a ? Math.round(a.seconds / 60) : 0;
    const completed = a?.completed ?? 0;
    const score = minutes + completed * 10;
    const level = score === 0 ? 0 : score < 10 ? 1 : score < 25 ? 2 : score < 50 ? 3 : 4;
    cells.push({ day: key, level, minutes, completed });
  }
  return cells;
}

export function streak(activity: DailyActivity[]): { current: number; best: number } {
  const active = new Set(activity.filter((a) => a.seconds > 0 || a.completed > 0).map((a) => a.day));
  let current = 0;
  const d = new Date();
  if (!active.has(isoDay(d))) d.setDate(d.getDate() - 1); // today not yet counted, streak still alive from yesterday
  while (active.has(isoDay(d))) { current++; d.setDate(d.getDate() - 1); }

  let best = 0, run = 0, prev: Date | null = null;
  for (const day of [...active].sort()) {
    const cur = new Date(day);
    run = prev && cur.getTime() - prev.getTime() === 86400e3 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = cur;
  }
  return { current, best: Math.max(best, current) };
}

export interface WeekStat { label: string; minutes: number; completed: number; added: number; isCurrent: boolean }

export function weekly(activity: DailyActivity[], weeks = 8): WeekStat[] {
  const out: WeekStat[] = [];
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  for (let w = weeks - 1; w >= 0; w--) {
    const s = new Date(monday); s.setDate(monday.getDate() - w * 7);
    const e = new Date(s); e.setDate(s.getDate() + 7);
    const sk = isoDay(s), ek = isoDay(e);
    const rows = activity.filter((a) => a.day >= sk && a.day < ek);
    out.push({
      label: s.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      minutes: Math.round(rows.reduce((a, r) => a + r.seconds, 0) / 60),
      completed: rows.reduce((a, r) => a + r.completed, 0),
      added: rows.reduce((a, r) => a + r.added, 0),
      isCurrent: w === 0,
    });
  }
  return out;
}

export function velocity(weeks: WeekStat[]): { thisWeek: number; avgPrev: number; trend: "up" | "down" | "flat" } {
  const cur = weeks[weeks.length - 1];
  const prev = weeks.slice(-4, -1);
  const avgPrev = prev.length ? prev.reduce((a, w) => a + w.completed, 0) / prev.length : 0;
  const thisWeek = cur?.completed ?? 0;
  const trend = thisWeek > avgPrev + 0.5 ? "up" : thisWeek < avgPrev - 0.5 ? "down" : "flat";
  return { thisWeek, avgPrev: Math.round(avgPrev * 10) / 10, trend };
}

export function backlogHealth(items: Item[], weeks: WeekStat[]) {
  const pending = items.filter((i) => i.status === "inbox" || i.status === "queued" || i.status === "in_progress");
  const pendingMinutes = pending.reduce((a, i) => a + (i.estimated_minutes ?? 10), 0);
  const last4 = weeks.slice(-4);
  const savedPerWeek = last4.reduce((a, w) => a + w.added, 0) / Math.max(1, last4.length);
  const donePerWeek = last4.reduce((a, w) => a + w.completed, 0) / Math.max(1, last4.length);
  const net = donePerWeek - savedPerWeek;
  const weeksToClear = donePerWeek > 0 ? Math.ceil(pending.length / donePerWeek) : null;
  return {
    pending: pending.length,
    pendingMinutes,
    savedPerWeek: Math.round(savedPerWeek * 10) / 10,
    donePerWeek: Math.round(donePerWeek * 10) / 10,
    growing: net < 0,
    weeksToClear,
  };
}

export interface CategoryStat { id: string; name: string; completed: number; pending: number; minutes: number; lastDone: string | null; neglectedDays: number | null }

export function byCategory(items: Item[], sessions: LearningSession[]): CategoryStat[] {
  const secondsByItem = new Map<string, number>();
  for (const s of sessions) if (s.item_id) secondsByItem.set(s.item_id, (secondsByItem.get(s.item_id) ?? 0) + s.seconds);
  const map = new Map<string, CategoryStat>();
  for (const i of items) {
    const key = i.category?.id ?? "none";
    const name = i.category?.name ?? "Uncategorized";
    const c = map.get(key) ?? { id: key, name, completed: 0, pending: 0, minutes: 0, lastDone: null, neglectedDays: null };
    if (i.status === "completed") {
      c.completed++;
      if (!c.lastDone || (i.completed_at && i.completed_at > c.lastDone)) c.lastDone = i.completed_at;
    } else if (i.status !== "skipped") c.pending++;
    c.minutes += Math.round((secondsByItem.get(i.id) ?? 0) / 60);
    map.set(key, c);
  }
  for (const c of map.values()) {
    if (c.pending > 0) {
      c.neglectedDays = c.lastDone ? Math.floor((Date.now() - new Date(c.lastDone).getTime()) / 86400e3) : 999;
    }
  }
  return [...map.values()].sort((a, b) => b.completed + b.pending - (a.completed + a.pending));
}

export interface SkillGroup { category: string; completed: number; minutes: number; concepts: string[] }

/** Completed items grouped by category with deduplicated AI-extracted concepts — the raw material for a resume/portfolio export. */
export function skillsSummary(items: Item[], sessions: LearningSession[]): SkillGroup[] {
  const secondsByItem = new Map<string, number>();
  for (const s of sessions) if (s.item_id) secondsByItem.set(s.item_id, (secondsByItem.get(s.item_id) ?? 0) + s.seconds);
  const map = new Map<string, SkillGroup>();
  for (const i of items) {
    if (i.status !== "completed") continue;
    const name = i.category?.name ?? "Uncategorized";
    const g = map.get(name) ?? { category: name, completed: 0, minutes: 0, concepts: [] };
    g.completed++;
    g.minutes += Math.round((secondsByItem.get(i.id) ?? 0) / 60);
    for (const c of i.ai?.key_concepts ?? []) {
      const norm = c.trim();
      if (norm && !g.concepts.some((x) => x.toLowerCase() === norm.toLowerCase())) g.concepts.push(norm);
    }
    map.set(name, g);
  }
  return [...map.values()].sort((a, b) => b.completed - a.completed);
}

export function formatSkillsExport(groups: SkillGroup[], goal: string, name?: string | null): string {
  const header = `${name ? `${name} — ` : ""}${goal} Learning Summary\nGenerated ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`;
  if (!groups.length) return `${header}\n\nNothing completed yet.`;
  const body = groups.map((g) => {
    const time = g.minutes >= 60 ? `${(g.minutes / 60).toFixed(1)}h` : `${g.minutes}min`;
    const concepts = g.concepts.length ? `\nKey concepts: ${g.concepts.join(", ")}` : "";
    return `${g.category} (${pluralize(g.completed, "item")} completed, ${time})${concepts}`;
  }).join("\n\n");
  return `${header}\n\n${body}`;
}

export function todayMinutes(activity: DailyActivity[]): number {
  const t = activity.find((a) => a.day === isoDay());
  return t ? Math.round(t.seconds / 60) : 0;
}

/** Hours (0-23) when the user actually learns, from session history. */
export function activeHours(sessions: LearningSession[]): number[] {
  const hist = new Array<number>(24).fill(0);
  for (const s of sessions) hist[new Date(s.started_at).getHours()] += Math.max(1, s.seconds / 60);
  return hist.map((v, h) => ({ v, h })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).map((x) => x.h);
}

/** Heuristic pick when the coach hasn't answered yet. */
export function heuristicPick(items: Item[], availableMinutes?: number): Item | null {
  const pool = items.filter((i) => i.status === "inbox" || i.status === "queued" || i.status === "in_progress");
  if (!pool.length) return null;
  const score = (i: Item) => {
    let s = (i.relevance_score ?? 3) * 10;
    if (i.status === "in_progress") s += 15;
    if (i.status === "queued") s += 5;
    const est = i.estimated_minutes ?? 10;
    if (availableMinutes) s += est <= availableMinutes ? 10 : -20;
    else s += est <= 15 ? 5 : 0;
    const ageDays = (Date.now() - new Date(i.created_at).getTime()) / 86400e3;
    s += Math.min(ageDays, 14) * 0.5;
    return s;
  };
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}

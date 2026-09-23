import {
  cancelAll, createChannel, Importance, isPermissionGranted, registerActionTypes, requestPermission,
  Schedule, sendNotification as send, Visibility, type Options,
} from "@tauri-apps/plugin-notification";
import { isAndroid, isMobile, isTauri } from "./platform";
import { activeHours, breakDaySet, heuristicPick, isOnBreak, streak, todayMinutes, weekly } from "./stats";
import { logNotification } from "./api";
import { fmtMinutes, pluralize } from "./utils";
import type { CoachResult, DailyActivity, Item, LearningSession, NotificationSettings, Profile } from "./types";
import { DEFAULT_NOTIFICATIONS } from "./config";

// Smart notifications: one on/off switch, everything else decided from your own data.
//
//   morning plan     — what to learn today (coach's pick + what follows), around when you start your day
//   waiting too long — an item saved 10+ days ago you haven't touched: do it / tomorrow / skip it
//   pick up again    — something you started and left for a day or more
//   evening goal     — only when today's goal isn't met yet, at the hour you usually learn
//   weekly recap     — Sunday evening
//
// Silent on a break. After 4 quiet days only a gentle morning nudge; after 2 weeks away, only
// the weekly recap. Wins (goal reached, streaks) are celebrated in the app, never pushed.

const CHANNEL = "upwise-nudges";
let desktopTimers: number[] = [];

/** Action groups. "start" opens the app; "later"/"tomorrow"/"skip" are handled and the app
 * goes straight back to the background (Android can only deliver actions by opening it). */
export const ACTIONS = { plan: "upwise-plan", stale: "upwise-stale", resume: "upwise-resume" } as const;
const LEGACY_ACTIONS = "nudge-actions"; // notifications scheduled by older versions

// Android draws the status-bar icon as a flat white silhouette, so it needs its own
// monochrome drawable (res/drawable/ic_stat_upwise.xml) — the launcher icon renders as a blob.
function sendNotification(o: Options) {
  send(isAndroid() ? { icon: "ic_stat_upwise", iconColor: "#2F6A52", ...o } : o);
}

export async function ensurePermission(): Promise<boolean> {
  if (!isTauri) return false;
  try {
    if (await isPermissionGranted()) return true;
    return (await requestPermission()) === "granted";
  } catch {
    return false;
  }
}

async function ensureChannel() {
  if (!isAndroid()) return;
  try {
    await createChannel({
      id: CHANNEL,
      name: "Learning nudges",
      description: "Your daily plan and reminders about what to learn next",
      importance: Importance.Default,
      visibility: Visibility.Private,
      vibration: true,
    });
  } catch { /* already exists */ }
  try {
    await registerActionTypes([
      { id: ACTIONS.plan, actions: [{ id: "start", title: "Start now", foreground: true }, { id: "later", title: "Later" }] },
      { id: ACTIONS.stale, actions: [{ id: "start", title: "Do it now", foreground: true }, { id: "tomorrow", title: "Tomorrow" }, { id: "skip", title: "Skip it" }] },
      { id: ACTIONS.resume, actions: [{ id: "start", title: "Resume", foreground: true }, { id: "later", title: "Later" }] },
      { id: LEGACY_ACTIONS, actions: [{ id: "skip", title: "Skip" }, { id: "snooze", title: "Snooze 1h" }] },
    ]);
  } catch { /* already registered */ }
}

export function settingsOf(profile: Profile | undefined): NotificationSettings {
  return { ...DEFAULT_NOTIFICATIONS, ...(profile?.settings ?? {}) } as NotificationSettings;
}

export interface PlanInput {
  profile: Profile;
  items: Item[];
  sessions: LearningSession[];
  coach: CoachResult | null;
  activity?: DailyActivity[];
}

interface Planned { id: number; at: Date; title: string; body: string; itemId: string | null; actions?: string; kind: string }

const DAY = 86400e3;
const STALE_AFTER_DAYS = 10;
const pendingOf = (items: Item[]) => items.filter((i) => i.status === "inbox" || i.status === "queued" || i.status === "in_progress");
const est = (i: Item) => i.estimated_minutes ?? 10;
const titleOf = (i: Item) => i.title ?? "a saved link";
const at = (base: Date, dayOffset: number, h: number, m = 0) => { const d = new Date(base); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return d; };

/** Most recent day with any learning, from sessions and completions. */
function daysSinceActive(items: Item[], sessions: LearningSession[]): number | null {
  let last = 0;
  for (const s of sessions) last = Math.max(last, new Date(s.started_at).getTime());
  for (const i of items) if (i.completed_at) last = Math.max(last, new Date(i.completed_at).getTime());
  return last ? Math.floor((Date.now() - last) / DAY) : null;
}

/** When your day starts: the earliest hour you've actually learned at (5-11), else 08:30. */
function morningTime(sessions: LearningSession[]): [number, number] {
  const early = activeHours(sessions).filter((h) => h >= 5 && h <= 11).sort((a, b) => a - b)[0];
  return early != null ? [early, 0] : [8, 30];
}

/** When you usually learn in the evening, else 20:30. Never after 22:00. */
function eveningTime(sessions: LearningSession[]): [number, number] {
  const h = activeHours(sessions).find((x) => x >= 17 && x <= 21);
  return h != null ? [h, 30] : [20, 30];
}

function planFor(input: PlanInput, now: Date): Planned[] {
  const { profile, items, sessions, coach, activity } = input;
  const pending = pendingOf(items);
  const idle = daysSinceActive(items, sessions);
  const target = profile.daily_target_minutes ?? 30;
  const doneToday = activity ? todayMinutes(activity) : 0;
  const st = activity ? streak(activity, breakDaySet(profile.settings)).current : 0;
  const away = idle != null && idle >= 14;
  const quiet = idle != null && idle >= 4;
  const out: Planned[] = [];
  if (!pending.length || away) return out;

  const byId = new Map(items.map((i) => [i.id, i]));
  const shortest = [...pending].sort((a, b) => est(a) - est(b))[0];

  for (let d = 0; d < 2; d++) {
    // ---- morning plan ----
    const [mh, mm] = morningTime(sessions);
    const coached = d === 0 && coach?.pick_item_id ? byId.get(coach.pick_item_id) : undefined;
    const first = quiet ? shortest : coached && pending.includes(coached) ? coached : heuristicPick(items)!;
    const then = (d === 0 && coached ? (coach!.next_item_ids ?? []).map((id) => byId.get(id)) : pending.filter((i) => i.id !== first.id).slice(0, 1))
      .filter((i): i is Item => !!i && i.id !== first.id && pending.includes(i)).slice(0, 1);
    out.push({
      id: 1000 + d, at: at(now, d, mh, mm), itemId: first.id, actions: ACTIONS.plan, kind: "morning_plan",
      title: quiet ? "Ease back in" : coached ? coach!.headline : "Today's plan",
      body: quiet
        ? `${est(first)} min is enough: ${titleOf(first)}.`
        : `Start with ${titleOf(first)} (~${fmtMinutes(est(first))})${then[0] ? `, then ${titleOf(then[0])}` : ""}.`,
    });
    if (quiet) continue; // coming back from a quiet stretch: one gentle nudge a day, nothing more

    // ---- midday: something you started and left, else something waiting too long ----
    const lastSessionAt = new Map<string, number>();
    for (const s of sessions) if (s.item_id) lastSessionAt.set(s.item_id, Math.max(lastSessionAt.get(s.item_id) ?? 0, new Date(s.started_at).getTime()));
    const resumable = pending
      .filter((i) => i.status === "in_progress" && i.id !== first.id)
      .filter((i) => now.getTime() - (lastSessionAt.get(i.id) ?? new Date(i.started_at ?? i.created_at).getTime()) >= DAY)[0];
    const stale = pending
      .filter((i) => i.status !== "in_progress" && i.id !== first.id && now.getTime() - new Date(i.created_at).getTime() >= STALE_AFTER_DAYS * DAY)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[d]; // a different one each day
    if (resumable && d === 0) {
      out.push({
        id: 1100 + d, at: at(now, d, 13, 0), itemId: resumable.id, actions: ACTIONS.resume, kind: "resume",
        title: "Pick up where you left off", body: `${titleOf(resumable)} — you started it and it's still open.`,
      });
    } else if (stale) {
      const waited = Math.floor((now.getTime() - new Date(stale.created_at).getTime()) / DAY);
      out.push({
        id: 1100 + d, at: at(now, d, 13, 0), itemId: stale.id, actions: ACTIONS.stale, kind: "stale",
        title: `Waiting ${waited} days`, body: `${titleOf(stale)} (~${fmtMinutes(est(stale))}). Still worth it, or let it go?`,
      });
    }

    // ---- evening: only if the goal isn't already met ----
    const left = d === 0 ? target - doneToday : target;
    if (left > 0) {
      const [eh, em] = eveningTime(sessions);
      const fit = [...pending].filter((i) => est(i) <= Math.max(left, 10)).sort((a, b) => est(b) - est(a))[0] ?? shortest;
      out.push({
        id: 1200 + d, at: at(now, d, eh, em), itemId: fit.id, actions: ACTIONS.plan, kind: "evening_goal",
        title: st > 1 && d === 0 ? `Keep your ${st}-day streak` : d === 0 && doneToday > 0 ? `${left} min to today's goal` : "Still time today",
        body: `${titleOf(fit)} fits in ~${fmtMinutes(est(fit))}.`,
      });
    }
  }
  return out;
}

const WEEKLY_RECAP_ID = 800;

/** Next Sunday 19:00 — this week's if it hasn't passed yet, otherwise next week's. */
function nextRecapTime(now: Date): Date {
  const d = new Date(now);
  d.setDate(now.getDate() + ((7 - now.getDay()) % 7));
  d.setHours(19, 0, 0, 0);
  if (d.getTime() < now.getTime() + 5 * 60_000) d.setDate(d.getDate() + 7);
  return d;
}

function recap(profile: Profile, activity: DailyActivity[], now: Date): Planned {
  const w = weekly(activity, 1)[0];
  const st = streak(activity, breakDaySet(profile.settings));
  const body = w && (w.completed > 0 || w.minutes > 0)
    ? `${pluralize(w.completed, "thing")} learned, ${fmtMinutes(w.minutes)} this week${st.current > 0 ? ` · ${st.current}-day streak` : ""}.`
    : "A quiet week — no pressure. Pick something small when you're ready.";
  return { id: WEEKLY_RECAP_ID, at: nextRecapTime(now), title: "Your week in review", body, itemId: null, kind: "weekly_recap" };
}

function schedule(n: Planned, now: Date) {
  if (isMobile()) {
    sendNotification({
      id: n.id, channelId: CHANNEL, title: n.title, body: n.body, actionTypeId: n.itemId ? n.actions : undefined,
      schedule: Schedule.at(n.at, false, true), extra: { itemId: n.itemId ?? "", kind: n.kind }, autoCancel: true,
    });
  } else {
    desktopTimers.push(window.setTimeout(() => sendNotification({ title: n.title, body: n.body }), n.at.getTime() - now.getTime()));
  }
}

/** Re-plans the next 2 days. Safe to call often — ids are fixed per slot, so Android replaces
 * rather than stacks, and cancelAll() clears anything no longer wanted (e.g. the evening goal
 * nudge once you've hit today's goal). */
export async function replanNotifications(input: PlanInput): Promise<number> {
  if (!isTauri) return 0;
  const { profile, activity } = input;
  for (const t of desktopTimers) clearTimeout(t);
  desktopTimers = [];
  try { await cancelAll(); } catch { /* not supported on some platforms */ }
  if (!settingsOf(profile).enabled || isOnBreak(profile.settings)) return 0;
  if (!(await ensurePermission())) return 0;
  await ensureChannel();

  const now = new Date();
  const plan = planFor(input, now).filter((n) => n.at.getTime() > now.getTime() + 5 * 60_000);
  if (activity) plan.push(recap(profile, activity, now));
  for (const n of plan) {
    schedule(n, now);
    void logNotification({ item_id: n.itemId, kind: n.kind, title: n.title, body: n.body, scheduled_for: n.at.toISOString() });
  }
  return plan.length;
}

/** Re-sends a nudge later. Its own id range so a replan never wipes a snooze. */
export async function snoozeNotification(title: string, body: string, itemId: string | null, until: "later" | "tomorrow") {
  if (!isMobile()) return;
  await ensureChannel();
  const when = until === "tomorrow" ? at(new Date(), 1, 13, 0) : new Date(Date.now() + 90 * 60_000);
  sendNotification({
    id: 900 + Math.floor(Math.random() * 90), channelId: CHANNEL, title, body,
    actionTypeId: itemId ? (until === "tomorrow" ? ACTIONS.stale : ACTIONS.plan) : undefined,
    schedule: Schedule.at(when, false, true), extra: { itemId: itemId ?? "", kind: "snooze" }, autoCancel: true,
  });
  void logNotification({ item_id: itemId, kind: "snooze", title, body, scheduled_for: when.toISOString() });
}

export async function sendTestNotification() {
  if (!(await ensurePermission())) return false;
  await ensureChannel();
  sendNotification({ channelId: CHANNEL, title: "UpWise is set up", body: "Your daily plan will show up like this." });
  return true;
}

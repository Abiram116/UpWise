import {
  cancelAll, createChannel, Importance, isPermissionGranted, registerActionTypes, requestPermission,
  Schedule, sendNotification, Visibility,
} from "@tauri-apps/plugin-notification";
import { isAndroid, isMobile, isTauri } from "./platform";
import { DEFAULT_NOTIFICATIONS } from "./config";
import { activeHours, breakDaySet, heuristicPick, isOnBreak, streak, weekly } from "./stats";
import { logNotification } from "./api";
import { fmtMinutes, parseTime, pluralize } from "./utils";
import type { CoachResult, DailyActivity, Item, LearningSession, NotificationSettings, Profile } from "./types";

const CHANNEL = "upwise-nudges";
let desktopTimers: number[] = [];
// "Mark done" is deliberately NOT a quick action here: completing an item always asks for an
// honest time estimate (see ItemDetail's FinishPromptSheet) - a one-tap background "done" from
// the lock screen would just reintroduce the exact zero-effort-completion problem that fixed.
// Skip and snooze are safe to do silently since neither fabricates a time claim.
export const NUDGE_ACTIONS = "nudge-actions";

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
      description: "Smart reminders about what to learn next",
      importance: Importance.Default,
      visibility: Visibility.Private,
      vibration: true,
    });
  } catch { /* already exists */ }
  try {
    await registerActionTypes([{
      id: NUDGE_ACTIONS,
      actions: [
        { id: "skip", title: "Skip" },
        { id: "snooze", title: "Snooze 1h" },
      ],
    }]);
  } catch { /* already registered */ }
}

export function settingsOf(profile: Profile | undefined): NotificationSettings {
  return { ...DEFAULT_NOTIFICATIONS, ...(profile?.settings ?? {}) } as NotificationSettings;
}

function inQuietHours(minuteOfDay: number, s: NotificationSettings): boolean {
  const start = parseTime(s.quiet_start), end = parseTime(s.quiet_end);
  return start < end ? minuteOfDay >= start && minuteOfDay < end : minuteOfDay >= start || minuteOfDay < end;
}

/** Choose the hours to nudge at: learned from sessions, else sensible defaults; always outside quiet hours. */
export function pickHours(s: NotificationSettings, sessions: LearningSession[]): number[] {
  const wanted = Math.max(0, Math.min(6, s.max_per_day));
  if (wanted === 0) return [];
  const ok = (h: number) => !inQuietHours(h * 60 + 30, s);
  const learned = s.preferred_hours?.length ? s.preferred_hours : activeHours(sessions);
  const chosen: number[] = [];
  for (const h of learned) {
    if (ok(h) && !chosen.some((c) => Math.abs(c - h) < 3)) chosen.push(h);
    if (chosen.length >= wanted) break;
  }
  for (const h of [19, 21, 12, 9, 16]) {
    if (chosen.length >= wanted) break;
    if (ok(h) && !chosen.some((c) => Math.abs(c - h) < 3)) chosen.push(h);
  }
  return chosen.sort((a, b) => a - b);
}

function composeNudge(items: Item[], coach: CoachResult | null, hour: number): { title: string; body: string; itemId: string | null } {
  const pending = items.filter((i) => i.status === "inbox" || i.status === "queued" || i.status === "in_progress");
  const pick = (coach?.pick_item_id && items.find((i) => i.id === coach.pick_item_id)) || heuristicPick(items);
  if (coach && pick && coach.pick_item_id === pick.id) {
    return { title: coach.headline, body: coach.message, itemId: pick.id };
  }
  if (pick) {
    const est = pick.estimated_minutes ?? 10;
    const lead = hour >= 20 ? "Wind down with something useful" : est <= 15 ? `${est} min free?` : "Ready for a focused block?";
    const cat = pick.category?.name ? ` · ${pick.category.name}` : "";
    return {
      title: lead,
      body: `${pick.title ?? "A saved video"} (${est} min${cat}). ${pluralize(pending.length, "item")} waiting.`,
      itemId: pick.id,
    };
  }
  return { title: "Inbox is clear", body: "Nothing waiting. Save the next useful thing you scroll past.", itemId: null };
}

export interface PlanInput {
  profile: Profile;
  items: Item[];
  sessions: LearningSession[];
  coach: CoachResult | null;
  activity?: DailyActivity[];
}

const WEEKLY_RECAP_ID = 800;

/** Next Sunday 19:00 — this week's if it hasn't passed yet, otherwise next week's. */
function nextRecapTime(now: Date): Date {
  const at = new Date(now);
  at.setDate(now.getDate() + ((7 - now.getDay()) % 7));
  at.setHours(19, 0, 0, 0);
  if (at.getTime() < now.getTime() + 5 * 60_000) at.setDate(at.getDate() + 7);
  return at;
}

function planWeeklyRecap(profile: Profile, activity: DailyActivity[]) {
  if (!profile.settings.weekly_recap) return;
  const now = new Date();
  const at = nextRecapTime(now);
  const w = weekly(activity, 1)[0];
  const st = streak(activity, breakDaySet(profile.settings));
  const body = w && (w.completed > 0 || w.minutes > 0)
    ? `${pluralize(w.completed, "thing")} learned, ${fmtMinutes(w.minutes)} this week${st.current > 0 ? ` · ${st.current}-day streak` : ""}.`
    : "A quiet week — no pressure. Pick something small when you're ready.";
  const title = "Your week in review";
  if (isMobile()) {
    sendNotification({ id: WEEKLY_RECAP_ID, channelId: CHANNEL, title, body, schedule: Schedule.at(at, false, true), autoCancel: true });
  } else {
    const t = window.setTimeout(() => sendNotification({ title, body }), at.getTime() - now.getTime());
    desktopTimers.push(t);
  }
  void logNotification({ item_id: null, kind: "weekly_recap", title, body, scheduled_for: at.toISOString() });
}

/** Re-plans the next 2 days of nudges. Safe to call often — every call reuses the same
 * deterministic (day, slot) notification ids, so Android replaces rather than stacks them,
 * even if the OS-level cancelAll() below happens to miss something. */
export async function replanNotifications({ profile, items, sessions, coach, activity }: PlanInput): Promise<number> {
  if (!isTauri) return 0;
  const s = settingsOf(profile);
  for (const t of desktopTimers) clearTimeout(t);
  desktopTimers = [];
  try { await cancelAll(); } catch { /* not supported on some platforms */ }
  const onBreak = isOnBreak(profile.settings);
  const wantsNudges = s.enabled && !onBreak;
  const wantsRecap = !!profile.settings.weekly_recap && !onBreak && !!activity;
  if (!wantsNudges && !wantsRecap) return 0;
  if (!(await ensurePermission())) return 0;
  await ensureChannel();

  if (wantsRecap) planWeeklyRecap(profile, activity!);
  if (!wantsNudges) return 0;

  const hours = pickHours(s, sessions);
  const visibleItems = items.filter((i) => !i.category || !s.muted_categories.includes(i.category.id));
  const now = new Date();
  let scheduled = 0;

  for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
    for (let slot = 0; slot < hours.length; slot++) {
      const h = hours[slot];
      const at = new Date(now);
      at.setDate(now.getDate() + dayOffset);
      at.setHours(h, 30 - Math.floor(Math.random() * 20), 0, 0); // small jitter so it doesn't feel robotic
      if (at.getTime() < now.getTime() + 5 * 60_000) continue;
      const n = composeNudge(visibleItems, dayOffset === 0 ? coach : null, h);
      // Fixed per (dayOffset, slot) id — the whole point is that re-planning the *same* slot
      // always maps to the *same* notification id, so it gets replaced, never duplicated.
      const id = 1000 + dayOffset * 10 + slot;
      if (isMobile()) {
        sendNotification({
          id, channelId: CHANNEL, title: n.title, body: n.body,
          actionTypeId: n.itemId ? NUDGE_ACTIONS : undefined,
          schedule: Schedule.at(at, false, true), extra: { itemId: n.itemId ?? "" }, autoCancel: true,
        });
      } else {
        const t = window.setTimeout(() => sendNotification({ title: n.title, body: n.body }), at.getTime() - now.getTime());
        desktopTimers.push(t);
      }
      void logNotification({ item_id: n.itemId, kind: "nudge", title: n.title, body: n.body, scheduled_for: at.toISOString() });
      scheduled++;
    }
  }
  return scheduled;
}

/** Re-fires the same nudge ~1h later. Uses a separate id range from replanNotifications'
 * deterministic (1000+) slots so a snooze never collides with or gets wiped by the next replan. */
export async function snoozeNotification(title: string, body: string, itemId: string | null) {
  if (!isMobile()) return;
  await ensureChannel();
  const at = new Date(Date.now() + 60 * 60_000);
  const id = 900 + Math.floor(Math.random() * 90);
  sendNotification({
    id, channelId: CHANNEL, title, body,
    actionTypeId: itemId ? NUDGE_ACTIONS : undefined,
    schedule: Schedule.at(at, false, true), extra: { itemId: itemId ?? "" }, autoCancel: true,
  });
  void logNotification({ item_id: itemId, kind: "snooze", title, body, scheduled_for: at.toISOString() });
}

export async function sendTestNotification() {
  if (!(await ensurePermission())) return false;
  await ensureChannel();
  sendNotification({ channelId: CHANNEL, title: "UpWise is set up", body: "Smart nudges will show up like this." });
  return true;
}

import {
  cancelAll, createChannel, Importance, isPermissionGranted, requestPermission, Schedule, sendNotification, Visibility,
} from "@tauri-apps/plugin-notification";
import { isAndroid, isMobile, isTauri } from "./platform";
import { DEFAULT_NOTIFICATIONS } from "./config";
import { activeHours, heuristicPick } from "./stats";
import { logNotification } from "./api";
import { parseTime, pluralize } from "./utils";
import type { CoachResult, Item, LearningSession, NotificationSettings, Profile } from "./types";

const CHANNEL = "upwise-nudges";
let desktopTimers: number[] = [];

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
}

/** Re-plans the next 2 days of nudges. Safe to call often; it cancels and reschedules. */
export async function replanNotifications({ profile, items, sessions, coach }: PlanInput): Promise<number> {
  if (!isTauri) return 0;
  const s = settingsOf(profile);
  for (const t of desktopTimers) clearTimeout(t);
  desktopTimers = [];
  try { await cancelAll(); } catch { /* not supported on some platforms */ }
  if (!s.enabled) return 0;
  if (!(await ensurePermission())) return 0;
  await ensureChannel();

  const hours = pickHours(s, sessions);
  const visibleItems = items.filter((i) => !i.category || !s.muted_categories.includes(i.category.id));
  const now = new Date();
  let scheduled = 0;
  let id = Math.floor(now.getTime() / 1000) % 100000;

  for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
    for (const h of hours) {
      const at = new Date(now);
      at.setDate(now.getDate() + dayOffset);
      at.setHours(h, 30 - Math.floor(Math.random() * 20), 0, 0); // small jitter so it doesn't feel robotic
      if (at.getTime() < now.getTime() + 5 * 60_000) continue;
      const n = composeNudge(visibleItems, dayOffset === 0 ? coach : null, h);
      id++;
      if (isMobile()) {
        sendNotification({
          id, channelId: CHANNEL, title: n.title, body: n.body,
          schedule: Schedule.at(at, false, true), extra: { itemId: n.itemId ?? "" }, autoCancel: true,
        });
      } else {
        const t = window.setTimeout(() => sendNotification({ title: n.title, body: n.body }), at.getTime() - now.getTime());
        desktopTimers.push(t);
      }
      void logNotification({ item_id: n.itemId, kind: "nudge", title: n.title, body: n.body, scheduled_for: at.toISOString() });
      scheduled++;
      if (scheduled >= s.max_per_day * 2) return scheduled;
    }
  }
  return scheduled;
}

export async function sendTestNotification() {
  if (!(await ensurePermission())) return false;
  await ensureChannel();
  sendNotification({ channelId: CHANNEL, title: "UpWise is set up", body: "Smart nudges will show up like this." });
  return true;
}

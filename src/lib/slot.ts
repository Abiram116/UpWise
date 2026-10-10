import { getPref, setPref } from "./store";
import { parseTime } from "./utils";
import type { LearningSession, NotificationSettings } from "./types";

// Your study slot is learned, never set: it's the hour you actually tend to be here and
// learning. Every time the app comes to the foreground that hour gets a vote (opening the app
// is a "free moment" signal even when you don't study), and study sessions weigh more.
const KEY = "openHours";
let lastVoted = "";

export async function recordOpen(): Promise<void> {
  const now = new Date();
  const stamp = `${now.toDateString()}${now.getHours()}`;
  if (stamp === lastVoted) return; // one vote per hour is plenty
  lastVoted = stamp;
  const hist = await getPref<number[]>(KEY, new Array(24).fill(0));
  hist[now.getHours()] = (hist[now.getHours()] ?? 0) + 1;
  // Old habits fade: halve everything when the history gets long, so a changed routine wins.
  if (hist.reduce((a, b) => a + b, 0) > 120) for (let i = 0; i < 24; i++) hist[i] = Math.floor(hist[i] / 2);
  await setPref(KEY, hist);
}
export const loadOpens = () => getPref<number[]>(KEY, new Array(24).fill(0));

export interface Slot { hour: number; minute: number; learned: boolean }

/** Best hour of the day to nudge: most opens + study time, smoothed over neighbouring hours,
 * never inside quiet hours. Falls back to 19:30 until there's a pattern to learn from. */
export function bestSlot(sessions: LearningSession[], opens: number[], s: Pick<NotificationSettings, "quiet_start" | "quiet_end">): Slot {
  const score = new Array<number>(24).fill(0);
  for (let h = 0; h < 24; h++) score[h] += opens[h] ?? 0;
  for (const x of sessions) score[new Date(x.started_at).getHours()] += Math.min(6, Math.max(1, x.seconds / 600)) * 2;
  const smooth = score.map((v, h) => v + 0.5 * (score[(h + 23) % 24] + score[(h + 1) % 24]));
  const qs = parseTime(s.quiet_start), qe = parseTime(s.quiet_end);
  const quiet = (h: number) => { const m = h * 60 + 30; return qs < qe ? m >= qs && m < qe : m >= qs || m < qe; };
  let best = -1, bestV = 0;
  for (let h = 6; h <= 22; h++) if (!quiet(h) && smooth[h] > bestV) { best = h; bestV = smooth[h]; }
  return best >= 0 && bestV >= 3 ? { hour: best, minute: 0, learned: true } : { hour: 19, minute: 30, learned: false };
}

export function fmtSlot(slot: Slot): string {
  const h12 = slot.hour % 12 || 12;
  return `${h12}${slot.minute ? `:${String(slot.minute).padStart(2, "0")}` : ""} ${slot.hour < 12 ? "am" : "pm"}`;
}

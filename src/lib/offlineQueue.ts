import { getPref, setPref } from "./store";
import { analyzeLink } from "./api";

export interface PendingSave { url: string; note?: string; via: "paste" | "share"; queuedAt: string }

const KEY = "offlineQueue";

export async function queueOfflineSave(entry: Omit<PendingSave, "queuedAt">): Promise<void> {
  const list = await getPref<PendingSave[]>(KEY, []);
  list.push({ ...entry, queuedAt: new Date().toISOString() });
  await setPref(KEY, list);
}

export function getOfflineQueue(): Promise<PendingSave[]> {
  return getPref<PendingSave[]>(KEY, []);
}

/** A link shared with no signal should queue instead of just failing — this is the same
 * check used to decide that at save-time. */
export function looksOffline(message: string): boolean {
  try { if (!navigator.onLine) return true; } catch { /* navigator unavailable, fall through */ }
  return /failed to fetch|network|offline|ERR_INTERNET/i.test(message);
}

let processing = false;
/** Retries every queued save. Failures (still offline, or a real error) stay queued for next
 * time rather than being dropped. Returns how many succeeded so the caller can refresh/toast. */
export async function processOfflineQueue(): Promise<{ ok: number; remaining: number }> {
  if (processing) return { ok: 0, remaining: (await getOfflineQueue()).length };
  processing = true;
  try {
    const list = await getPref<PendingSave[]>(KEY, []);
    if (!list.length) return { ok: 0, remaining: 0 };
    const remaining: PendingSave[] = [];
    let ok = 0;
    for (const entry of list) {
      try {
        await analyzeLink(entry.url, { note: entry.note, addedVia: entry.via });
        ok++;
      } catch {
        remaining.push(entry);
      }
    }
    await setPref(KEY, remaining);
    return { ok, remaining: remaining.length };
  } finally {
    processing = false;
  }
}

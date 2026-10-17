import { LazyStore } from "@tauri-apps/plugin-store";
import { isTauri } from "./platform";

// Small device-local preferences (theme, active session, cached coach). Not synced.
// autoSave batches writes (300 ms) instead of flushing to disk after every single set.
const store = isTauri ? new LazyStore("prefs.json", { autoSave: 300, defaults: {} }) : null;

export async function getPref<T>(key: string, fallback: T): Promise<T> {
  try {
    if (store) {
      const v = await store.get<T>(key);
      return v ?? fallback;
    }
    const raw = localStorage.getItem(`upwise:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function setPref<T>(key: string, value: T): Promise<void> {
  try {
    if (store) {
      await store.set(key, value);
    } else localStorage.setItem(`upwise:${key}`, JSON.stringify(value));
  } catch { /* ignore */ }
}

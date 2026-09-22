import { LazyStore } from "@tauri-apps/plugin-store";
import { isTauri } from "./platform";

// Small device-local preferences (theme, active session, cached coach). Not synced.
const store = isTauri ? new LazyStore("prefs.json") : null;

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
      await store.save();
    } else localStorage.setItem(`upwise:${key}`, JSON.stringify(value));
  } catch { /* ignore */ }
}

import { platform as osPlatform } from "@tauri-apps/plugin-os";

export const isTauri = "__TAURI_INTERNALS__" in window;

let cached: string | null = null;
export function platform(): string {
  if (!isTauri) return "web";
  if (!cached) {
    try { cached = osPlatform(); } catch { cached = "unknown"; }
  }
  return cached;
}

export const isAndroid = () => platform() === "android";
export const isMobile = () => platform() === "android" || platform() === "ios";
export const isDesktop = () => isTauri && !isMobile();

import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "./platform";

/** Opens a link in the system browser / the app that owns it (YouTube, Instagram...). */
export async function openExternal(url: string): Promise<void> {
  if (isTauri) await openUrl(url); else window.open(url, "_blank", "noopener");
}

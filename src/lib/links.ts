import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "./platform";

/** Opens a link in the system browser / the app that owns it (YouTube, Instagram...). Tries the
 * native opener, then the webview's own window.open, and as a last resort copies the link so it
 * is never simply lost. Returns whether something actually opened. */
export async function openExternal(url: string): Promise<boolean> {
  if (!url || url.startsWith("note:")) return false;
  try { if (isTauri) { await openUrl(url); return true; } } catch { /* fall through */ }
  try { if (window.open(url, "_blank", "noopener")) return true; } catch { /* fall through */ }
  try { await navigator.clipboard.writeText(url); } catch { /* nothing more we can do */ }
  return false;
}

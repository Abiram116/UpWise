import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isAndroid, isDesktop, isTauri } from "./platform";
import { RELEASE_REPO } from "./config";
import "./android-bridge";

export interface UpdateInfo {
  version: string;
  current: string;
  notes: string;
  /** desktop: handled by tauri updater. android: direct .apk download URL */
  apkUrl?: string;
  install: (onProgress?: (pct: number | null) => void) => Promise<void>;
}

function newer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

export async function currentVersion(): Promise<string> {
  if (!isTauri) return "dev";
  try { return await getVersion(); } catch { return "?"; }
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri) return null;
  const current = await currentVersion();

  if (isDesktop()) {
    const { check } = await import("@tauri-apps/plugin-updater");
    const { relaunch } = await import("@tauri-apps/plugin-process");
    const u = await check();
    if (!u) return null;
    return {
      version: u.version,
      current,
      notes: u.body ?? "",
      install: async (onProgress) => {
        let total = 0, got = 0;
        await u.downloadAndInstall((ev) => {
          if (ev.event === "Started") total = ev.data.contentLength ?? 0;
          else if (ev.event === "Progress") { got += ev.data.chunkLength; onProgress?.(total ? Math.round((got / total) * 100) : null); }
          else if (ev.event === "Finished") onProgress?.(100);
        });
        await relaunch();
      },
    };
  }

  if (isAndroid()) {
    const r = await fetch(`https://api.github.com/repos/${RELEASE_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    // Not "no update": a rate-limit or outage must not claim you're up to date.
    if (!r.ok) throw new Error(r.status === 403 || r.status === 429 ? "GitHub is limiting update checks right now. Try again in an hour." : "GitHub didn't answer. Try again in a bit.");
    const rel = await r.json();
    const version: string = (rel.tag_name ?? "").replace(/^v/, "");
    if (!version || !newer(version, current)) return null;
    const apk = (rel.assets ?? []).find((a: { name: string }) => /\.apk$/i.test(a.name));
    if (!apk) return null;
    return {
      version,
      current,
      notes: rel.body ?? "",
      apkUrl: apk.browser_download_url,
      install: async () => {
        if (window.AndroidNative?.downloadAndInstall) window.AndroidNative.downloadAndInstall(apk.browser_download_url);
        else await openUrl(apk.browser_download_url); // older installs without the native bridge yet
      },
    };
  }
  return null;
}

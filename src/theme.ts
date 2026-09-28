import "./lib/android-bridge";

export type Theme = "system" | "light" | "dark";

function currentTheme(): Theme {
  try { return (localStorage.getItem("upwise:theme") as Theme) || "system"; } catch { return "system"; }
}

// Edge-to-edge on Android leaves status bar icon color up to us — light background needs dark icons.
function syncStatusBar() {
  const t = currentTheme();
  const isLight = t === "light" || (t === "system" && !window.matchMedia("(prefers-color-scheme: dark)").matches);
  window.AndroidNative?.setLightStatusBar?.(isLight);
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
  try { localStorage.setItem("upwise:theme", t); } catch { /* ignore */ }
  syncStatusBar();
}

// ---- palette: the phone's Material You colours (wallpaper) or UpWise's own sage/apricot ----
export type Palette = "wallpaper" | "upwise";

export function wallpaperAvailable(): boolean {
  try { const j = JSON.parse(window.AndroidNative?.dynamicColors?.() ?? "{}"); return Object.keys(j).length > 0; } catch { return false; }
}

export function currentPalette(): Palette {
  try { return (localStorage.getItem("upwise:palette") as Palette) || (wallpaperAvailable() ? "wallpaper" : "upwise"); } catch { return "upwise"; }
}

export function applyPalette(p: Palette) {
  const root = document.documentElement;
  let colors: Record<string, string> = {};
  try { colors = JSON.parse(window.AndroidNative?.dynamicColors?.() ?? "{}"); } catch { /* none */ }
  if (p === "wallpaper" && Object.keys(colors).length) {
    for (const [k, v] of Object.entries(colors)) root.style.setProperty(`--dyn-${k}`, v);
    root.setAttribute("data-palette", "wallpaper");
  } else root.removeAttribute("data-palette");
  try { localStorage.setItem("upwise:palette", p); } catch { /* ignore */ }
}

export function initTheme() {
  applyPalette(currentPalette());
  // A new wallpaper changes the palette while the app is in the background.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && currentPalette() === "wallpaper") applyPalette("wallpaper"); });
  try {
    const t = localStorage.getItem("upwise:theme") as Theme | null;
    if (t && t !== "system") document.documentElement.setAttribute("data-theme", t);
  } catch { /* ignore */ }
  syncStatusBar();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncStatusBar);
}

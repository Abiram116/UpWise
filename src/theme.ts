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

export function initTheme() {
  try {
    const t = localStorage.getItem("upwise:theme") as Theme | null;
    if (t && t !== "system") document.documentElement.setAttribute("data-theme", t);
  } catch { /* ignore */ }
  syncStatusBar();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncStatusBar);
}

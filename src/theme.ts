export type Theme = "system" | "light" | "dark";

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
  try { localStorage.setItem("upwise:theme", t); } catch { /* ignore */ }
}

export function initTheme() {
  try {
    const t = localStorage.getItem("upwise:theme") as Theme | null;
    if (t && t !== "system") document.documentElement.setAttribute("data-theme", t);
  } catch { /* ignore */ }
}

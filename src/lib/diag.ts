import { getVersion } from "@tauri-apps/api/app";
import { supabase } from "./supabase";
import { isAndroid } from "./platform";

// Diagnostics for bugs that only happen on the phone (the nav bar shifting, the feed hitching).
// Numbers only — sizes, offsets, frame timings, which screen — never anything you saved or wrote.
// Each distinct anomaly is sent once per session, at most 120 events a day, batched.

type Ev = { kind: string; data: Record<string, unknown>; app_version: string };
const queue: Ev[] = [];
const seen = new Set<string>();
let version = "?";
let flushTimer = 0;
const DAY_KEY = "upwise:diag-day";

function budget(): boolean {
  try {
    const today = new Date().toDateString();
    const d = JSON.parse(localStorage.getItem(DAY_KEY) ?? "{}") as { day?: string; n?: number };
    const n = d.day === today ? d.n ?? 0 : 0;
    if (n >= 120) return false;
    localStorage.setItem(DAY_KEY, JSON.stringify({ day: today, n: n + 1 }));
    return true;
  } catch { return false; }
}

export function diag(kind: string, data: Record<string, unknown>, dedupeKey?: string) {
  if (!isAndroid()) return;
  const key = dedupeKey ?? `${kind}:${JSON.stringify(data)}`;
  if (seen.has(key) || !budget()) return;
  seen.add(key);
  queue.push({ kind, data: { ...data, route: location.hash || "#/" }, app_version: version });
  window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(flush, 8000);
}

async function flush() {
  if (!queue.length) return;
  const batch = queue.splice(0);
  try { await supabase.from("diag_events").insert(batch); } catch { /* best effort */ }
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function snapshot() {
  const vv = window.visualViewport;
  const nav = document.querySelector(".navbar")?.getBoundingClientRect();
  const css = getComputedStyle(document.documentElement);
  let native: unknown = null;
  try { native = JSON.parse(window.AndroidNative?.diag?.() ?? "null"); } catch { /* ignore */ }
  return {
    innerH: innerHeight, innerW: innerWidth, scrollY: r1(scrollY),
    vv: vv ? { w: r1(vv.width), h: r1(vv.height), top: r1(vv.offsetTop), scale: r1(vv.scale) } : null,
    nav: nav ? { top: r1(nav.top), bottom: r1(nav.bottom), h: r1(nav.height) } : null,
    safeTop: css.getPropertyValue("--native-safe-top").trim(), safeBottom: css.getPropertyValue("--native-safe-bottom").trim(),
    native,
  };
}

/** What counts as "the layout is off": the nav not sitting on the bottom edge, the visible area
 * panned or zoomed, the page or the WebView itself scrolled where nothing should scroll. */
function check(why: string) {
  if (document.visibilityState !== "visible") return;
  const s = snapshot();
  const n = s.native as { ime?: boolean } | null;
  const issues: string[] = [];
  if (s.nav && s.nav.h > 0 && Math.abs(s.nav.bottom - s.innerH) > 1) issues.push("nav-off-bottom");
  if (s.vv && (Math.abs(s.vv.top) > 1 || Math.abs(s.vv.scale - 1) > 0.01)) issues.push("visual-viewport");
  if (s.vv && !n?.ime && s.innerH - s.vv.h > 2) issues.push("viewport-short");
  if (s.vv && s.innerW - s.vv.w > 1) issues.push("layout-wider-than-screen");
  if (location.hash.startsWith("#/feed") && s.scrollY !== 0) issues.push("page-scrolled-on-feed");
  if (issues.length) diag("layout", { why, issues, ...s }, `layout:${issues.join(",")}:${s.nav?.bottom}:${s.innerH}`);
}

let started = false;
export function startDiag() {
  if (!isAndroid() || started) return;
  started = true;
  void getVersion().then((v) => { version = v; }).catch(() => {});
  // A full snapshot once per launch, so there's always a baseline to compare against.
  window.setTimeout(() => diag("boot", snapshot(), "boot"), 6000);
  const later = (why: string) => () => window.setTimeout(() => check(why), 400);
  window.addEventListener("resize", later("resize"));
  window.visualViewport?.addEventListener("resize", later("vv-resize"));
  window.visualViewport?.addEventListener("scroll", later("vv-scroll"));
  document.addEventListener("visibilitychange", later("resume"));
  window.addEventListener("hashchange", later("route"));
  window.setInterval(() => check("tick"), 4000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void flush(); });

  // Slow frames on the Scroll page, with what was running (Long Animation Frames API).
  try {
    let n = 0;
    const po = new PerformanceObserver((list) => {
      if (!location.hash.startsWith("#/feed")) return;
      for (const e of list.getEntries() as (PerformanceEntry & { blockingDuration?: number; scripts?: { sourceURL?: string; sourceFunctionName?: string; invoker?: string; duration: number }[] })[]) {
        if (e.duration < 50 || n >= 25) continue;
        n++;
        const scripts = (e.scripts ?? []).sort((a, b) => b.duration - a.duration).slice(0, 3)
          .map((s) => ({ fn: s.sourceFunctionName, inv: s.invoker, src: (s.sourceURL ?? "").split("/").pop(), ms: Math.round(s.duration) }));
        diag("long-frame", { ms: Math.round(e.duration), blocking: Math.round(e.blockingDuration ?? 0), scripts }, `lf:${Date.now()}`);
      }
    });
    po.observe({ type: "long-animation-frame", buffered: false });
  } catch { /* API not available */ }
}

/** Frame gaps while a feed gesture/settle is in motion (main-thread view of a hitch). */
export function watchMotion(ms: number) {
  if (!isAndroid()) return;
  let last = performance.now(), worst = 0, gaps = 0;
  const until = last + ms;
  const tick = (t: number) => {
    const d = t - last; last = t;
    if (d > worst) worst = d;
    if (d > 34) gaps++;
    if (t < until) requestAnimationFrame(tick);
    else if (worst > 34) diag("feed-motion", { worstMs: Math.round(worst), gaps, hz: (() => { try { return JSON.parse(window.AndroidNative?.diag?.() ?? "{}").hz; } catch { return null; } })() }, `fm:${Date.now()}`);
  };
  requestAnimationFrame(tick);
}

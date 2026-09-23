import { useSyncExternalStore } from "react";
import { diagnoseConnection, isNetworkError } from "./errors";

// One source of truth for "can we talk to Supabase right now", fed by browser online/offline
// events and by every failed/successful query. Screens keep showing cached data; the banner
// in AppShell is the only place that talks about connectivity.
export type ConnStatus = "ok" | "offline" | "backend";

let status: ConnStatus = typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "ok";
const subs = new Set<() => void>();
const reconnectSubs = new Set<() => void>();
let checking: Promise<ConnStatus> | null = null;

// While Supabase is unreachable but the internet isn't (paused project), no browser event will
// tell us it's back — poll gently until it is.
let poll: number | undefined;

function set(next: ConnStatus) {
  if (next === status) return;
  const recovered = status !== "ok" && next === "ok";
  status = next;
  window.clearInterval(poll);
  poll = next === "backend" ? window.setInterval(() => { if (document.visibilityState === "visible") void recheckConnection(); }, 30_000) : undefined;
  subs.forEach((s) => s());
  if (recovered) reconnectSubs.forEach((s) => s());
}

export function recheckConnection(): Promise<ConnStatus> {
  checking ??= diagnoseConnection().then((s) => { set(s); return s; }).finally(() => { checking = null; });
  return checking;
}

export const connection = {
  get: () => status,
  subscribe: (l: () => void) => { subs.add(l); return () => { subs.delete(l); }; },
  /** Called with every failed request; only connectivity failures change the status. */
  reportError(e: unknown) { if (isNetworkError(e)) void recheckConnection(); },
  reportOk() { set("ok"); },
  /** Fires once each time the app goes from offline/backend-down back to ok. */
  onReconnect(l: () => void): () => void { reconnectSubs.add(l); return () => { reconnectSubs.delete(l); }; },
};

export function useConnection(): ConnStatus {
  return useSyncExternalStore(connection.subscribe, connection.get);
}

if (typeof window !== "undefined") {
  window.addEventListener("offline", () => set("offline"));
  window.addEventListener("online", () => void recheckConnection());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && status !== "ok") void recheckConnection();
  });
}

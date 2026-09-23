import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

// Every error the user can see goes through describeError — raw Postgres/fetch/stack text
// never reaches the screen.
export type ErrorKind = "offline" | "backend" | "auth" | "unknown";
export interface FriendlyError { kind: ErrorKind; title: string; message: string }

type Errorish = { name?: string; message?: string; code?: string; status?: number; details?: unknown; context?: { status?: number } };

const NETWORK_RE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_name_not_resolved|err_connection|err_network|timed? ?out|failed to send a request|econnrefused|enotfound|getaddrinfo|<!doctype|<html|project is paused|\b5\d\d\b/i;
const AUTH_RE = /jwt expired|invalid jwt|invalid claim|refresh token|not authenticated|session expired|auth session missing/i;

export class SessionExpiredError extends Error {
  constructor() { super("auth session missing"); this.name = "SessionExpiredError"; }
}

/** True for anything that means "the server couldn't be reached", as opposed to the server
 * answering with a real error. supabase-js reports those with an empty `code` — a real
 * PostgREST/Postgres error always carries one (PGRST116, 42501, 23505...). */
export function isNetworkError(e: unknown): boolean {
  if (!e) return false;
  const err = e as Errorish;
  if (err.name === "AuthRetryableFetchError" || err.name === "FunctionsFetchError" || err.name === "FunctionsRelayError") return true;
  // Edge-function errors carry the HTTP response as `context`; a paused project answers 5xx/540.
  const status = typeof err.status === "number" ? err.status : err.context?.status;
  if (typeof status === "number" && (status === 0 || status >= 500)) return true;
  return NETWORK_RE.test(err.message ?? String(e));
}

export function isAuthError(e: unknown): boolean {
  const err = e as Errorish;
  if (err instanceof SessionExpiredError) return true;
  if (err?.status === 401 || err?.code === "PGRST301") return true;
  return AUTH_RE.test(err?.message ?? "");
}

export const SUPABASE_DASHBOARD_URL = (() => {
  try { return `https://supabase.com/dashboard/project/${new URL(SUPABASE_URL).hostname.split(".")[0]}`; }
  catch { return "https://supabase.com/dashboard/projects"; }
})();

export const OFFLINE: FriendlyError = {
  kind: "offline",
  title: "You're offline",
  message: "Showing what's saved on this device. Changes you make sync when you're back online.",
};
export const BACKEND_DOWN: FriendlyError = {
  kind: "backend",
  title: "Can't reach your database",
  message: "Your internet works, but Supabase isn't answering. Free projects pause after a week without use — restore it from the dashboard and UpWise reconnects on its own.",
};

export function describeError(e: unknown, status?: "offline" | "backend"): FriendlyError {
  if (isAuthError(e)) return { kind: "auth", title: "Session expired", message: "Enter your PIN again to keep going." };
  if (isNetworkError(e)) return status === "backend" ? BACKEND_DOWN : status === "offline" || !navigator.onLine ? OFFLINE : BACKEND_DOWN;
  const msg = (e as Errorish)?.message?.trim() ?? "";
  // Server-authored messages (edge functions throw plain sentences like "That doesn't look
  // like a valid link") are fine to show as-is; anything that looks like internals isn't.
  const humanish = msg.length > 0 && msg.length < 160 && !/[{}<>]|\bat\s+\S+:\d+|violates|syntax|undefined|null|TypeError|ReferenceError|PGRST|\bcode\b|non-2xx|edge function|relation|column|permission denied/i.test(msg);
  return { kind: "unknown", title: "Something went wrong", message: humanish ? msg : "That didn't work. Try again in a moment." };
}

export const friendlyMessage = (e: unknown) => describeError(e).message;

async function reachable(url: string, init: RequestInit, ms: number): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" }); return true; }
  catch { return false; }
  finally { clearTimeout(t); }
}

/** Tells "no internet" apart from "internet fine, Supabase not answering" (paused/down). */
export async function diagnoseConnection(): Promise<"ok" | "offline" | "backend"> {
  if (!navigator.onLine) return "offline";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_ANON_KEY }, signal: ctrl.signal, cache: "no-store" });
    if (r.ok) return "ok";
  } catch { /* fall through to the internet probe */ } finally { clearTimeout(t); }
  const internet = await reachable("https://www.gstatic.com/generate_204", { mode: "no-cors" }, 5000);
  return internet ? "backend" : "offline";
}

import { createClient, type Session } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/** The session supabase-js has on disk, read directly. getSession() returns null when the
 * access token has expired and the refresh request can't go out (no signal) — even though
 * the refresh token is fine and will work the moment you're back online. */
export function storedSession(): Session | null {
  try {
    const key = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
    const raw = localStorage.getItem(key);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    return s?.refresh_token && s.user?.id ? s : null;
  } catch { return null; }
}

// The signed-in user's id, known without a network round-trip. auth.getUser() hits the
// server every call, which made every offline write crash on `auth.user!.id`.
const UID_KEY = "upwise:uid";
let uid: string | null = (() => { try { return localStorage.getItem(UID_KEY) ?? storedSession()?.user.id ?? null; } catch { return null; } })();
supabase.auth.onAuthStateChange((_e, s) => {
  // Only a real sign-out clears it — a failed offline token refresh must not.
  if (_e === "SIGNED_OUT") { uid = null; try { localStorage.removeItem(UID_KEY); } catch { /* ignore */ } }
  else if (s?.user.id && s.user.id !== uid) { uid = s.user.id; try { localStorage.setItem(UID_KEY, uid); } catch { /* ignore */ } }
});

export function currentUserId(): string {
  if (!uid) throw new Error("auth session missing");
  return uid;
}

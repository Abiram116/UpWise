import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { storedSession, supabase } from "../lib/supabase";
import { derivePassword } from "../lib/pin";
import { currentVersion } from "../lib/updater";
import { diagnoseConnection, isNetworkError } from "../lib/errors";

// Single-user app, no visible login UI — but unlike a baked-in password, this never ships
// a real credential in the bundle. First launch (or after signing out) asks for a PIN once;
// the derived password is used for exactly one sign-in attempt and never stored anywhere.
// Every launch after that just resumes the persisted Supabase session, same as before.
const EMAIL = import.meta.env.VITE_APP_EMAIL as string | undefined;
const NAME = (import.meta.env.VITE_APP_NAME as string | undefined) ?? "there";

// Re-lock even with a valid session if it's been a real update or a long time away — the
// PIN is cheap to re-enter and it's not much of a "lock" if it only ever asks once, ever.
const LAST_ACTIVE_KEY = "upwise:lastActiveAt";
const LAST_VERSION_KEY = "upwise:lastActiveVersion";
const RELOCK_AFTER_MS = 6 * 24 * 60 * 60 * 1000;

function markActive(version: string) {
  try {
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
    localStorage.setItem(LAST_VERSION_KEY, version);
  } catch { /* ignore */ }
}

function shouldRelock(version: string): boolean {
  try {
    // Only reached when a persisted session already exists, so "no baseline on this device"
    // means this build is the first to run here, i.e. an update just happened.
    const lastVersion = localStorage.getItem(LAST_VERSION_KEY);
    if (lastVersion !== version) return true;
    const lastAt = Number(localStorage.getItem(LAST_ACTIVE_KEY) ?? "0");
    if (!lastAt) return true;
    return Date.now() - lastAt > RELOCK_AFTER_MS;
  } catch { return false; }
}

export type UnlockResult = "ok" | "wrong" | "offline" | "backend" | "limited";

interface AuthCtx {
  session: Session | null;
  loading: boolean;
  /** Only set for a broken build (missing config) — nothing the user can fix at runtime. */
  configError: string | null;
  needsPin: boolean;
  name: string;
  unlock: (pin: string) => Promise<UnlockResult>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [needsPin, setNeedsPin] = useState(false);
  // Auth events that arrive while locked (INITIAL_SESSION, a background TOKEN_REFRESHED) must
  // not hand the session over — that used to skip the PIN screen right after an update.
  const locked = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!EMAIL) throw new Error("This build is missing its account setting (VITE_APP_EMAIL). Rebuild with it in .env.");
        const version = await currentVersion();
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        // Expired access token + no signal: the session is still good, it just can't be
        // refreshed yet. Use the stored one; supabase-js refreshes it once you're online.
        const offline = !!error && isNetworkError(error);
        const current = data.session ?? (offline ? storedSession() : null);
        if (!current) { setNeedsPin(true); return; }
        if (!shouldRelock(version)) {
          locked.current = false;
          setSession(current);
          markActive(version);
        } else if (offline || !navigator.onLine) {
          // The PIN can only be checked by the server. Rather than locking you out of your
          // own library with no signal, let this launch through and ask next time you're
          // online (lastActive isn't bumped, so the relock is still due).
          locked.current = false;
          setSession(current);
        } else {
          setNeedsPin(true);
        }
      } catch (e) {
        if (!cancelled) setConfigError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_OUT") {
        // Refresh token revoked/expired server-side — the only way back in is the PIN.
        locked.current = true;
        setSession(null);
        setNeedsPin(true);
        return;
      }
      if (s && !locked.current) setSession(s);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const unlock = useCallback(async (pin: string): Promise<UnlockResult> => {
    if (!EMAIL) return "wrong";
    const password = await derivePassword(pin);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password });
      if (error) {
        if (error.status === 429) return "limited";
        if (isNetworkError(error)) { const s = await diagnoseConnection(); return s === "ok" ? "backend" : s; }
        return "wrong";
      }
      if (!data.session) return "wrong";
      locked.current = false;
      setSession(data.session);
      setNeedsPin(false);
      void currentVersion().then(markActive);
      return "ok";
    } catch (e) {
      if (!isNetworkError(e)) return "wrong";
      const s = await diagnoseConnection();
      return s === "ok" ? "backend" : s;
    }
  }, []);

  return <Ctx.Provider value={{ session, loading, configError, needsPin, name: NAME, unlock }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

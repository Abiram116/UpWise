import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { derivePassword } from "../lib/pin";
import { currentVersion } from "../lib/updater";

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
    const lastAt = Number(localStorage.getItem(LAST_ACTIVE_KEY) ?? "0");
    if (!lastAt) return false; // never recorded — first run, nothing to compare against
    const lastVersion = localStorage.getItem(LAST_VERSION_KEY);
    if (lastVersion && lastVersion !== version) return true;
    return Date.now() - lastAt > RELOCK_AFTER_MS;
  } catch { return false; }
}

interface AuthCtx {
  session: Session | null;
  loading: boolean;
  error: string | null;
  needsPin: boolean;
  name: string;
  unlock: (pin: string) => Promise<boolean>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsPin, setNeedsPin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!EMAIL) throw new Error("Add VITE_APP_EMAIL to .env, then rebuild.");
        const version = await currentVersion();
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session && !shouldRelock(version)) {
          setSession(data.session);
          markActive(version);
        } else {
          setNeedsPin(true);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (s) { setSession(s); setNeedsPin(false); } });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const unlock = useCallback(async (pin: string): Promise<boolean> => {
    if (!EMAIL) return false;
    const password = await derivePassword(pin);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: EMAIL, password });
    if (signInError || !data.session) return false;
    setSession(data.session);
    setNeedsPin(false);
    void currentVersion().then(markActive);
    return true;
  }, []);

  return <Ctx.Provider value={{ session, loading, error, needsPin, name: NAME, unlock }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

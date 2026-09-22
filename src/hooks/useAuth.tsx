import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { derivePassword } from "../lib/pin";

// Single-user app, no visible login UI — but unlike a baked-in password, this never ships
// a real credential in the bundle. First launch (or after signing out) asks for a PIN once;
// the derived password is used for exactly one sign-in attempt and never stored anywhere.
// Every launch after that just resumes the persisted Supabase session, same as before.
const EMAIL = import.meta.env.VITE_APP_EMAIL as string | undefined;
const NAME = (import.meta.env.VITE_APP_NAME as string | undefined) ?? "there";

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
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) setSession(data.session);
        else setNeedsPin(true);
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
    return true;
  }, []);

  return <Ctx.Provider value={{ session, loading, error, needsPin, name: NAME, unlock }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

// Single-user app: signs in silently with the built-in account from .env. No login UI.
const EMAIL = import.meta.env.VITE_APP_EMAIL as string | undefined;
const PASSWORD = import.meta.env.VITE_APP_PASSWORD as string | undefined;
const NAME = (import.meta.env.VITE_APP_NAME as string | undefined) ?? "there";

interface AuthCtx { session: Session | null; loading: boolean; error: string | null; name: string }
const Ctx = createContext<AuthCtx | null>(null);

let inflight: Promise<Session> | null = null;

// Single in-flight promise: StrictMode/double effects must never race two sign-ups.
function silentSignIn(): Promise<Session> {
  inflight ??= (async () => {
    try {
      if (!EMAIL || !PASSWORD) throw new Error("Add VITE_APP_EMAIL and VITE_APP_PASSWORD to .env, then rebuild.");
      const first = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
      if (!first.error && first.data.session) return first.data.session;
      // First launch ever: create the account.
      const up = await supabase.auth.signUp({ email: EMAIL, password: PASSWORD, options: { data: { display_name: NAME } } });
      if (up.data.session) return up.data.session;
      // Account may already exist (e.g. created by another device); try signing in once more.
      const again = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
      if (again.data.session) return again.data.session;
      throw new Error(up.error?.message ?? again.error?.message ?? first.error?.message ?? "Sign-in failed");
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const s = data.session ?? (await silentSignIn());
        if (!cancelled) setSession(s);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (s) setSession(s); });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  return <Ctx.Provider value={{ session, loading, error, name: NAME }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

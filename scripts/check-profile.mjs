import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>l.split("=").map(s=>s.trim())));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const { data, error } = await sb.auth.signInWithPassword({ email: "upwise.test.account@gmail.com", password: "upwise-test-pass-123" });
console.log("test user:", data.user?.id, error?.message);
console.log("profile:", await sb.from("profiles").select("*").maybeSingle());
// try the real account
const r = await sb.auth.signUp({ email: env.VITE_APP_EMAIL, password: env.VITE_APP_PASSWORD, options: { data: { display_name: env.VITE_APP_NAME } } });
console.log("signup real:", r.data.user?.id, r.data.session ? "session" : "no session", r.error?.message, r.error?.status);

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>l.split("=").map(s=>s.trim())));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
await sb.auth.signInWithPassword({ email: env.VITE_APP_EMAIL, password: env.VITE_APP_PASSWORD });
const t0 = Date.now();
const r = await sb.functions.invoke("coach", { body: { local_hour: new Date().getHours() } });
console.log(((Date.now()-t0)/1000).toFixed(1)+"s", r.error ? "ERR " + r.error.message + " " + await r.error.context?.text?.() : JSON.stringify(r.data, null, 1));

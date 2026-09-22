import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync("/home/abiram/Prayoga/UpWise/.env","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>l.split("=").map(s=>s.trim())));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
await sb.auth.signInWithPassword({ email: env.VITE_APP_EMAIL, password: env.VITE_APP_PASSWORD });
const { data } = await sb.from("items").select("title, source, has_transcript, ai").order("created_at", { ascending: false });
for (const i of data) console.log(i.source.padEnd(10), String(i.has_transcript).padEnd(6), i.ai?.error ? "ERR" : "   ", i.title?.slice(0,50));

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync("/home/abiram/Prayoga/UpWise/.env", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split("=").map((s) => s.trim())),
);
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const email = "upwise.test.account@gmail.com";
const password = "upwise-test-pass-123";
let { data, error } = await sb.auth.signInWithPassword({ email, password });
if (error) {
  console.log("sign-in failed, signing up:", error.message);
  ({ data, error } = await sb.auth.signUp({ email, password }));
  if (error) { console.error("signup error:", error.message); process.exit(1); }
  if (!data.session) { console.error("No session — email confirmation is probably ON in Supabase Auth settings"); process.exit(2); }
}
console.log("user:", data.user.id);

const url = process.argv[2] ?? "https://www.youtube.com/watch?v=T-D1OfcDW1M";
const t0 = Date.now();
const res = await sb.functions.invoke("analyze-link", { body: { url } });
console.log(`took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (res.error) { console.error("fn error:", res.error, await res.error.context?.text?.()); process.exit(3); }
const { item, duplicate, ai_error } = res.data;
if (duplicate) { console.log("duplicate:", item); process.exit(0); }
console.log(JSON.stringify({
  title: item.title, source: item.source, channel: item.channel, duration: item.duration_seconds,
  has_transcript: item.has_transcript, transcript_len: item.transcript?.length,
  category: item.category, tags: item.tags, relevance: item.relevance_score, est: item.estimated_minutes,
  ai: item.ai, ai_error,
}, null, 2));

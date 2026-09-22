// Dev helper: signs in with the built-in account, optionally resets onboarding, and analyzes the given URLs.
//   node scripts/seed-real.mjs [--reset-onboarding] <url> [url...]
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split("=").map((s) => s.trim())));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const { data, error } = await sb.auth.signInWithPassword({ email: env.VITE_APP_EMAIL, password: env.VITE_APP_PASSWORD });
if (error) { console.error(error.message); process.exit(1); }

const args = process.argv.slice(2);
if (args.includes("--reset-onboarding")) {
  await sb.from("profiles").update({ onboarded: false }).eq("id", data.user.id);
  console.log("onboarding reset");
}
for (const url of args.filter((a) => a.startsWith("http"))) {
  const t0 = Date.now();
  const r = await sb.functions.invoke("analyze-link", { body: { url } });
  console.log(r.error ? `ERR ${r.error.message}` : `${r.data.duplicate ? "dup" : "ok"} ${((Date.now() - t0) / 1000).toFixed(1)}s  ${r.data.item?.title}`);
}

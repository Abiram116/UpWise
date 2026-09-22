// Sets (or changes) the app's unlock PIN by deriving a new Supabase password from it and
// rotating the built-in account to match. Must be signed in already (uses the current session
// or falls back to prompting), since Supabase requires an authenticated user to change their
// own password via the self-service API (no service-role key needed or used).
//
// Usage: node scripts/set-pin.mjs <new-pin>
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const PIN_SALT = "upwise-v1-pin-salt"; // must match src/lib/pin.ts exactly — not secret, just consistent

const pin = process.argv[2];
if (!pin) { console.error("Usage: node scripts/set-pin.mjs <new-pin>"); process.exit(1); }

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split("=").map((s) => s.trim())),
);
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const email = process.env.UPWISE_EMAIL || env.VITE_APP_EMAIL;
const currentPassword = process.env.UPWISE_CURRENT_PASSWORD;
if (!currentPassword) {
  console.error("Set UPWISE_CURRENT_PASSWORD env var to your CURRENT pin's derived password (or current PIN's raw value if you know the derivation) to authenticate first.");
  console.error("Simplest: UPWISE_CURRENT_PASSWORD=$(node -e \"console.log(require('crypto').createHash('sha256').update('OLD_PIN:upwise-v1-pin-salt').digest('base64url'))\") node scripts/set-pin.mjs NEW_PIN");
  process.exit(1);
}
const signIn = await sb.auth.signInWithPassword({ email, password: currentPassword });
if (signIn.error) { console.error("sign-in with current PIN failed:", signIn.error.message); process.exit(1); }

const derived = createHash("sha256").update(`${pin}:${PIN_SALT}`, "utf8").digest("base64url");
const upd = await sb.auth.updateUser({ password: derived });
if (upd.error) { console.error("rotate failed:", upd.error.message); process.exit(1); }

await sb.auth.signOut();
const verify = await sb.auth.signInWithPassword({ email, password: derived });
console.log(verify.error ? `verify FAILED: ${verify.error.message}` : "PIN set and verified OK.");

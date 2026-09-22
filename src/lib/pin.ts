// Derives the Supabase account password from a user-entered PIN. Nothing here is secret —
// the salt doesn't need to be, and the whole point is that no actual password ever ships in
// the bundle. The only place a wrong guess can be checked is Supabase's own sign-in endpoint,
// which rate-limits repeated failures — unlike an offline check baked into the binary.
const PIN_SALT = "upwise-v1-pin-salt"; // must exactly match scripts/set-pin.mjs

export async function derivePassword(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${pin}:${PIN_SALT}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  let binary = "";
  for (const b of new Uint8Array(digest)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const PIN_LENGTH = 5;

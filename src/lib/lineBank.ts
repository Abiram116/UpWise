import { supabase } from "./supabase";
import type { CheerEvent } from "./api";

// Celebration lines without an AI call per celebration. One call writes a dozen lines for a kind
// of win into the database (owl_lines); the device keeps a copy and hands them out instantly —
// no waiting on the network while the card is up. When a kind runs low it's refilled in the
// background. If anything is missing (offline, new account, DB down), the caller falls back to
// its own built-in lines, so a celebration never depends on any of this.

type BankKind = "done" | "goal" | "streak" | "cleared";
type Bank = Partial<Record<BankKind, { id: number; line: string }[]>>;
const KEY = "upwise:owl-lines";
const REFILL_KEY = "upwise:owl-lines-refill";
const LOW = 3;
const REFILL_GAP_MS = 10 * 60_000;
const KINDS: BankKind[] = ["done", "goal", "streak", "cleared"];

const read = (): Bank => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Bank; } catch { return {}; } };
const write = (b: Bank) => { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* ignore */ } };

/** Fill {n} {minutes} {streak}; null if the line needs a number this win doesn't have. */
function fill(t: string, e: CheerEvent): string | null {
  const vals: Record<string, number | undefined> = {
    n: e.finished_today && e.finished_today > 1 ? e.finished_today : undefined,
    minutes: e.minutes, streak: e.streak,
  };
  let ok = true;
  const out = t.replace(/\{(\w+)\}/g, (_, k: string) => { const v = vals[k]; if (v == null) ok = false; return String(v ?? ""); });
  return ok ? out : null;
}

/** An unused banked line for this win, filled in — or null (use the built-in lines). Synchronous. */
export function takeLine(e: CheerEvent, recent: string[]): string | null {
  if (!KINDS.includes(e.kind as BankKind)) return null;
  const kind = e.kind as BankKind;
  const bank = read();
  const pool = bank[kind] ?? [];
  let picked: { id: number; text: string } | null = null;
  for (const l of pool) {
    const text = fill(l.line, e);
    if (text && !recent.includes(text)) { picked = { id: l.id, text }; break; }
  }
  if (picked) {
    bank[kind] = pool.filter((l) => l.id !== picked!.id);
    write(bank);
    const id = picked.id;
    void supabase.from("owl_lines").update({ used_at: new Date().toISOString() }).eq("id", id).then(() => {}, () => {});
  }
  if ((bank[kind]?.length ?? 0) < LOW) void refill(kind);
  return picked?.text ?? null;
}

async function refill(kind: BankKind) {
  try {
    const stamps = JSON.parse(localStorage.getItem(REFILL_KEY) ?? "{}") as Record<string, number>;
    if (Date.now() - (stamps[kind] ?? 0) < REFILL_GAP_MS) return;
    stamps[kind] = Date.now(); localStorage.setItem(REFILL_KEY, JSON.stringify(stamps));
    const { data, error } = await supabase.functions.invoke("coach", { body: { mode: "refill", kind } });
    if (error) return;
    const rows = (data as { lines?: { id: number; line: string }[] })?.lines ?? [];
    if (!rows.length) return;
    const bank = read();
    const have = new Set((bank[kind] ?? []).map((l) => l.id));
    bank[kind] = [...(bank[kind] ?? []), ...rows.filter((r) => !have.has(r.id))];
    write(bank);
  } catch { /* the built-in lines cover it */ }
}

/** On launch: mirror the unused lines from the database (another device may have used some). */
export async function syncLineBank() {
  try {
    if (!(await supabase.auth.getSession()).data.session) return;
    const { data, error } = await supabase.from("owl_lines").select("id, kind, line").is("used_at", null).order("id").limit(120);
    if (error || !data) return;
    const bank: Bank = {};
    for (const r of data as { id: number; kind: BankKind; line: string }[]) (bank[r.kind] ??= []).push({ id: r.id, line: r.line });
    write(bank);
  } catch { /* keep the local copy */ }
}

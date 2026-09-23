import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import { getPref, setPref } from "./store";
import { analyzeLink } from "./analyze";
import { connection } from "./connection";
import { isAuthError, isNetworkError } from "./errors";

// Every write that can't reach Supabase lands here, in order, and replays when the connection
// comes back. Ops are plain data so they survive the app being killed.
type Table = "items" | "profiles" | "learning_sessions";
export type OutboxOp =
  | { kind: "save"; url: string; note?: string; via: "paste" | "share" }
  | { kind: "insert"; table: Table; row: Record<string, unknown> & { id: string } }
  | { kind: "update"; table: Table; id: string; patch: Record<string, unknown> }
  | { kind: "delete"; table: Table; id: string };

const KEY = "outbox";
const LEGACY_KEY = "offlineQueue";

let ops: OutboxOp[] = [];
let loaded: Promise<void> | null = null;
const subs = new Set<() => void>();

function load() {
  loaded ??= (async () => {
    const [saved, legacy] = await Promise.all([
      getPref<OutboxOp[]>(KEY, []),
      getPref<{ url: string; note?: string; via: "paste" | "share" }[]>(LEGACY_KEY, []),
    ]);
    ops = [...saved, ...legacy.map((l) => ({ kind: "save" as const, url: l.url, note: l.note, via: l.via })), ...ops];
    if (legacy.length) { await setPref(LEGACY_KEY, []); await persist(); }
    subs.forEach((s) => s());
  })();
  return loaded;
}

async function persist() {
  await setPref(KEY, ops);
  subs.forEach((s) => s());
}

async function run(op: OutboxOp): Promise<void> {
  if (op.kind === "save") { await analyzeLink(op.url, { note: op.note, addedVia: op.via }); return; }
  const q = supabase.from(op.table);
  // Inserts use client-generated ids + ignoreDuplicates so a replay after an ambiguous
  // failure (request landed, response didn't) can't create a second row.
  const { error, status } =
    op.kind === "insert" ? await q.upsert(op.row, { onConflict: "id", ignoreDuplicates: true })
    : op.kind === "update" ? await q.update(op.patch).eq("id", op.id)
    : await q.delete().eq("id", op.id);
  if (error) throw Object.assign(error, { status });
}

export async function enqueue(op: OutboxOp): Promise<void> {
  await load();
  const last = ops[ops.length - 1];
  // Consecutive edits to the same row collapse into one request — unless that request is the
  // one in flight right now, in which case merging into it would silently drop the new patch.
  const lastInFlight = flushing !== null && ops.length === 1;
  if (op.kind === "update" && last?.kind === "update" && last.table === op.table && last.id === op.id && !lastInFlight) {
    last.patch = { ...last.patch, ...op.patch };
  } else ops.push(op);
  await persist();
}

/** Runs the write now if possible; otherwise queues it. Anything already queued goes first,
 * so ordering (start session → end session) always holds. Real server errors still throw. */
export async function writeOrQueue(op: OutboxOp): Promise<"done" | "queued"> {
  await load();
  if (ops.length || connection.get() !== "ok") {
    await enqueue(op);
    if (connection.get() === "ok") void flushOutbox();
    return "queued";
  }
  try {
    await run(op);
    connection.reportOk();
    return "done";
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    connection.reportError(e);
    await enqueue(op);
    return "queued";
  }
}

export interface FlushResult { done: number; saved: number; failed: number; remaining: number }
let flushing: Promise<FlushResult> | null = null;

/** Replays queued writes oldest-first. Stops at the first connectivity/auth failure (the rest
 * would fail the same way); drops ops the server rejects outright so one bad op can't wedge
 * the queue forever. */
export function flushOutbox(): Promise<FlushResult> {
  flushing ??= (async () => {
    await load();
    const r: FlushResult = { done: 0, saved: 0, failed: 0, remaining: 0 };
    while (ops.length) {
      const op = ops[0];
      try {
        await run(op);
        r.done++;
        if (op.kind === "save") r.saved++;
      } catch (e) {
        if (isNetworkError(e) || isAuthError(e)) { connection.reportError(e); break; }
        r.failed++;
      }
      ops.shift();
      await persist();
    }
    r.remaining = ops.length;
    if (r.done) connection.reportOk();
    return r;
  })().finally(() => { flushing = null; });
  return flushing;
}

export function pendingCount(): number { return ops.length; }

export function useOutboxCount(): number {
  return useSyncExternalStore(
    (l) => { subs.add(l); void load(); return () => { subs.delete(l); }; },
    () => ops.length,
  );
}

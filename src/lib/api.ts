import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { currentUserId, supabase } from "./supabase";
import { queryClient } from "./queryClient";
import { analyzeLink, lean } from "./analyze";
import { writeOrQueue } from "./outbox";
import { describeError } from "./errors";
import { useToast } from "../components/ui";
import type { Category, CoachResult, DailyActivity, Item, ItemStatus, LearningSession, Profile } from "./types";

export { analyzeLink, type AnalyzeStage } from "./analyze";

// Everything except `transcript` — that's up to 60KB per item and only the detail screen
// needs it, so it's fetched on demand by useItemTranscript.
const ITEM_COLUMNS = "id, url, canonical_url, source, external_id, title, description, channel, thumbnail_url, duration_seconds, has_transcript, category_id, tags, status, ai, relevance_score, estimated_minutes, notes, added_via, created_at, updated_at, started_at, completed_at";
const ITEM_SELECT = `${ITEM_COLUMNS}, category:categories(id, name, slug, color)`;

export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Unwraps a PostgREST response. The HTTP status rides along on the error because a paused
 * project answers with a bare 5xx/540 and no error code — errors.ts keys off that. */
function check<T>({ data, error, status }: { data: unknown; error: unknown; status: number }): T {
  if (error) throw Object.assign(error as object, { status });
  return data as T;
}

function patchItemsCache(id: string, patch: Partial<Item>) {
  queryClient.setQueryData<Item[]>(["items"], (old) => old?.map((i) => (i.id === id ? { ...i, ...patch } : i)));
}

// ---------- profile ----------
export function useProfile(enabled = true) {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async (): Promise<Profile> => {
      return check<Profile>(await supabase.from("profiles").select("*").single());
    },
    staleTime: 60_000,
    enabled,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Profile>) => {
      const prev = qc.getQueryData<Profile>(["profile"]);
      if (prev) qc.setQueryData<Profile>(["profile"], { ...prev, ...patch });
      try {
        await writeOrQueue({ kind: "update", table: "profiles", id: currentUserId(), patch });
      } catch (e) {
        if (prev) qc.setQueryData(["profile"], prev);
        throw e;
      }
      return qc.getQueryData<Profile>(["profile"])!;
    },
  });
}

// ---------- items ----------
export function useItems() {
  return useQuery({
    queryKey: ["items"],
    queryFn: async (): Promise<Item[]> => {
      return check<Item[]>(await supabase.from("items").select(ITEM_SELECT).order("created_at", { ascending: false }));
    },
    staleTime: 30_000,
  });
}

export function useItem(id: string | undefined) {
  const items = useItems();
  return { ...items, data: items.data?.find((i) => i.id === id) };
}

export function useItemTranscript(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["transcript", id],
    queryFn: async (): Promise<string | null> => {
      return check<{ transcript: string | null }>(await supabase.from("items").select("transcript").eq("id", id!).single()).transcript;
    },
    enabled: !!id && enabled,
    staleTime: Infinity,
    // Not worth persisting to disk: big, and only useful on the one screen that asked for it.
    meta: { persist: false },
  });
}

/** Ids of items whose transcript mentions `q`. Searched server-side so the list never has
 * to carry transcripts; offline it simply returns nothing and title/concept search still works. */
export function useTranscriptSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ["transcript-search", term.toLowerCase()],
    queryFn: async (): Promise<Set<string>> => {
      const escaped = term.replace(/[\\%_]/g, (c) => `\\${c}`);
      const rows = check<{ id: string }[]>(await supabase.from("items").select("id").ilike("transcript", `%${escaped}%`).limit(100));
      return new Set(rows.map((r) => r.id));
    },
    enabled: term.length >= 3,
    staleTime: 60_000,
    retry: false,
    meta: { persist: false },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async (): Promise<Category[]> => {
      return check<Category[]>(await supabase.from("categories").select("id, name, slug, color").order("name"));
    },
    staleTime: 60_000,
  });
}

/** Optimistic: the cache updates immediately and the write either lands now or waits in the
 * outbox. Only a real server rejection rolls it back. */
export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Item> & { id: string }) => {
      const { category: _c, transcript: _t, ...clean } = patch as Partial<Item>;
      await writeOrQueue({ kind: "update", table: "items", id, patch: clean });
    },
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: ["items"] });
      const prev = qc.getQueryData<Item[]>(["items"]);
      const cats = qc.getQueryData<Category[]>(["categories"]);
      const category = "category_id" in patch ? cats?.find((c) => c.id === patch.category_id) ?? null : undefined;
      patchItemsCache(id, category === undefined ? patch : { ...patch, category });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["items"], ctx.prev),
    // Moving the last item out of an area deletes that area server-side — refresh the list.
    onSuccess: (_d, v) => { if ("category_id" in v) void qc.invalidateQueries({ queryKey: ["categories"] }); },
  });
}

export function statusPatch(status: ItemStatus, item?: Pick<Item, "started_at">): Partial<Item> {
  const now = new Date().toISOString();
  const patch: Partial<Item> = { status };
  if (status === "in_progress") patch.started_at = item?.started_at ?? now;
  if (status === "completed") patch.completed_at = now;
  if (status === "inbox" || status === "queued") patch.completed_at = null;
  return patch;
}

export function useSetStatus() {
  const update = useUpdateItem();
  return (id: string, status: ItemStatus) => update.mutateAsync({ id, ...statusPatch(status) });
}

/** Hides the item immediately and only actually deletes it a few seconds later, so a mis-tap
 * is recoverable via the toast's Undo action instead of being instantly permanent. */
export function useDeleteItemWithUndo() {
  const qc = useQueryClient();
  const toast = useToast();
  return (item: Item) => {
    const restore = () => qc.setQueryData<Item[]>(["items"], (old) => (old && !old.some((i) => i.id === item.id) ? [item, ...old] : old));
    qc.setQueryData<Item[]>(["items"], (old) => old?.filter((i) => i.id !== item.id));
    const timer = window.setTimeout(async () => {
      try {
        await writeOrQueue({ kind: "delete", table: "items", id: item.id });
        void qc.invalidateQueries({ queryKey: ["categories"] }); // may have emptied an area
      } catch (e) {
        restore();
        toast(`Couldn't delete — ${describeError(e).message}`);
      }
    }, 4000);
    toast("Deleted", { label: "Undo", onClick: () => { window.clearTimeout(timer); restore(); } });
  };
}

export function useAnalyze() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: Parameters<typeof analyzeLink>) => analyzeLink(...vars),
    onSuccess: ({ item, duplicate }) => {
      if (!duplicate) {
        const row = lean(item);
        qc.setQueryData<Item[]>(["items"], (old) => (old ? [row, ...old.filter((i) => i.id !== row.id)] : [row]));
        qc.invalidateQueries({ queryKey: ["categories"] });
        qc.removeQueries({ queryKey: ["transcript", item.id] });
      }
    },
  });
}

// ---------- sessions & activity ----------
export function useActivity(days = 90) {
  return useQuery({
    queryKey: ["activity", days],
    queryFn: async (): Promise<DailyActivity[]> => {
      const since = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
      return check<DailyActivity[]>(await supabase.from("daily_activity").select("day, seconds, completed, added").gte("day", since).order("day"));
    },
    staleTime: 60_000,
  });
}

export function useSessions(days = 30) {
  return useQuery({
    queryKey: ["sessions", days],
    queryFn: async (): Promise<LearningSession[]> => {
      const since = new Date(Date.now() - days * 86400e3).toISOString();
      return check<LearningSession[]>(await supabase.from("learning_sessions").select("*").gte("started_at", since).order("started_at", { ascending: false }));
    },
    staleTime: 60_000,
  });
}

/** Refreshes everything derived from sessions/items after time was logged. */
export function invalidateProgress() {
  for (const key of ["items", "activity", "sessions"]) void queryClient.invalidateQueries({ queryKey: [key] });
}

// Session rows get client-side ids so a session started offline can be ended offline too —
// the insert and the update just queue up in order.
export async function startSession(itemId: string): Promise<LearningSession> {
  const s: LearningSession = { id: newId(), item_id: itemId, started_at: new Date().toISOString(), ended_at: null, seconds: 0 };
  await writeOrQueue({ kind: "insert", table: "learning_sessions", row: { ...s, user_id: currentUserId() } });
  return s;
}

export async function endSession(id: string, startedAt: string, capSeconds?: number): Promise<void> {
  let seconds = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
  if (capSeconds) seconds = Math.min(seconds, capSeconds);
  await writeOrQueue({ kind: "update", table: "learning_sessions", id, patch: { ended_at: new Date().toISOString(), seconds } });
}

export async function logManualMinutes(itemId: string | null, minutes: number): Promise<void> {
  const now = Date.now();
  await writeOrQueue({
    kind: "insert", table: "learning_sessions",
    row: { id: newId(), user_id: currentUserId(), item_id: itemId, started_at: new Date(now - minutes * 60000).toISOString(), ended_at: new Date(now).toISOString(), seconds: minutes * 60 },
  });
}

/** Applies a status change to an item from outside React (session start/stop). */
export async function setItemStatus(itemId: string, status: ItemStatus): Promise<void> {
  const item = queryClient.getQueryData<Item[]>(["items"])?.find((i) => i.id === itemId);
  const patch = statusPatch(status, item);
  patchItemsCache(itemId, patch);
  await writeOrQueue({ kind: "update", table: "items", id: itemId, patch });
}

// ---------- coach ----------
export async function fetchCoach(availableMinutes?: number, previousPickId?: string | null): Promise<CoachResult> {
  const res = await supabase.functions.invoke("coach", {
    body: { available_minutes: availableMinutes ?? null, local_hour: new Date().getHours(), previous_pick_id: previousPickId ?? null },
  });
  if (res.error) throw res.error;
  return { ...(res.data as CoachResult), fetched_at: Date.now() };
}

// ---------- notifications log (analytics only — never worth surfacing a failure) ----------
export async function logNotification(entry: { item_id?: string | null; kind: string; title: string; body: string; scheduled_for?: string }) {
  try { await supabase.from("notifications_log").insert({ user_id: currentUserId(), ...entry }); } catch { /* best-effort */ }
}

export async function markNotificationOpened(title: string) {
  try {
    await supabase.from("notifications_log").update({ opened_at: new Date().toISOString() })
      .eq("user_id", currentUserId()).eq("title", title).is("opened_at", null)
      .order("created_at", { ascending: false }).limit(1);
  } catch { /* best-effort */ }
}

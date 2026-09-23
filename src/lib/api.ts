import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { isTauri } from "./platform";
import { youtubeId } from "./utils";
import { useToast } from "../components/ui";
import type { Category, CoachResult, DailyActivity, Item, ItemStatus, LearningSession, Profile } from "./types";

const ITEM_SELECT = "*, category:categories(id, name, slug, color)";

// ---------- profile ----------
export function useProfile(enabled = true) {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from("profiles").select("*").single();
      if (error) throw error;
      return data as Profile;
    },
    staleTime: 60_000,
    enabled,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Profile>) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("profiles").update(patch).eq("id", auth.user!.id).select("*").single();
      if (error) throw error;
      return data as Profile;
    },
    onSuccess: (p) => qc.setQueryData(["profile"], p),
  });
}

// ---------- items ----------
export function useItems() {
  return useQuery({
    queryKey: ["items"],
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await supabase.from("items").select(ITEM_SELECT).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
    staleTime: 30_000,
  });
}

export function useItem(id: string | undefined) {
  const items = useItems();
  return { ...items, data: items.data?.find((i) => i.id === id) };
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from("categories").select("id, name, slug, color").order("name");
      if (error) throw error;
      return data as Category[];
    },
    staleTime: 60_000,
  });
}

/** Moves every item from one category to another, then deletes the now-empty source category.
 * For when the AI has ended up creating two categories that really mean the same thing. */
export function useMergeCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fromId, toId }: { fromId: string; toId: string }) => {
      const { data: toCat, error: catErr } = await supabase.from("categories").select("id, name, slug, color").eq("id", toId).single();
      if (catErr) throw catErr;
      const { error: moveErr } = await supabase.from("items").update({ category_id: toId }).eq("category_id", fromId);
      if (moveErr) throw moveErr;
      const { error: delErr } = await supabase.from("categories").delete().eq("id", fromId);
      if (delErr) throw delErr;
      return toCat as Category;
    },
    onSuccess: (toCat, { fromId }) => {
      qc.setQueryData<Category[]>(["categories"], (old) => old?.filter((c) => c.id !== fromId));
      qc.setQueryData<Item[]>(["items"], (old) => old?.map((i) => (i.category_id === fromId ? { ...i, category_id: toCat.id, category: toCat } : i)));
    },
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Item> & { id: string }) => {
      const { category: _c, ...clean } = patch as Partial<Item>;
      const { data, error } = await supabase.from("items").update(clean).eq("id", id).select(ITEM_SELECT).single();
      if (error) throw error;
      return data as Item;
    },
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: ["items"] });
      const prev = qc.getQueryData<Item[]>(["items"]);
      qc.setQueryData<Item[]>(["items"], (old) => old?.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["items"], ctx.prev),
    onSuccess: (item) => qc.setQueryData<Item[]>(["items"], (old) => old?.map((i) => (i.id === item.id ? item : i))),
  });
}

export function useSetStatus() {
  const update = useUpdateItem();
  return (id: string, status: ItemStatus) => {
    const patch: Partial<Item> & { id: string } = { id, status };
    const now = new Date().toISOString();
    if (status === "in_progress") patch.started_at = now;
    if (status === "completed") patch.completed_at = now;
    if (status === "inbox" || status === "queued") { patch.completed_at = null; }
    return update.mutateAsync(patch);
  };
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => qc.setQueryData<Item[]>(["items"], (old) => old?.filter((i) => i.id !== id)),
  });
}

/** Hides the item immediately and only actually deletes it a few seconds later, so a mis-tap
 * is recoverable via the toast's Undo action instead of being instantly permanent. */
export function useDeleteItemWithUndo() {
  const qc = useQueryClient();
  const toast = useToast();
  return (item: Item) => {
    qc.setQueryData<Item[]>(["items"], (old) => old?.filter((i) => i.id !== item.id));
    const timer = window.setTimeout(async () => {
      const { error } = await supabase.from("items").delete().eq("id", item.id);
      if (error) qc.setQueryData<Item[]>(["items"], (old) => (old ? [item, ...old] : old));
    }, 4000);
    toast("Deleted", { label: "Undo", onClick: () => { window.clearTimeout(timer); qc.setQueryData<Item[]>(["items"], (old) => (old ? [item, ...old] : old)); } });
  };
}

// ---------- analyze (Rust transcript + edge function) ----------
export type AnalyzeStage = "transcript" | "metadata" | "thinking" | "saving";

export interface TranscriptResult {
  transcript: string | null;
  status: string;
  title: string | null;
  channel: string | null;
  duration_seconds: number | null;
}

export async function analyzeLink(
  url: string,
  opts: { note?: string; addedVia?: "paste" | "share"; onStage?: (s: AnalyzeStage) => void; reanalyzeId?: string } = {},
): Promise<{ item: Item; duplicate: boolean; ai_error: string | null }> {
  let transcript: string | undefined;
  const vid = youtubeId(url);
  if (vid && isTauri) {
    opts.onStage?.("transcript");
    try {
      const r = await invoke<TranscriptResult>("fetch_youtube_transcript", { videoId: vid });
      if (r.transcript) transcript = r.transcript;
    } catch { /* fall back to server attempt */ }
  }
  opts.onStage?.("metadata");
  const stageTimer = setTimeout(() => opts.onStage?.("thinking"), 1500);
  const res = await supabase.functions.invoke("analyze-link", {
    body: { url, note: opts.note, added_via: opts.addedVia ?? "paste", transcript, reanalyze_id: opts.reanalyzeId },
  });
  clearTimeout(stageTimer);
  if (res.error) {
    let msg = res.error.message;
    try { const j = await res.error.context?.json?.(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  opts.onStage?.("saving");
  const data = res.data as { item: Item; duplicate?: boolean; ai_error?: string | null };
  return { item: data.item, duplicate: !!data.duplicate, ai_error: data.ai_error ?? null };
}

export function useAnalyze() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: Parameters<typeof analyzeLink>) => analyzeLink(...vars),
    onSuccess: ({ item, duplicate }) => {
      if (!duplicate) {
        qc.setQueryData<Item[]>(["items"], (old) => (old ? [item, ...old.filter((i) => i.id !== item.id)] : [item]));
        qc.invalidateQueries({ queryKey: ["categories"] });
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
      const { data, error } = await supabase.from("daily_activity").select("day, seconds, completed, added").gte("day", since).order("day");
      if (error) throw error;
      return data as DailyActivity[];
    },
    staleTime: 60_000,
  });
}

export function useSessions(days = 30) {
  return useQuery({
    queryKey: ["sessions", days],
    queryFn: async (): Promise<LearningSession[]> => {
      const since = new Date(Date.now() - days * 86400e3).toISOString();
      const { data, error } = await supabase.from("learning_sessions").select("*").gte("started_at", since).order("started_at", { ascending: false });
      if (error) throw error;
      return data as LearningSession[];
    },
    staleTime: 60_000,
  });
}

export async function startSession(itemId: string): Promise<LearningSession> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("learning_sessions")
    .insert({ user_id: auth.user!.id, item_id: itemId }).select("*").single();
  if (error) throw error;
  return data as LearningSession;
}

export async function endSession(id: string, startedAt: string, capSeconds?: number): Promise<void> {
  let seconds = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
  if (capSeconds) seconds = Math.min(seconds, capSeconds);
  const { error } = await supabase.from("learning_sessions")
    .update({ ended_at: new Date().toISOString(), seconds }).eq("id", id);
  if (error) throw error;
}

export async function logManualMinutes(itemId: string | null, minutes: number): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const started = new Date(Date.now() - minutes * 60000).toISOString();
  const { error } = await supabase.from("learning_sessions")
    .insert({ user_id: auth.user!.id, item_id: itemId, started_at: started, ended_at: new Date().toISOString(), seconds: minutes * 60 });
  if (error) throw error;
}

// ---------- coach ----------
export async function fetchCoach(availableMinutes?: number): Promise<CoachResult> {
  const res = await supabase.functions.invoke("coach", {
    body: { available_minutes: availableMinutes ?? null, local_hour: new Date().getHours() },
  });
  if (res.error) throw new Error(res.error.message);
  return { ...(res.data as CoachResult), fetched_at: Date.now() };
}

// ---------- notifications log ----------
export async function logNotification(entry: { item_id?: string | null; kind: string; title: string; body: string; scheduled_for?: string }) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await supabase.from("notifications_log").insert({ user_id: auth.user.id, ...entry });
}

export async function markNotificationOpened(title: string) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await supabase.from("notifications_log").update({ opened_at: new Date().toISOString() })
    .eq("user_id", auth.user.id).eq("title", title).is("opened_at", null)
    .order("created_at", { ascending: false }).limit(1);
}

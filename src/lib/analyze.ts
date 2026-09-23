import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { isTauri } from "./platform";
import { youtubeId } from "./utils";
import type { Item } from "./types";

export type AnalyzeStage = "transcript" | "metadata" | "thinking" | "saving";

interface TranscriptResult {
  transcript: string | null;
  status: string;
  title: string | null;
  channel: string | null;
  duration_seconds: number | null;
}

/** The list cache never carries transcripts (they're up to 60KB each) — strip it from
 * anything that's about to be put there. */
export function lean(item: Item): Item {
  const { transcript: _t, ...rest } = item;
  return rest as Item;
}

export async function analyzeLink(
  url: string,
  opts: { note?: string; addedVia?: "paste" | "share"; onStage?: (s: AnalyzeStage) => void; reanalyzeId?: string } = {},
): Promise<{ item: Item; duplicate: boolean; ai_error: string | null }> {
  let transcript: string | undefined;
  const vid = youtubeId(url);
  // YouTube bot-checks datacenter IPs, so the transcript has to come from the device.
  if (vid && isTauri) {
    opts.onStage?.("transcript");
    try {
      const r = await invoke<TranscriptResult>("fetch_youtube_transcript", { videoId: vid });
      if (r.transcript) transcript = r.transcript;
    } catch { /* the server still has metadata + description to work from */ }
  }
  opts.onStage?.("metadata");
  const stageTimer = setTimeout(() => opts.onStage?.("thinking"), 1500);
  try {
    const res = await supabase.functions.invoke("analyze-link", {
      body: { url, note: opts.note, added_via: opts.addedVia ?? "paste", transcript, reanalyze_id: opts.reanalyzeId },
    });
    if (res.error) {
      // A non-2xx carries the function's own human-written message; surface that instead of
      // supabase-js's generic "Edge Function returned a non-2xx status code".
      const ctx = (res.error as { context?: Response }).context;
      let msg = res.error.message;
      let own = false;
      try { const j = await ctx?.clone().json(); if (j?.error) { msg = j.error; own = true; } } catch { /* keep generic */ }
      // The function's own error message is a real answer (bad link, AI failed) even on a 5xx;
      // only a bare 5xx with no body of ours means the backend itself is down or paused.
      throw Object.assign(new Error(msg), { name: res.error.name, status: own ? undefined : ctx?.status });
    }
    opts.onStage?.("saving");
    const data = res.data as { item: Item; duplicate?: boolean; ai_error?: string | null };
    return { item: data.item, duplicate: !!data.duplicate, ai_error: data.ai_error ?? null };
  } finally {
    clearTimeout(stageTimer);
  }
}

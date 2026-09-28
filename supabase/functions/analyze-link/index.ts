import { AuthError, corsHeaders, json, userClient } from "../_shared/auth.ts";
import { classifyPage, fetchArticle, fetchInstagram, fetchYouTube, type LinkMeta, parseLink } from "../_shared/links.ts";
import { groqJson, groqTranscribe } from "../_shared/groq.ts";

const MAX_VIDEO_BYTES = 20_000_000; // Groq's transcription upload cap is 25MB; leave headroom.

async function tryTranscribeInstagram(meta: LinkMeta): Promise<void> {
  if (!meta.videoUrl) return;
  try {
    const r = await fetch(meta.videoUrl);
    if (!r.ok || !r.body) { meta.transcriptStatus = `video_fetch_failed:${r.status}`; return; }
    const len = Number(r.headers.get("content-length") ?? "0");
    if (len > MAX_VIDEO_BYTES) { meta.transcriptStatus = "video_too_large"; return; }
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_VIDEO_BYTES) { meta.transcriptStatus = "video_too_large"; return; }
    meta.transcript = await groqTranscribe(buf, "reel.mp4");
    meta.transcriptStatus = "whisper_ok";
  } catch (e) {
    meta.transcriptStatus = `whisper_failed:${(e as Error).message.slice(0, 60)}`;
  }
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

// Jaccard similarity on normalized word sets — cheap, no embeddings/extra API calls, good
// enough to catch "same video re-shared with a different link" or "same article, different URL".
function titleSimilarity(a: string, b: string): number {
  const wa = new Set(normalizeTitle(a).split(" ").filter(Boolean));
  const wb = new Set(normalizeTitle(b).split(" ").filter(Boolean));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / new Set([...wa, ...wb]).size;
}

interface Analysis {
  title: string;
  gist: string;
  key_concepts: string[];
  category: { name: string; slug: string };
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  relevance_score: number;
  estimated_minutes: number;
  segments: { start: string; end: string; label: string }[];
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "general";

// Category matching has to survive the AI phrasing the same area differently over months
// ("LLM", "LLMs", "Large Language Models", "Cloud and DevOps" vs "Cloud & DevOps") — compare a
// normalized key, not the raw slug, or the library slowly fills with near-duplicates.
const CATEGORY_ALIASES: Record<string, string> = {
  "language large model": "llm", "large language model": "llm", "augmented generation retrieval": "rag",
  "algorithm data structure": "dsa", "learning machine": "machine learning", "ml": "machine learning",
  "devop": "devops", "cloud devop": "cloud devops", "gen ai": "genai", "generative ai": "genai",
};
// Things a failed or lazy analysis tends to produce — never worth a category of their own.
const JUNK_CATEGORIES = new Set(["error", "unknown", "other", "misc", "miscellaneous", "general", "uncategorized", "none", "na", "n a", "various", "random"]);
function categoryKey(name: string): string {
  const words = name.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, " ").trim().split(" ")
    .filter((w) => w && w !== "and" && w !== "the")
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .sort().join(" ");
  return CATEGORY_ALIASES[words] ?? words;
}

const clamp = (n: unknown, lo: number, hi: number, dflt: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt;
};

function buildPrompt(meta: LinkMeta, note: string | undefined, goal: string, interests: string[],
  categories: { name: string; slug: string; uses: number }[]) {
  // Lean on purpose: the app shows a title, one line and a few chips. Every field not shown is
  // tokens (and rate limit) spent for nothing.
  const system = `You triage saved learning content for a final-year B.Tech student aiming for "${goal}" (interests: ${interests.join(", ") || "not specified"}).
Return STRICT JSON only:
{
  "title": "clean, specific title — no clickbait, no emojis, <=80 chars",
  "gist": "ONE plain line, <=110 chars: what you actually get from it",
  "key_concepts": ["3-5 concrete concepts/tools"],
  "category": {"name": "Area Name", "slug": "area-name"},
  "tags": ["<=5 lowercase tags"],
  "difficulty": "beginner|intermediate|advanced",
  "relevance_score": 1-5,
  "estimated_minutes": number,
  "segments": [{"start":"mm:ss","end":"mm:ss","label":"<=6 words"}]
}
Rules:
- category = the learning AREA (broad: "LLMs", "Docker", "DSA", "System Design", "Career"), never this item's specific topic. Existing areas, most used first: ${categories.map((c) => `${c.name} (${c.slug}, ${c.uses})`).join(", ") || "none yet"}. Reuse one whenever it reasonably fits.${categories.length >= 10 ? " There are many already: strongly prefer an existing one." : ""} Never a synonym of an existing area; never "General", "Other" or "Error".
- estimated_minutes = realistic time to learn it (skip intros/sponsors). Shorts and reels are 1-3.
- segments only for videos over 10 minutes with a transcript and clearly distinct parts, max 5. Otherwise [].
- If there's little to go on (login-walled reel, no transcript), infer from title/note, keep relevance_score low, don't invent details.`;

  const parts: string[] = [];
  parts.push(`SOURCE: ${meta.source}\nURL: ${meta.canonicalUrl}`);
  if (meta.title) parts.push(`TITLE: ${meta.title}`);
  if (meta.channel) parts.push(`CHANNEL/AUTHOR: ${meta.channel}`);
  if (meta.durationSeconds) parts.push(`DURATION: ${Math.round(meta.durationSeconds / 60)} min`);
  if (meta.tags.length) parts.push(`CREATOR TAGS: ${meta.tags.join(", ")}`);
  if (note) parts.push(`USER NOTE: ${note}`);
  if (meta.description) parts.push(`DESCRIPTION:\n${meta.description.slice(0, 2500)}`);
  // ~2.5k tokens of source is plenty for a title-and-gist triage; the start and end of a long
  // transcript carry the intro (what it's about) and the wrap-up (what it concluded).
  const text = meta.transcript ?? meta.content;
  if (text) parts.push(`${meta.transcript ? "TRANSCRIPT" : "CONTENT"} (excerpt):\n${text.length > 10_000 ? `${text.slice(0, 7_500)}\n[…]\n${text.slice(-2_500)}` : text}`);
  else parts.push("NO TRANSCRIPT/CONTENT AVAILABLE.");
  return { system, user: parts.join("\n\n") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { supabase, user } = await userClient(req);
    const body = await req.json().catch(() => ({}));
    const rawUrl: string | undefined = body.url;
    const note: string | undefined = body.note?.trim() || undefined;
    const addedVia: string = body.added_via === "share" ? "share" : "paste";
    if (!rawUrl) return json({ error: "url required" }, 400);

    const parsed = parseLink(rawUrl);
    const reanalyzeId: string | undefined = typeof body.reanalyze_id === "string" ? body.reanalyze_id : undefined;

    const { data: existing } = await supabase.from("items").select("id, title, status, ai")
      .eq("canonical_url", parsed.canonicalUrl).maybeSingle();
    if (existing && existing.id !== reanalyzeId) return json({ duplicate: true, item: existing });

    const [profileRes, catRes] = await Promise.all([
      supabase.from("profiles").select("goal, interests").eq("id", user.id).single(),
      // With usage counts, so the prompt can offer the areas you actually use first.
      supabase.from("categories").select("id, name, slug, items(count)"),
    ]);
    const goal = profileRes.data?.goal ?? "AI Engineer";
    const interests: string[] = profileRes.data?.interests ?? [];
    const categories = ((catRes.data ?? []) as { id: string; name: string; slug: string; items: { count: number }[] }[])
      .map((c) => ({ id: c.id, name: c.name, slug: c.slug, uses: c.items?.[0]?.count ?? 0 }))
      .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));

    // YouTube bot-checks datacenter IPs, so the app fetches the transcript from the device and sends it along.
    const clientTranscript: string | undefined =
      typeof body.transcript === "string" && body.transcript.length > 50 ? body.transcript.slice(0, 60_000) : undefined;

    let meta: LinkMeta;
    if (parsed.source === "youtube") {
      meta = await fetchYouTube(parsed.externalId!, Deno.env.get("YOUTUBE_API_KEY"), !!clientTranscript);
      if (clientTranscript) { meta.transcript = clientTranscript; meta.transcriptStatus = "client"; }
    } else if (parsed.source === "instagram") {
      meta = await fetchInstagram(parsed.canonicalUrl, parsed.externalId);
      await tryTranscribeInstagram(meta);
    }
    else meta = await fetchArticle(parsed.canonicalUrl);

    // What is it? Shorts/reels/posts/videos come from the URL and length; everything else is
    // an article worth reading, or a plain link (site, tool, repo) that's just kept, no AI.
    const rawPath = (() => { try { return new URL(rawUrl).pathname; } catch { return ""; } })();
    const mode: "learn" | "link" | undefined = body.mode === "learn" || body.mode === "link" ? body.mode : undefined;
    meta.format = parsed.source === "youtube"
      ? (/^\/shorts\//.test(rawPath) || (meta.durationSeconds != null && meta.durationSeconds <= 180) ? "short" : "video")
      : parsed.source === "instagram" ? (/^\/p\//.test(rawPath) ? "post" : "reel")
      : mode === "learn" ? "article" : mode === "link" ? "link" : classifyPage(meta);
    const isLink = meta.format === "link";

    // A re-analyze that comes back with absolutely nothing (no title, no thumbnail, no
    // content) for a link that previously had real data is the strongest signal available
    // that it's been deleted/removed — skip the pointless Groq call and say so plainly.
    const seemsDead = !!reanalyzeId && !isLink && !meta.title && !meta.thumbnailUrl && !meta.transcript && !meta.content;

    let ai: Partial<Analysis> & { model?: string; error?: string } = {};
    if (isLink) {
      // Kept as a bookmark: title/description/thumbnail from the page itself is all it needs.
    } else if (seemsDead) {
      ai = { error: "This link looks like it's been removed or is no longer accessible." };
    } else {
      try {
        const { system, user: userMsg } = buildPrompt(meta, note, goal, interests, categories);
        ai = await groqJson<Analysis>({ job: "analyze", system, user: userMsg, maxTokens: 700 });
      } catch (e) {
        ai = { error: (e as Error).message };
      }
    }

    // Only for fresh saves — re-analyzing an item obviously shouldn't flag itself as a
    // duplicate of itself. Catches the case exact-canonical-URL matching above can't: the
    // same video/article re-shared under a different link.
    let possibleDuplicate: { id: string; title: string } | null = null;
    const candidateTitle = ai.title || meta.title || "";
    if (!reanalyzeId && candidateTitle && !isLink) {
      const { data: candidates } = await supabase.from("items")
        .select("id, title, channel, duration_seconds")
        .eq("source", parsed.source).not("title", "is", null).limit(500);
      let best: { id: string; title: string; score: number } | null = null;
      for (const c of candidates ?? []) {
        const score = titleSimilarity(candidateTitle, c.title ?? "");
        const channelOk = !meta.channel || !c.channel || meta.channel.toLowerCase() === c.channel.toLowerCase();
        const durationOk = !meta.durationSeconds || !c.duration_seconds ||
          Math.abs(meta.durationSeconds - c.duration_seconds) < Math.max(15, meta.durationSeconds * 0.15);
        if (score >= 0.55 && channelOk && durationOk && (!best || score > best.score)) {
          best = { id: c.id, title: c.title, score };
        }
      }
      if (best) possibleDuplicate = { id: best.id, title: best.title };
    }

    let categoryId: string | null = null;
    const proposed = !ai.error && !isLink ? String(ai.category?.name ?? "").trim() : "";
    if (proposed && !JUNK_CATEGORIES.has(categoryKey(proposed))) {
      const slug = slugify(ai.category!.slug || proposed);
      const key = categoryKey(proposed);
      const match = categories.find((c) => c.slug === slug) ?? categories.find((c) => categoryKey(c.name) === key);
      if (match) categoryId = match.id;
      else {
        const { data: created } = await supabase.from("categories")
          .upsert({ user_id: user.id, name: proposed.slice(0, 40), slug }, { onConflict: "user_id,slug" })
          .select("id").single();
        categoryId = created?.id ?? null;
      }
    }

    const fallbackMinutes = meta.durationSeconds ? Math.max(1, Math.round(meta.durationSeconds / 60)) : 10;
    const refreshed = {
      canonical_url: meta.canonicalUrl,
      source: meta.source,
      external_id: meta.externalId,
      title: (ai.title || meta.title || note || meta.canonicalUrl).slice(0, 200),
      description: meta.description,
      channel: meta.channel,
      thumbnail_url: meta.thumbnailUrl,
      duration_seconds: meta.durationSeconds,
      // The text we read (transcript, or article body) — kept for full-text search. Only real
      // spoken transcripts count as "has transcript"; articles aren't shown one.
      transcript: isLink ? null : meta.transcript ?? meta.content,
      has_transcript: !!meta.transcript,
      // A re-analysis that couldn't settle on a category keeps the one the item already has.
      ...(categoryId || !reanalyzeId ? { category_id: categoryId } : {}),
      tags: (ai.tags ?? []).slice(0, 8).map((t) => String(t).toLowerCase().slice(0, 30)),
      ai: {
        format: meta.format,
        summary: ai.gist ?? null,
        key_concepts: (ai.key_concepts ?? []).slice(0, 5),
        difficulty: ai.difficulty ?? null,
        segments: meta.format === "video" ? (ai.segments ?? []).slice(0, 5) : [],
        model: ai.model ?? null,
        error: ai.error ?? null,
        transcript_status: meta.transcriptStatus ?? null,
        possible_duplicate: possibleDuplicate,
      },
      relevance_score: ai.relevance_score ? clamp(ai.relevance_score, 1, 5, 3) : null,
      estimated_minutes: isLink ? null : clamp(ai.estimated_minutes, 1, 600, fallbackMinutes),
    };

    // Re-analyzing an existing item refreshes its content without resetting its status/progress
    // (an already-completed item shouldn't jump back to "inbox" just because you asked for a
    // fresh take on it) or its saved note. A link that seems dead is the one exception — don't
    // blow away the item's good historical title/thumbnail with empty fallback values, just
    // record that it couldn't be read this time.
    const { error: insertErr, data: item } = reanalyzeId
      ? await supabase.from("items")
        .update(seemsDead ? { ai: { ...(existing?.ai ?? {}), error: ai.error } }
          : { ...refreshed, ...(mode === "link" ? { status: "saved" } : mode === "learn" ? { status: "inbox" } : {}) })
        .eq("id", reanalyzeId)
        .select("*, category:categories(id, name, slug, color)").single()
      : await supabase.from("items").insert({
        user_id: user.id, url: rawUrl.trim(), status: isLink ? "saved" : "inbox", notes: note ?? null, added_via: addedVia, ...refreshed,
      }).select("*, category:categories(id, name, slug, color)").single();

    if (insertErr) return json({ error: insertErr.message }, 500);
    return json({ item, ai_error: ai.error ?? null });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    return json({ error: (e as Error).message }, 400);
  }
});

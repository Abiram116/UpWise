import { AuthError, corsHeaders, json, userClient } from "../_shared/auth.ts";
import { fetchArticle, fetchInstagram, fetchYouTube, type LinkMeta, parseLink } from "../_shared/links.ts";
import { groqJson, groqTranscribe, MODELS } from "../_shared/groq.ts";

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

interface Analysis {
  title: string;
  summary: string;
  key_concepts: string[];
  category: { name: string; slug: string };
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  prerequisites: string[];
  relevance_score: number;
  why_it_matters: string;
  estimated_minutes: number;
  takeaway: string | null;
  segments: { start: string; end: string; label: string }[];
  resources: { title: string; url: string }[];
  overlap: string | null;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "general";

const clamp = (n: unknown, lo: number, hi: number, dflt: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt;
};

function buildPrompt(meta: LinkMeta, note: string | undefined, goal: string, interests: string[],
  categories: { name: string; slug: string }[], recentTitles: string[]) {
  const system = `You are UpWise, a learning coach for a final-year B.Tech student whose goal is: "${goal}".
Their interests: ${interests.join(", ") || "not specified"}.
You analyze saved content (YouTube videos, reels, articles) and return STRICT JSON only, matching this schema:
{
  "title": "clean title without clickbait or emojis",
  "summary": "2-3 plain sentences: what it teaches and how",
  "key_concepts": ["3-6 concrete concepts/tools covered"],
  "category": {"name": "Short Category Name", "slug": "short-category-name"},
  "tags": ["<=6 lowercase tags"],
  "difficulty": "beginner|intermediate|advanced",
  "prerequisites": ["0-3 things they should already know"],
  "relevance_score": 1-5,
  "why_it_matters": "one sentence tying this to the goal (interviews, portfolio, real skills). Be honest if it's low value.",
  "estimated_minutes": number,
  "takeaway": "If the transcript alone teaches the point well enough to skip watching, write the 3-5 line lesson here. Otherwise null.",
  "segments": [{"start":"mm:ss","end":"mm:ss","label":"what this part covers"}],
  "resources": [{"title":"...","url":"..."}],
  "overlap": "If it duplicates or extends something already in the library, say which and how. Otherwise null."
}
Rules:
- Category: pick an existing one if it fits: ${categories.map((c) => `${c.name} (${c.slug})`).join(", ") || "none yet"}. Otherwise propose a new broad one (e.g. "RAG", "LLMs", "DSA", "System Design", "Cloud & DevOps", "Career", "Math for ML", "Python", "Frontend"). Never create near-duplicates.
- estimated_minutes = realistic time to actually learn from it (skip intros/sponsors), not the raw video length.
- segments only when a transcript exists and the content has clearly distinct parts. Max 5. Empty array otherwise.
- resources only for real URLs found in the text. Empty array otherwise.
- If the content is unclear (login-walled reel, no transcript), infer from title/note and lower confidence via relevance_score, do not invent details.`;

  const parts: string[] = [];
  parts.push(`SOURCE: ${meta.source}\nURL: ${meta.canonicalUrl}`);
  if (meta.title) parts.push(`TITLE: ${meta.title}`);
  if (meta.channel) parts.push(`CHANNEL/AUTHOR: ${meta.channel}`);
  if (meta.durationSeconds) parts.push(`DURATION: ${Math.round(meta.durationSeconds / 60)} min`);
  if (meta.tags.length) parts.push(`CREATOR TAGS: ${meta.tags.join(", ")}`);
  if (note) parts.push(`USER NOTE: ${note}`);
  if (meta.description) parts.push(`DESCRIPTION:\n${meta.description.slice(0, 2500)}`);
  if (meta.transcript) parts.push(`TRANSCRIPT (may be truncated):\n${meta.transcript.slice(0, 12_000)}`);
  else if (meta.content) parts.push(`CONTENT (may be truncated):\n${meta.content.slice(0, 12_000)}`);
  else parts.push("NO TRANSCRIPT/CONTENT AVAILABLE.");
  if (recentTitles.length) parts.push(`ALREADY IN LIBRARY (recent):\n- ${recentTitles.join("\n- ")}`);
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

    const { data: existing } = await supabase.from("items").select("id, title, status")
      .eq("canonical_url", parsed.canonicalUrl).maybeSingle();
    if (existing && existing.id !== reanalyzeId) return json({ duplicate: true, item: existing });

    const [profileRes, catRes, recentRes] = await Promise.all([
      supabase.from("profiles").select("goal, interests").eq("id", user.id).single(),
      supabase.from("categories").select("id, name, slug").order("name"),
      supabase.from("items").select("title").not("title", "is", null).order("created_at", { ascending: false }).limit(25),
    ]);
    const goal = profileRes.data?.goal ?? "AI Engineer";
    const interests: string[] = profileRes.data?.interests ?? [];
    const categories = catRes.data ?? [];
    const recentTitles = (recentRes.data ?? []).map((r) => r.title as string);

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

    let ai: Partial<Analysis> & { model?: string; error?: string } = {};
    try {
      const { system, user: userMsg } = buildPrompt(meta, note, goal, interests, categories, recentTitles);
      const model = MODELS.analyze();
      ai = await groqJson<Analysis>({ model, system, user: userMsg });
      ai.model = model;
    } catch (e) {
      ai = { error: (e as Error).message };
    }

    let categoryId: string | null = null;
    if (ai.category?.name) {
      const slug = slugify(ai.category.slug || ai.category.name);
      const match = categories.find((c) => c.slug === slug) ??
        categories.find((c) => c.name.toLowerCase() === ai.category!.name.toLowerCase());
      if (match) categoryId = match.id;
      else {
        const { data: created } = await supabase.from("categories")
          .upsert({ user_id: user.id, name: ai.category.name.trim().slice(0, 40), slug }, { onConflict: "user_id,slug" })
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
      // Articles have no separate "transcript" concept — this column just means "the text we
      // actually read," so reuse it for article body text too instead of leaving it empty
      // even though the AI clearly had real content to work from (has_transcript was true).
      transcript: meta.transcript ?? meta.content,
      // Name says "transcript" but this really means "had substantial source text to analyze from" —
      // covers article body text too, so the UI can show a trust badge when analysis worked from just a title.
      has_transcript: !!(meta.transcript || meta.content),
      category_id: categoryId,
      tags: (ai.tags ?? []).slice(0, 8).map((t) => String(t).toLowerCase().slice(0, 30)),
      ai: {
        summary: ai.summary ?? null,
        key_concepts: ai.key_concepts ?? [],
        difficulty: ai.difficulty ?? null,
        prerequisites: ai.prerequisites ?? [],
        why_it_matters: ai.why_it_matters ?? null,
        takeaway: ai.takeaway ?? null,
        segments: (ai.segments ?? []).slice(0, 5),
        resources: (ai.resources ?? []).slice(0, 8),
        overlap: ai.overlap ?? null,
        model: ai.model ?? null,
        error: ai.error ?? null,
        transcript_status: meta.transcriptStatus ?? null,
      },
      relevance_score: ai.relevance_score ? clamp(ai.relevance_score, 1, 5, 3) : null,
      estimated_minutes: clamp(ai.estimated_minutes, 1, 600, fallbackMinutes),
    };

    // Re-analyzing an existing item refreshes its content without resetting its status/progress
    // (an already-completed item shouldn't jump back to "inbox" just because you asked for a
    // fresh take on it) or its saved note.
    const { error: insertErr, data: item } = reanalyzeId
      ? await supabase.from("items").update(refreshed).eq("id", reanalyzeId)
        .select("*, category:categories(id, name, slug, color)").single()
      : await supabase.from("items").insert({
        user_id: user.id, url: rawUrl.trim(), status: "inbox", notes: note ?? null, added_via: addedVia, ...refreshed,
      }).select("*, category:categories(id, name, slug, color)").single();

    if (insertErr) return json({ error: insertErr.message }, 500);
    return json({ item, ai_error: ai.error ?? null });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    return json({ error: (e as Error).message }, 400);
  }
});

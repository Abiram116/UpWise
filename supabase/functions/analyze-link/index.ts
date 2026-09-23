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
  related_index: number | null;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "general";

const clamp = (n: unknown, lo: number, hi: number, dflt: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt;
};

function buildPrompt(meta: LinkMeta, note: string | undefined, goal: string, interests: string[],
  categories: { name: string; slug: string }[], recentItems: { id: string; title: string }[]) {
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
  "overlap": "If it duplicates or extends something already in the library, say which and how. Otherwise null.",
  "related_index": index number (from the ALREADY IN LIBRARY list below) of the one item this most directly builds on or connects to conceptually, or null if nothing clearly does
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
  if (recentItems.length) parts.push(`ALREADY IN LIBRARY (recent):\n${recentItems.map((r, i) => `[${i}] ${r.title}`).join("\n")}`);
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

    const [profileRes, catRes, recentRes] = await Promise.all([
      supabase.from("profiles").select("goal, interests").eq("id", user.id).single(),
      supabase.from("categories").select("id, name, slug").order("name"),
      supabase.from("items").select("id, title").not("title", "is", null).order("created_at", { ascending: false }).limit(25),
    ]);
    const goal = profileRes.data?.goal ?? "AI Engineer";
    const interests: string[] = profileRes.data?.interests ?? [];
    const categories = catRes.data ?? [];
    const recentItems = (recentRes.data ?? []) as { id: string; title: string }[];

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

    // A re-analyze that comes back with absolutely nothing (no title, no thumbnail, no
    // content) for a link that previously had real data is the strongest signal available
    // that it's been deleted/removed — skip the pointless Groq call and say so plainly.
    const seemsDead = !!reanalyzeId && !meta.title && !meta.thumbnailUrl && !meta.transcript && !meta.content;

    let ai: Partial<Analysis> & { model?: string; error?: string } = {};
    if (seemsDead) {
      ai = { error: "This link looks like it's been removed or is no longer accessible." };
    } else {
      try {
        const { system, user: userMsg } = buildPrompt(meta, note, goal, interests, categories, recentItems);
        const model = MODELS.analyze();
        ai = await groqJson<Analysis>({ model, system, user: userMsg });
        ai.model = model;
      } catch (e) {
        ai = { error: (e as Error).message };
      }
    }

    // Only for fresh saves — re-analyzing an item obviously shouldn't flag itself as a
    // duplicate of itself. Catches the case exact-canonical-URL matching above can't: the
    // same video/article re-shared under a different link.
    let possibleDuplicate: { id: string; title: string } | null = null;
    const candidateTitle = ai.title || meta.title || "";
    if (!reanalyzeId && candidateTitle) {
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

    const relatedItem = typeof ai.related_index === "number" && recentItems[ai.related_index]
      ? { id: recentItems[ai.related_index].id, title: recentItems[ai.related_index].title }
      : null;

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
        possible_duplicate: possibleDuplicate,
        related_item: relatedItem,
      },
      relevance_score: ai.relevance_score ? clamp(ai.relevance_score, 1, 5, 3) : null,
      estimated_minutes: clamp(ai.estimated_minutes, 1, 600, fallbackMinutes),
    };

    // Re-analyzing an existing item refreshes its content without resetting its status/progress
    // (an already-completed item shouldn't jump back to "inbox" just because you asked for a
    // fresh take on it) or its saved note. A link that seems dead is the one exception — don't
    // blow away the item's good historical title/thumbnail with empty fallback values, just
    // record that it couldn't be read this time.
    const { error: insertErr, data: item } = reanalyzeId
      ? await supabase.from("items")
        .update(seemsDead ? { ai: { ...(existing?.ai ?? {}), error: ai.error } } : refreshed)
        .eq("id", reanalyzeId)
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

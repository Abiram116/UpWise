export type Source = "youtube" | "instagram" | "article" | "other";

export interface LinkMeta {
  source: Source;
  canonicalUrl: string;
  externalId: string | null;
  title: string | null;
  description: string | null;
  channel: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  tags: string[];
  transcript: string | null;
  content: string | null; // article body / any extra text for the model
  transcriptStatus?: string; // diagnostics: ok | no_tracks:<playability> | caption_fetch_failed:<err> | ...
  videoUrl?: string | null; // direct video file, when the page exposes one (Instagram reels)
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export function parseLink(raw: string): { source: Source; canonicalUrl: string; externalId: string | null } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("That doesn't look like a valid link");
  }
  const host = url.hostname.replace(/^www\.|^m\.|^mobile\./, "");

  if (host === "youtu.be" || host.endsWith("youtube.com") || host === "youtube-nocookie.com") {
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
    else if (url.searchParams.get("v")) id = url.searchParams.get("v");
    else {
      const m = url.pathname.match(/^\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{11})/);
      if (m) id = m[1];
    }
    if (id && YT_ID.test(id)) {
      return { source: "youtube", canonicalUrl: `https://www.youtube.com/watch?v=${id}`, externalId: id };
    }
  }

  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    const m = url.pathname.match(/^\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
    const id = m?.[1] ?? null;
    const path = m ? `/${m[0].split("/")[1] === "reels" ? "reel" : m[0].split("/")[1]}/${id}/` : url.pathname;
    return { source: "instagram", canonicalUrl: `https://www.instagram.com${path}`, externalId: id };
  }

  url.hash = "";
  for (const p of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "si", "ref"]) {
    url.searchParams.delete(p);
  }
  return { source: "article", canonicalUrl: url.toString(), externalId: null };
}

// ---------------- YouTube ----------------

function isoDurationToSeconds(iso: string): number {
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + (+(m[4] ?? 0));
}

async function youtubeDataApi(id: string, key: string) {
  const u = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${id}&key=${key}`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`YouTube Data API ${r.status}`);
  const j = await r.json();
  const v = j.items?.[0];
  if (!v) throw new Error("Video not found");
  const t = v.snippet.thumbnails ?? {};
  return {
    title: v.snippet.title as string,
    description: v.snippet.description as string,
    channel: v.snippet.channelTitle as string,
    thumbnailUrl: (t.maxres ?? t.standard ?? t.high ?? t.medium ?? t.default)?.url ?? null,
    durationSeconds: isoDurationToSeconds(v.contentDetails.duration),
    tags: (v.snippet.tags ?? []).slice(0, 15) as string[],
  };
}

// Innertube (the same API the YouTube Android app uses). Gives metadata + caption tracks
// without a key, and is far more tolerant of server IPs than scraping the watch page.
const INNERTUBE_CLIENTS = [
  {
    ua: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
    client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30 },
  },
  {
    ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
    client: { clientName: "IOS", clientVersion: "20.10.4", deviceMake: "Apple", deviceModel: "iPhone16,2", osName: "iPhone", osVersion: "18.3.2.22D82" },
  },
];

async function innertubePlayer(id: string): Promise<{ data: any; tried: string[] }> {
  let last: any = null;
  const tried: string[] = [];
  for (const c of INNERTUBE_CLIENTS) {
    const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": c.ua },
      body: JSON.stringify({
        context: { client: { ...c.client, hl: "en", gl: "US" } },
        videoId: id,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
    });
    if (!r.ok) { tried.push(`${c.client.clientName}:http${r.status}`); continue; }
    const j = await r.json();
    last = j;
    const n = j.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length ?? 0;
    tried.push(`${c.client.clientName}:${j.playabilityStatus?.status ?? "?"}:${n}`);
    if (j.playabilityStatus?.status === "OK" && n) return { data: j, tried };
  }
  if (!last) throw new Error("innertube unavailable: " + tried.join(","));
  return { data: last, tried };
}

interface CaptionTrack { baseUrl: string; languageCode: string; kind?: string; name?: { runs?: { text: string }[] } }

function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (!tracks?.length) return null;
  const en = tracks.filter((t) => t.languageCode?.startsWith("en"));
  return en.find((t) => t.kind !== "asr") ?? en[0] ?? tracks.find((t) => t.kind !== "asr") ?? tracks[0];
}

// Caption endpoints return either json3 or timedtext XML depending on which client issued the URL.
async function fetchCaptionText(baseUrl: string): Promise<string> {
  const r = await fetch(`${baseUrl}&fmt=json3`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`captions ${r.status}`);
  const raw = await r.text();
  const parts: string[] = [];
  if (raw.trimStart().startsWith("{")) {
    const j = JSON.parse(raw);
    for (const ev of j.events ?? []) {
      const seg = (ev.segs ?? []).map((s: { utf8?: string }) => s.utf8 ?? "").join("");
      if (seg.trim()) parts.push(seg);
    }
  } else {
    // <p t=".." d="..">..</p> (format 3) or <text start=".." dur="..">..</text> (legacy)
    for (const m of raw.matchAll(/<(?:p|text)\b[^>]*>([\s\S]*?)<\/(?:p|text)>/g)) {
      const t = decodeEntities(m[1].replace(/<[^>]+>/g, ""));
      if (t.trim()) parts.push(t);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

async function watchPageTracks(id: string): Promise<CaptionTrack[]> {
  const r = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: "CONSENT=YES+cb; SOCS=CAI" },
  });
  const html = await r.text();
  const m = html.match(/"captionTracks":(\[.*?\])/);
  if (!m) return [];
  return JSON.parse(m[1]);
}

export async function fetchYouTube(id: string, apiKey: string | undefined, skipTranscript = false): Promise<LinkMeta> {
  const meta: LinkMeta = {
    source: "youtube",
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
    externalId: id,
    title: null,
    description: null,
    channel: null,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    durationSeconds: null,
    tags: [],
    transcript: null,
    content: null,
  };

  const [api, player] = await Promise.allSettled([
    apiKey ? youtubeDataApi(id, apiKey) : Promise.reject(new Error("no key")),
    innertubePlayer(id),
  ]);

  if (api.status === "fulfilled") Object.assign(meta, api.value);

  let tracks: CaptionTrack[] = [];
  const diag: string[] = [];
  if (player.status === "fulfilled") {
    const p = player.value.data;
    diag.push(...player.value.tried);
    const vd = p.videoDetails ?? {};
    meta.title ??= vd.title ?? null;
    meta.description ??= vd.shortDescription ?? null;
    meta.channel ??= vd.author ?? null;
    meta.durationSeconds ??= vd.lengthSeconds ? +vd.lengthSeconds : null;
    if (!meta.tags.length && Array.isArray(vd.keywords)) meta.tags = vd.keywords.slice(0, 15);
    tracks = p.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  } else diag.push("innertube:" + (player.reason as Error)?.message?.slice(0, 60));
  if (!tracks.length) {
    try { tracks = await watchPageTracks(id); diag.push(`watch:${tracks.length}`); } catch (e) { diag.push("watch:" + (e as Error).message.slice(0, 40)); }
  }

  const track = skipTranscript ? null : pickTrack(tracks);
  if (track) {
    try {
      const text = await fetchCaptionText(track.baseUrl);
      if (text.length > 50) { meta.transcript = text.slice(0, 60_000); diag.push("ok"); }
      else diag.push(`empty:${text.length}`);
    } catch (e) { diag.push("caption_fetch_failed:" + (e as Error).message.slice(0, 60)); }
  } else diag.push(skipTranscript ? "skipped" : "no_tracks");
  meta.transcriptStatus = diag.join(" | ");

  if (!meta.title) {
    try {
      const o = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(meta.canonicalUrl)}&format=json`);
      if (o.ok) {
        const j = await o.json();
        meta.title = j.title ?? null;
        meta.channel ??= j.author_name ?? null;
        meta.thumbnailUrl = j.thumbnail_url ?? meta.thumbnailUrl;
      }
    } catch { /* ignore */ }
  }
  return meta;
}

// ---------------- Instagram / articles ----------------

function metaTag(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i");
  const alt = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, "i");
  const m = html.match(re) ?? html.match(alt);
  return m ? decodeEntities(m[1]) : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

export async function fetchInstagram(canonicalUrl: string, externalId: string | null): Promise<LinkMeta> {
  const meta: LinkMeta = {
    source: "instagram", canonicalUrl, externalId, title: null, description: null, channel: null,
    thumbnailUrl: null, durationSeconds: null, tags: [], transcript: null, content: null,
  };
  try {
    const r = await fetch(canonicalUrl, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
    const html = await r.text();
    const title = metaTag(html, "og:title");
    const desc = metaTag(html, "og:description");
    if (title && !/^login/i.test(title) && !/instagram$/i.test(title.trim())) meta.title = title;
    if (desc && !/log in to see/i.test(desc)) meta.description = desc;
    meta.thumbnailUrl = metaTag(html, "og:image");
    meta.videoUrl = metaTag(html, "og:video:secure_url") ?? metaTag(html, "og:video");
    const who = title?.match(/^(.*?) on Instagram/);
    if (who) meta.channel = who[1];
  } catch { /* login-walled; caller will rely on the user's note */ }
  return meta;
}

// Crude readability: drop chrome tags, prefer <article>/<main>, keep only real paragraph-ish
// text blocks. Good enough as a last-resort fallback when Jina Reader can't read a page either.
function extractReadableText(html: string): string | null {
  const stripped = html.replace(/<(script|style|nav|header|footer|aside|noscript|form)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const scoped = stripped.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    ?? stripped.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    ?? stripped;
  const blocks = [...scoped.matchAll(/<(p|li|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => decodeEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 40);
  const text = blocks.join("\n\n");
  return text.length > 200 ? text : null;
}

export async function fetchArticle(canonicalUrl: string): Promise<LinkMeta> {
  const meta: LinkMeta = {
    source: "article", canonicalUrl, externalId: null, title: null, description: null, channel: null,
    thumbnailUrl: null, durationSeconds: null, tags: [], transcript: null, content: null,
  };
  // Jina Reader turns any page (including most PDFs) into clean markdown, no key needed.
  try {
    const r = await fetch(`https://r.jina.ai/${canonicalUrl}`, {
      headers: { Accept: "text/plain", "X-Return-Format": "markdown" },
    });
    if (r.ok) {
      const text = await r.text();
      const t = text.match(/^Title:\s*(.+)$/m);
      if (t) meta.title = t[1].trim();
      const body = text.replace(/^(Title|URL Source|Published Time|Markdown Content):.*$/gm, "").trim();
      if (body.length > 100) { meta.content = body.slice(0, 40_000); meta.transcriptStatus = "jina_ok"; }
    }
  } catch { /* fall through */ }

  if (!meta.title || !meta.content) {
    try {
      const r = await fetch(canonicalUrl, { headers: { "User-Agent": UA } });
      const contentType = r.headers.get("content-type") ?? "";
      const isPdf = contentType.includes("pdf") || /\.pdf(?:[?#]|$)/i.test(canonicalUrl);
      if (isPdf) {
        // Jina already had its shot above; a raw PDF fetch isn't text we can parse here.
        meta.transcriptStatus ??= "pdf_unsupported";
      } else {
        const html = await r.text();
        meta.title ??= metaTag(html, "og:title") ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;
        meta.description = metaTag(html, "og:description") ?? metaTag(html, "description");
        meta.thumbnailUrl = metaTag(html, "og:image");
        meta.channel = metaTag(html, "og:site_name");
        if (!meta.content) {
          const readable = extractReadableText(html);
          if (readable) { meta.content = readable.slice(0, 40_000); meta.transcriptStatus = "readability_fallback"; }
        }
      }
    } catch { /* ignore */ }
  }

  if (!meta.content && !meta.transcriptStatus) meta.transcriptStatus = "unreadable";
  try { meta.channel ??= new URL(canonicalUrl).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
  return meta;
}

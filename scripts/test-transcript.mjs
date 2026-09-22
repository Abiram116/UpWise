// Probe YouTube transcript availability for a video ID via the same paths the edge function uses.
const id = process.argv[2] ?? "T-D1OfcDW1M";

async function innertube(clientName, clientVersion, ua, extra = {}) {
  const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": ua },
    body: JSON.stringify({ context: { client: { clientName, clientVersion, hl: "en", gl: "US", ...extra } }, videoId: id, contentCheckOk: true, racyCheckOk: true }),
  });
  const j = await r.json();
  const tracks = j.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  console.log(`${clientName}: status=${r.status} playability=${j.playabilityStatus?.status} tracks=${tracks.length} title=${j.videoDetails?.title?.slice(0, 40)}`);
  if (j.playabilityStatus?.reason) console.log("  reason:", j.playabilityStatus.reason);
  return tracks;
}

const android = await innertube("ANDROID", "20.10.38", "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip", { androidSdkVersion: 30 });
const web = await innertube("WEB", "2.20250101.00.00", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36");
const tv = await innertube("TVHTML5", "7.20250101.00.00", "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version");
const ios = await innertube("IOS", "20.10.4", "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)", { deviceMake: "Apple", deviceModel: "iPhone16,2", osName: "iPhone", osVersion: "18.3.2.22D82" });

const tracks = [android, web, tv, ios].find((t) => t.length) ?? [];
if (tracks.length) {
  const t = tracks.find((x) => x.languageCode?.startsWith("en")) ?? tracks[0];
  console.log("picked:", t.languageCode, t.kind ?? "manual");
  const r = await fetch(`${t.baseUrl}&fmt=json3`);
  console.log("caption fetch status:", r.status);
  const j = await r.json();
  const text = (j.events ?? []).flatMap((e) => (e.segs ?? []).map((s) => s.utf8 ?? "")).join("").replace(/\s+/g, " ");
  console.log("transcript chars:", text.length, "\n", text.slice(0, 300));
} else {
  console.log("no tracks from any client; trying watch page");
  const r = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36", Cookie: "CONSENT=YES+cb; SOCS=CAI" } });
  const html = await r.text();
  console.log("watch page status:", r.status, "has captionTracks:", html.includes('"captionTracks"'), "bot check:", /confirm you.re not a bot/i.test(html));
}

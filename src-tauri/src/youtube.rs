use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

#[derive(Serialize, Deserialize, Debug, Default)]
pub struct TranscriptResult {
    pub transcript: Option<String>,
    pub status: String,
    pub title: Option<String>,
    pub channel: Option<String>,
    pub duration_seconds: Option<u64>,
    pub language: Option<String>,
}

struct Client {
    name: &'static str,
    version: &'static str,
    ua: &'static str,
    extra: Value,
}

fn clients() -> Vec<Client> {
    vec![
        Client {
            name: "ANDROID",
            version: "20.10.38",
            ua: "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip",
            extra: serde_json::json!({ "androidSdkVersion": 30 }),
        },
        Client {
            name: "IOS",
            version: "20.10.4",
            ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
            extra: serde_json::json!({
                "deviceMake": "Apple", "deviceModel": "iPhone16,2",
                "osName": "iPhone", "osVersion": "18.3.2.22D82"
            }),
        },
    ]
}

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .expect("reqwest client")
}

fn decode_entities(s: &str) -> String {
    let mut out = s
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&nbsp;", " ");
    let re = Regex::new(r"&#(\d+);").unwrap();
    out = re
        .replace_all(&out, |c: &regex::Captures| {
            c[1].parse::<u32>().ok().and_then(char::from_u32).map(String::from).unwrap_or_default()
        })
        .to_string();
    out
}

fn collapse_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

async fn caption_text(client: &reqwest::Client, base_url: &str) -> Result<String, String> {
    let url = format!("{base_url}&fmt=json3");
    let raw = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let mut parts: Vec<String> = Vec::new();
    if raw.trim_start().starts_with('{') {
        let j: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        if let Some(events) = j.get("events").and_then(|e| e.as_array()) {
            for ev in events {
                if let Some(segs) = ev.get("segs").and_then(|s| s.as_array()) {
                    let seg: String = segs.iter().filter_map(|s| s.get("utf8").and_then(|u| u.as_str())).collect();
                    if !seg.trim().is_empty() {
                        parts.push(seg);
                    }
                }
            }
        }
    } else {
        let re = Regex::new(r"(?s)<(?:p|text)\b[^>]*>(.*?)</(?:p|text)>").unwrap();
        let tag = Regex::new(r"<[^>]+>").unwrap();
        for c in re.captures_iter(&raw) {
            let t = decode_entities(&tag.replace_all(&c[1], ""));
            if !t.trim().is_empty() {
                parts.push(t);
            }
        }
    }
    Ok(collapse_ws(&parts.join(" ")))
}

fn lang_of(t: &Value) -> &str {
    t.get("languageCode").and_then(|l| l.as_str()).unwrap_or("")
}

fn pick_track(tracks: &[Value]) -> Option<&Value> {
    let is_asr = |t: &Value| t.get("kind").and_then(|k| k.as_str()) == Some("asr");
    let en: Vec<&Value> = tracks.iter().filter(|t| lang_of(t).starts_with("en")).collect();
    en.iter().find(|t| !is_asr(t)).copied()
        .or_else(|| en.first().copied())
        .or_else(|| tracks.iter().find(|t| !is_asr(t)))
        .or_else(|| tracks.first())
}

/// Fetches a YouTube transcript from the device's own network (YouTube bot-checks datacenter IPs).
#[tauri::command]
pub async fn fetch_youtube_transcript(video_id: String) -> Result<TranscriptResult, String> {
    if !Regex::new(r"^[A-Za-z0-9_-]{11}$").unwrap().is_match(&video_id) {
        return Err("invalid video id".into());
    }
    let http = http();
    let mut result = TranscriptResult::default();
    let mut diag: Vec<String> = Vec::new();
    let mut tracks: Vec<Value> = Vec::new();

    for c in clients() {
        let mut client_ctx = serde_json::json!({
            "clientName": c.name, "clientVersion": c.version, "hl": "en", "gl": "US"
        });
        if let (Some(dst), Some(src)) = (client_ctx.as_object_mut(), c.extra.as_object()) {
            for (k, v) in src {
                dst.insert(k.clone(), v.clone());
            }
        }
        let body = serde_json::json!({
            "context": { "client": client_ctx },
            "videoId": video_id,
            "contentCheckOk": true,
            "racyCheckOk": true
        });
        let resp = http
            .post("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
            .header("User-Agent", c.ua)
            .json(&body)
            .send()
            .await;
        let j: Value = match resp {
            Ok(r) => match r.json().await {
                Ok(j) => j,
                Err(e) => { diag.push(format!("{}:parse:{}", c.name, e)); continue; }
            },
            Err(e) => { diag.push(format!("{}:err:{}", c.name, e)); continue; }
        };
        let status = j.pointer("/playabilityStatus/status").and_then(|s| s.as_str()).unwrap_or("?").to_string();
        let found = j
            .pointer("/captions/playerCaptionsTracklistRenderer/captionTracks")
            .and_then(|t| t.as_array())
            .cloned()
            .unwrap_or_default();
        diag.push(format!("{}:{}:{}", c.name, status, found.len()));

        if let Some(vd) = j.get("videoDetails") {
            result.title = result.title.take().or_else(|| vd.get("title").and_then(|v| v.as_str()).map(String::from));
            result.channel = result.channel.take().or_else(|| vd.get("author").and_then(|v| v.as_str()).map(String::from));
            result.duration_seconds = result.duration_seconds.or_else(|| {
                vd.get("lengthSeconds").and_then(|v| v.as_str()).and_then(|s| s.parse().ok())
            });
        }
        if status == "OK" && !found.is_empty() {
            tracks = found;
            break;
        }
    }

    if let Some(track) = pick_track(&tracks) {
        result.language = track.get("languageCode").and_then(|l| l.as_str()).map(String::from);
        if let Some(base) = track.get("baseUrl").and_then(|b| b.as_str()) {
            match caption_text(&http, base).await {
                Ok(text) if text.len() > 50 => {
                    let mut t = text;
                    if t.len() > 60_000 {
                        let mut cut = 60_000;
                        while !t.is_char_boundary(cut) { cut -= 1; }
                        t.truncate(cut);
                    }
                    result.transcript = Some(t);
                    diag.push("ok".into());
                }
                Ok(text) => diag.push(format!("empty:{}", text.len())),
                Err(e) => diag.push(format!("caption_fetch_failed:{e}")),
            }
        }
    } else {
        diag.push("no_tracks".into());
    }

    result.status = diag.join(" | ");
    Ok(result)
}

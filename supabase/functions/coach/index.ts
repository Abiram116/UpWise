import { AuthError, corsHeaders, json, userClient } from "../_shared/auth.ts";
import { groqJson } from "../_shared/groq.ts";

// Two modes:
//   line  — the Today screen: pick what's next and say one thing about it, like a friend would.
//   cheer — one fresh line for a celebration (finished something, hit the goal, streak).
// Memory: long-term comes from the database (history, streak, what was finished and when);
// short-term arrives from the device (lines said recently, so it never repeats itself).

interface LineOut { pick_item_id: string | null; next_item_ids?: string[]; line: string }

// The owl's personality: same friend, five different voices. Chosen in the app.
const VOICES: Record<string, string> = {
  classic: "Warm, curious, a little playful. Always on their side.",
  scholar: "A dry-witted, thoughtful friend who loves a good fact. Calm, precise, gently funny. Occasionally drops a tiny piece of trivia or a tidy analogy.",
  chill: "Ultra relaxed. Short, lowercase-ish, zero pressure, never urgent. Treats everything as no big deal, and tiny steps as great.",
  hype: "A high-energy hype friend. Big enthusiasm, short bursts, at most one ALL-CAPS word per line, exclamation marks welcome. Never pushy about it.",
  sassy: "Playfully teasing, affectionate roasting, loves a raised eyebrow. Never mean, never about their worth — only about the procrastinating.",
};
const friend = (persona?: string) => `You are UpWise — the user's friend who's into the same stuff and learns alongside them. Not a coach, not an assistant, never corporate.
Voice: ${VOICES[persona ?? "classic"] ?? VOICES.classic} Plain words. No guilt, no lectures, no "Hey". At most one emoji, and only when it genuinely lands. Never repeat or closely paraphrase anything in RECENTLY_SAID.`;

function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600e3);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { supabase, user } = await userClient(req);
    const body = await req.json().catch(() => ({}));
    const recent: string[] = Array.isArray(body.recent_lines) ? body.recent_lines.slice(0, 10).map(String) : [];
    const said = recent.length ? `RECENTLY_SAID:\n- ${recent.join("\n- ")}` : "";
    const clock = `Local time: ${body.weekday ?? ""} ${body.local_hour ?? "?"}:00.`;

    // ---------- cheer: tiny, fast, no DB round-trips ----------
    if (body.mode === "cheer") {
      const e = body.event ?? {};
      const what = e.kind === "goal" ? `just hit today's learning goal (${e.minutes ?? "?"} min today)`
        : e.kind === "streak" ? `just reached a ${e.streak}-day learning streak`
        : e.kind === "cleared" ? "just emptied their whole to-learn list"
        : `just finished "${e.title ?? "something"}"${e.finished_today > 1 ? ` — that's ${e.finished_today} today` : ""}`;
      const out = await groqJson<{ line: string }>({
        job: "cheer", maxTokens: 60,
        system: `${friend(body.persona)}\nThey ${what}. Celebrate it in ONE short line (max 9 words), specific to what happened, surprising, never generic ("Great job!" is banned). Return JSON {"line": "..."}.`,
        user: [clock, e.streak ? `Streak: ${e.streak} days.` : "", said].filter(Boolean).join("\n"),
      });
      return json({ line: String(out.line ?? "").slice(0, 90) });
    }

    // ---------- line: what's next + one thing worth saying ----------
    const since = new Date(Date.now() - 28 * 86400e3).toISOString().slice(0, 10);
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const [profile, items, activity, lastSession, done, savedToday] = await Promise.all([
      supabase.from("profiles").select("display_name, goal, daily_target_minutes").eq("id", user.id).single(),
      supabase.from("items").select("id, title, status, ai, relevance_score, estimated_minutes, created_at, category:categories(name)")
        .in("status", ["inbox", "queued", "in_progress"]).order("relevance_score", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }).limit(30),
      supabase.from("daily_activity").select("day, seconds, completed, added").gte("day", since).order("day"),
      supabase.from("learning_sessions").select("started_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("items").select("title, completed_at").eq("status", "completed").order("completed_at", { ascending: false }).limit(4),
      supabase.from("items").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString()),
    ]);

    const pending = items.data ?? [];
    const list = pending.map((i) => {
      const fmt = (i.ai as { format?: string } | null)?.format ?? "";
      const cat = (i.category as unknown as { name: string } | null)?.name ?? "-";
      const age = Math.round((Date.now() - new Date(i.created_at).getTime()) / 86400e3);
      return `${i.id} | ${i.status} | ${fmt} | ${cat} | ${i.relevance_score ?? "?"}/5 | ${i.estimated_minutes ?? "?"}m | ${age}d | ${i.title}`;
    });
    const days = activity.data ?? [];
    const minutes28 = Math.round(days.reduce((a, d) => a + (d.seconds ?? 0), 0) / 60);
    const completed28 = days.reduce((a, d) => a + (d.completed ?? 0), 0);
    const added28 = days.reduce((a, d) => a + (d.added ?? 0), 0);
    const lastActive = [lastSession.data?.started_at, done.data?.[0]?.completed_at].filter(Boolean).sort().at(-1) ?? null;
    const target = profile.data?.daily_target_minutes ?? 30;
    const today = typeof body.today_minutes === "number" ? body.today_minutes : null;

    const situation = [
      clock,
      profile.data?.display_name ? `Name: ${profile.data.display_name.split(" ")[0]}. Goal: ${profile.data.goal}.` : `Goal: ${profile.data?.goal ?? "AI Engineer"}.`,
      today != null ? `Today: ${today}/${target} min${today >= target ? " (goal met)" : ""}. Saved today: ${savedToday.count ?? 0}.` : "",
      body.streak ? `Streak: ${body.streak} days.` : "No streak right now.",
      `Last learned: ${ago(lastActive)}. Recently finished: ${(done.data ?? []).map((d) => `${d.title} (${ago(d.completed_at)})`).join("; ") || "nothing yet"}.`,
      `Last 28 days: ${minutes28} min, ${completed28} finished, ${added28} saved.`,
      body.event ? `JUST HAPPENED: ${body.event}` : "",
      said,
      `TO LEARN (id | status | format | area | relevance | est | age | title):\n${list.join("\n") || "(empty)"}`,
    ].filter(Boolean).join("\n");

    const out = await groqJson<LineOut>({
      job: "coach", maxTokens: 350,
      system: `${friend(body.persona)}
Pick ONE item to do next (fit it to the moment: short things late at night or when they're easing back in; meatier when they're on a roll) plus up to 2 follow-ups, and write "line": what you'd text them right now.
The line reacts to the real situation — time of day, a streak alive or at risk, a comeback after days away, goal already met (then zero pressure), something just finished, saving lots but finishing little (tease gently), an empty list, the weekend. Mention the pick by its topic, not its full title, when it fits.
Length: usually one short sentence (<=12 words). Two short sentences only when something real happened (comeback, milestone, big day). Never more.
Avoid the item picked last time (PREVIOUS_PICK: ${body.previous_pick_id ?? "none"}) unless it's clearly the only sensible choice.
Return JSON {"pick_item_id": "uuid or null", "next_item_ids": ["<=2 uuids"], "line": "..."}.`,
      user: situation,
    });

    const valid = new Set(pending.map((i) => i.id));
    const pick = out.pick_item_id && valid.has(out.pick_item_id) ? out.pick_item_id : null;
    return json({
      pick_item_id: pick,
      next_item_ids: (Array.isArray(out.next_item_ids) ? out.next_item_ids : []).filter((id) => valid.has(id) && id !== pick).slice(0, 2),
      line: String(out.line ?? "").slice(0, 160),
      // Kept for older app versions that still read these.
      headline: String(out.line ?? "").slice(0, 60), message: "", reason: "", focus_category: null, weak_spot: null,
      stats: { minutes28, completed28, added28 },
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    return json({ error: (e as Error).message }, 500);
  }
});

import { AuthError, corsHeaders, json, userClient } from "../_shared/auth.ts";
import { groqJson, MODELS } from "../_shared/groq.ts";

interface CoachOut {
  pick_item_id: string | null;
  next_item_ids?: string[];
  headline: string;
  message: string;
  reason: string;
  focus_category: string | null;
  weak_spot: string | null;
}

function daysAgoLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "about a week ago";
  if (days < 30) return `about ${Math.round(days / 7)} weeks ago`;
  return `about a month ago`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { supabase, user } = await userClient(req);
    const body = await req.json().catch(() => ({}));
    const availableMinutes: number | null = body.available_minutes ?? null;
    const localHour: number | null = body.local_hour ?? null;
    const previousPick: string | null = body.previous_pick_id ?? null;

    const since = new Date(Date.now() - 28 * 86400e3).toISOString().slice(0, 10);
    const [profile, items, activity, lastSession, recentCompleted] = await Promise.all([
      supabase.from("profiles").select("goal, interests, daily_target_minutes").eq("id", user.id).single(),
      supabase.from("items")
        .select("id, title, status, relevance_score, estimated_minutes, created_at, category:categories(name)")
        .in("status", ["inbox", "queued", "in_progress"])
        .order("relevance_score", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(40),
      supabase.from("daily_activity").select("day, seconds, completed, added").gte("day", since).order("day"),
      // last time the user actually did something, from either a session or a manual completion
      supabase.from("learning_sessions").select("started_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("items").select("title, completed_at, category:categories(name)")
        .eq("status", "completed").order("completed_at", { ascending: false }).limit(5),
    ]);

    const list = (items.data ?? []).map((i) => {
      const cat = (i.category as unknown as { name: string } | null)?.name ?? "Uncategorized";
      const age = Math.round((Date.now() - new Date(i.created_at).getTime()) / 86400e3);
      return `${i.id} | ${i.status} | ${cat} | ${i.relevance_score ?? "?"}/5 | ${i.estimated_minutes ?? "?"}min | ${age}d old | ${i.title}`;
    });

    const days = activity.data ?? [];
    const minutes28 = Math.round(days.reduce((a, d) => a + (d.seconds ?? 0), 0) / 60);
    const completed28 = days.reduce((a, d) => a + (d.completed ?? 0), 0);
    const added28 = days.reduce((a, d) => a + (d.added ?? 0), 0);
    const activeDays = days.filter((d) => (d.seconds ?? 0) > 0 || (d.completed ?? 0) > 0).length;

    // "last active" = most recent of a session start or a manual completion — whichever is more recent.
    const lastCompletedAt = recentCompleted.data?.[0]?.completed_at ?? null;
    const candidates = [lastSession.data?.started_at, lastCompletedAt].filter(Boolean) as string[];
    const lastActiveAt = candidates.length ? candidates.sort().at(-1)! : null;
    const daysSinceActive = lastActiveAt ? Math.floor((Date.now() - new Date(lastActiveAt).getTime()) / 86400e3) : null;

    const recentTopics = (recentCompleted.data ?? []).map((i) => {
      const cat = (i.category as unknown as { name: string } | null)?.name;
      return cat ? `${i.title} (${cat})` : i.title;
    });

    const estimates = (items.data ?? []).map((i) => i.estimated_minutes).filter((m): m is number => m != null);
    const shortestMinutes = estimates.length ? Math.min(...estimates) : null;
    const interests = profile.data?.interests ?? [];

    const system = `You are UpWise, a learning coach and companion for a final-year B.Tech student aiming for: "${profile.data?.goal ?? "AI Engineer"}"${interests.length ? ` (interested in: ${interests.join(", ")})` : ""}.
You know their history — use it, don't sound like a generic template. Plan their next stretch from the backlog: ONE item to do right now, plus up to 2 that should follow it, and write a short nudge that reads like you actually remember them.
The nudge is about the plan, not one video: say why the pick comes first and how the follow-ups connect (same topic, a quick win after a long one, a neglected area). Vary your picks — if PREVIOUS_PICK is still in the backlog, choose something else unless it's clearly the only sensible option.

Adapt your tone to their situation, using the ACTIVITY info below:
- Returning after 4+ days quiet: warm re-entry, zero guilt, suggest something short/easy to rebuild momentum. Don't dwell on the gap.
- Active in the last day or two: lean into it, can suggest something slightly meatier than usual.
- No history yet (first message ever): briefly explain this is their "up next" pick, keep it simple and welcoming.
- Backlog visibly exploding (saving much faster than finishing): you may mention it, but only if it's a real problem — never nag about it every single time.

If nothing in the backlog fits the available time well, still pick the shortest reasonable item as a genuine "quick win" rather than suggesting nothing or something too long — a few real minutes beats a skipped day. SHORTEST_AVAILABLE_MIN tells you the floor.

Return STRICT JSON:
{"pick_item_id": "uuid or null", "next_item_ids": ["up to 2 uuids, in order, never the pick"], "headline": "<=40 chars, no emoji", "message": "<=160 chars, 1-2 sentences, specific: why the pick now and what comes after it, in your adapted tone — cut every word that isn't pulling weight", "reason": "<=120 chars internal reasoning", "focus_category": "category name or null", "weak_spot": "one category they've been neglecting, or null"}
If backlog is empty, headline/message should encourage saving something useful instead.`;

    const userMsg = [
      `Local hour: ${localHour ?? "unknown"}. Available minutes: ${availableMinutes ?? "unknown"}. Daily target: ${profile.data?.daily_target_minutes ?? 30} min.`,
      daysSinceActive === null
        ? "ACTIVITY: no learning history yet — this is their first ever coach message."
        : `ACTIVITY: last active ${daysAgoLabel(daysSinceActive)}.`,
      recentTopics.length ? `RECENTLY LEARNED: ${recentTopics.join("; ")}.` : "",
      `Last 28 days: ${minutes28} min learned across ${activeDays} active days, ${completed28} completed, ${added28} saved.`,
      shortestMinutes != null ? `SHORTEST_AVAILABLE_MIN: ${shortestMinutes}` : "",
      previousPick ? `PREVIOUS_PICK: ${previousPick}` : "",
      `BACKLOG (id | status | category | relevance | est | age | title):\n${list.join("\n") || "(empty)"}`,
    ].filter(Boolean).join("\n\n");

    const out = await groqJson<CoachOut>({ model: MODELS.coach(), system, user: userMsg, maxTokens: 400 });
    const validIds = new Set((items.data ?? []).map((i) => i.id));
    if (out.pick_item_id && !validIds.has(out.pick_item_id)) out.pick_item_id = null;
    out.next_item_ids = (Array.isArray(out.next_item_ids) ? out.next_item_ids : [])
      .filter((id) => validIds.has(id) && id !== out.pick_item_id).slice(0, 2);
    return json({ ...out, stats: { minutes28, completed28, added28, activeDays, daysSinceActive } });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    return json({ error: (e as Error).message }, 500);
  }
});

import { AuthError, corsHeaders, json, userClient } from "../_shared/auth.ts";
import { groqJson, MODELS } from "../_shared/groq.ts";

interface CoachOut {
  pick_item_id: string | null;
  headline: string;
  message: string;
  reason: string;
  focus_category: string | null;
  weak_spot: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { supabase, user } = await userClient(req);
    const body = await req.json().catch(() => ({}));
    const availableMinutes: number | null = body.available_minutes ?? null;
    const localHour: number | null = body.local_hour ?? null;

    const since = new Date(Date.now() - 28 * 86400e3).toISOString().slice(0, 10);
    const [profile, items, activity] = await Promise.all([
      supabase.from("profiles").select("goal, interests, daily_target_minutes").eq("id", user.id).single(),
      supabase.from("items")
        .select("id, title, status, relevance_score, estimated_minutes, created_at, category:categories(name)")
        .in("status", ["inbox", "queued", "in_progress"])
        .order("relevance_score", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(40),
      supabase.from("daily_activity").select("day, seconds, completed, added").gte("day", since).order("day"),
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

    const system = `You are UpWise, a blunt but kind learning coach for a final-year B.Tech student aiming for: "${profile.data?.goal ?? "AI Engineer"}".
Pick ONE item from their backlog to do right now and write a short nudge. Return STRICT JSON:
{"pick_item_id": "uuid or null", "headline": "<=50 chars, no emoji", "message": "<=140 chars, specific, mentions the item and why now", "reason": "<=120 chars internal reasoning", "focus_category": "category name or null", "weak_spot": "one category they've been neglecting, or null"}
Prioritize: fits available time > high relevance > in_progress items > neglected categories > freshness. If backlog is empty, headline/message should encourage saving something useful.`;

    const userMsg = [
      `Local hour: ${localHour ?? "unknown"}. Available minutes: ${availableMinutes ?? "unknown"}. Daily target: ${profile.data?.daily_target_minutes ?? 30} min.`,
      `Last 28 days: ${minutes28} min learned across ${activeDays} active days, ${completed28} completed, ${added28} saved.`,
      `BACKLOG (id | status | category | relevance | est | age | title):\n${list.join("\n") || "(empty)"}`,
    ].join("\n\n");

    const out = await groqJson<CoachOut>({ model: MODELS.coach(), system, user: userMsg, maxTokens: 400 });
    const validIds = new Set((items.data ?? []).map((i) => i.id));
    if (out.pick_item_id && !validIds.has(out.pick_item_id)) out.pick_item_id = null;
    return json({ ...out, stats: { minutes28, completed28, added28, activeDays } });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    return json({ error: (e as Error).message }, 500);
  }
});

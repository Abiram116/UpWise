import { AuthError, corsHeaders, json, userClient } from "../_shared/auth.ts";
import { groqJson } from "../_shared/groq.ts";

// Modes:
//   line   — the Today screen: pick what's next and say one thing about it, like a friend would.
//            Cached per user + situation (coach_cache), so another device in the same moment is free.
//   refill — write a dozen celebration lines for one kind of win into the owl_lines bank; the
//            app hands them out instantly, so celebrations cost no call of their own.
//   cheer  — one line for a celebration (older app versions only).
// Memory: long-term comes from the database (history, streak, what was finished and when);
// short-term arrives from the device (lines said recently, so it never repeats itself).

interface LineOut { pick_item_id: string | null; next_item_ids?: string[]; line: string }

// One owl, one voice.
const VOICE = `You are the UpWise owl: the user's sharp, warm friend who learns the same stuff alongside them. You text like a real friend — not a coach, not an assistant, never corporate.
How you talk:
- Specific beats generic: name the real thing (the topic, the hour, the number, the streak).
- Short and natural. Vary the shape: an observation, a question, a tiny joke, a dare.
- Warm, a little witty, quietly proud of them. Never guilt, never lectures, never pushy.
- Banned: "Great job", "Keep it up", "You got this", "Let's dive in", "journey", "crush it", "level up", "Hey", "Remember,", hashtags. At most one emoji, rarely.
- Never repeat or closely paraphrase anything in RECENTLY_SAID.
The feel you're after: "11pm and still curious. One short one, then sleep." / "Three quiet days. The RAG one's only 8 minutes." / "Goal's done — anything now is pure bonus." / "Six saves today, zero finished. Collector or learner?"`;

const CHEER_FOR: Record<string, string> = {
  done: `they just finished learning something. Placeholders you may use: {n} = how many they've finished today (only appears when it's 2+).`,
  goal: `they just hit today's learning goal. Placeholder you may use: {minutes} = minutes learned today.`,
  streak: `their daily learning streak just grew. Placeholder: {streak} = the streak length in days (use it in most lines).`,
  cleared: `they just emptied their whole to-learn list.`,
};
const ALLOWED: Record<string, string[]> = { done: ["n"], goal: ["minutes"], streak: ["streak"], cleared: [] };

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

    // ---------- refill: a dozen celebration lines in one call ----------
    if (body.mode === "refill") {
      const kind = String(body.kind ?? "");
      if (!CHEER_FOR[kind]) return json({ error: "bad kind" }, 400);
      // Never stockpile: if there's plenty unused (another device refilled), just hand those back.
      const have = await supabase.from("owl_lines").select("id, line").eq("kind", kind).is("used_at", null).limit(30);
      if ((have.data?.length ?? 0) >= 8) return json({ lines: have.data });
      const used = await supabase.from("owl_lines").select("line").eq("kind", kind).not("used_at", "is", null).order("used_at", { ascending: false }).limit(15);
      const out = await groqJson<{ lines: string[] }>({
        job: "coach", maxTokens: 900,
        system: `${VOICE}\nWrite 12 different one-line celebrations for this moment: ${CHEER_FOR[kind]}\nEach max 10 words, each a different angle (pride, humour, a fun fact-ish twist, future-you, the time it took, the habit forming…). No two may start with the same word. Return JSON {"lines": ["..."]}.`,
        user: [`Avoid anything like these (already used):`, ...(used.data ?? []).map((u) => `- ${u.line}`)].join("\n"),
      });
      const ok = (l: string) => l.length > 3 && l.length <= 110 && [...l.matchAll(/\{(\w+)\}/g)].every((m) => ALLOWED[kind].includes(m[1]));
      const lines = [...new Set((Array.isArray(out.lines) ? out.lines : []).map((l) => String(l).trim()).filter(ok))].slice(0, 12);
      if (!lines.length) return json({ lines: have.data ?? [] });
      const ins = await supabase.from("owl_lines").insert(lines.map((line) => ({ user_id: user.id, kind, line }))).select("id, line");
      // Housekeeping: drop lines used more than a month ago.
      void supabase.from("owl_lines").delete().lt("used_at", new Date(Date.now() - 30 * 86400e3).toISOString()).then(() => {}, () => {});
      return json({ lines: [...(have.data ?? []), ...(ins.data ?? [])] });
    }

    // ---------- cheer: tiny, fast, no DB round-trips (older app versions) ----------
    if (body.mode === "cheer") {
      const e = body.event ?? {};
      const what = e.kind === "goal" ? `just hit today's learning goal (${e.minutes ?? "?"} min today)`
        : e.kind === "streak" ? `just reached a ${e.streak}-day learning streak`
        : e.kind === "cleared" ? "just emptied their whole to-learn list"
        : `just finished "${e.title ?? "something"}"${e.finished_today > 1 ? ` — that's ${e.finished_today} today` : ""}`;
      const out = await groqJson<{ line: string }>({
        job: "cheer", maxTokens: 60,
        system: `${VOICE}\nThey ${what}. Celebrate it in ONE short line (max 9 words), specific to what happened, surprising, never generic ("Great job!" is banned). Return JSON {"line": "..."}.`,
        user: [clock, e.streak ? `Streak: ${e.streak} days.` : "", said].filter(Boolean).join("\n"),
      });
      return json({ line: String(out.line ?? "").slice(0, 90) });
    }

    // ---------- line: what's next + one thing worth saying ----------
    const sig = typeof body.sig === "string" ? body.sig.slice(0, 120) : null;
    if (sig) {
      const hit = await supabase.from("coach_cache").select("sig, result, created_at").eq("user_id", user.id).maybeSingle();
      const fresh = hit.data && hit.data.sig === sig && Date.now() - new Date(hit.data.created_at).getTime() < 6 * 3600e3;
      const pickId = (hit.data?.result as { pick_item_id?: string } | undefined)?.pick_item_id;
      if (fresh) {
        const still = !pickId || (await supabase.from("items").select("id").eq("id", pickId).in("status", ["inbox", "queued", "in_progress"]).maybeSingle()).data;
        if (still) return json(hit.data!.result);
      }
    }
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
      system: `${VOICE}
Pick ONE item to do next (fit it to the moment: short things late at night or when they're easing back in; meatier when they're on a roll) plus up to 2 follow-ups, and write "line": what you'd text them right now.
The line reacts to the real situation — time of day, a streak alive or at risk, a comeback after days away, goal already met (then zero pressure), something just finished, saving lots but finishing little (tease gently), an empty list, the weekend. Mention the pick by its topic, not its full title, when it fits.
Length: usually one short sentence (<=12 words). Two short sentences only when something real happened (comeback, milestone, big day). Never more.
Avoid the item picked last time (PREVIOUS_PICK: ${body.previous_pick_id ?? "none"}) unless it's clearly the only sensible choice.
Return JSON {"pick_item_id": "uuid or null", "next_item_ids": ["<=2 uuids"], "line": "..."}.`,
      user: situation,
    });

    const valid = new Set(pending.map((i) => i.id));
    const pick = out.pick_item_id && valid.has(out.pick_item_id) ? out.pick_item_id : null;
    const result = {
      pick_item_id: pick,
      next_item_ids: (Array.isArray(out.next_item_ids) ? out.next_item_ids : []).filter((id) => valid.has(id) && id !== pick).slice(0, 2),
      line: String(out.line ?? "").slice(0, 160),
      // Kept for older app versions that still read these.
      headline: String(out.line ?? "").slice(0, 60), message: "", reason: "", focus_category: null, weak_spot: null,
      stats: { minutes28, completed28, added28 },
    };
    if (sig && result.line) await supabase.from("coach_cache").upsert({ user_id: user.id, sig, result, created_at: new Date().toISOString() }).then(() => {}, () => {});
    return json(result);
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401);
    return json({ error: (e as Error).message }, 500);
  }
});

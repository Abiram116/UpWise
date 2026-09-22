const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Right-sized per job. Override with `supabase secrets set GROQ_MODEL_ANALYZE=... GROQ_MODEL_COACH=...`
export const MODELS = {
  analyze: () => Deno.env.get("GROQ_MODEL_ANALYZE") ?? "openai/gpt-oss-20b",
  coach: () => Deno.env.get("GROQ_MODEL_COACH") ?? "openai/gpt-oss-20b",
};

export async function groqJson<T>(opts: { model: string; system: string; user: string; maxTokens?: number }): Promise<T> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY not set (npx supabase secrets set GROQ_API_KEY=...)");

  const isReasoning = opts.model.startsWith("openai/gpt-oss");
  const r = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0.3,
      max_tokens: opts.maxTokens ?? 1400,
      response_format: { type: "json_object" },
      ...(isReasoning ? { reasoning_effort: "low" } : {}),
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Groq ${r.status}: ${txt.slice(0, 300)}`);
  }
  const j = await r.json();
  const content: string = j.choices?.[0]?.message?.content ?? "{}";
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  return JSON.parse(start >= 0 ? content.slice(start, end + 1) : content) as T;
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

// Model routing per job: a primary plus a lighter fallback. The fallback kicks in on rate
// limits (429), server errors, timeouts or unparseable output, so a busy/limited primary
// never means "AI unavailable". Override with secrets GROQ_MODEL_<JOB> / GROQ_FALLBACK_<JOB>.
type Job = "analyze" | "coach" | "cheer";
const ROUTES: Record<Job, { primary: string; fallback: string; timeoutMs: number; temperature: number }> = {
  analyze: { primary: "openai/gpt-oss-20b", fallback: "llama-3.1-8b-instant", timeoutMs: 25_000, temperature: 0.3 },
  coach: { primary: "openai/gpt-oss-20b", fallback: "llama-3.1-8b-instant", timeoutMs: 9_000, temperature: 0.9 },
  // A one-line cheer has to land while the celebration is still on screen: fastest model first.
  cheer: { primary: "llama-3.1-8b-instant", fallback: "openai/gpt-oss-20b", timeoutMs: 2_500, temperature: 1.0 },
};

export const MODELS = {
  whisper: () => Deno.env.get("GROQ_MODEL_WHISPER") ?? "whisper-large-v3-turbo",
};

function chain(job: Job): string[] {
  const r = ROUTES[job];
  const up = job.toUpperCase();
  return [Deno.env.get(`GROQ_MODEL_${up}`) ?? r.primary, Deno.env.get(`GROQ_FALLBACK_${up}`) ?? r.fallback];
}

/** Transcribes a short audio/video file (Whisper decodes the audio track from mp4 fine). */
export async function groqTranscribe(bytes: Uint8Array, filename: string): Promise<string> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY not set");
  const form = new FormData();
  form.append("file", new Blob([bytes]), filename);
  form.append("model", MODELS.whisper());
  form.append("response_format", "text");
  const r = await fetch(GROQ_TRANSCRIBE_URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!r.ok) throw new Error(`Groq transcribe ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return (await r.text()).trim();
}

class Retryable extends Error {}

async function callOnce<T>(model: string, job: Job, system: string, user: string, maxTokens: number): Promise<T> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY not set (npx supabase secrets set GROQ_API_KEY=...)");
  const route = ROUTES[job];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), route.timeoutMs);
  try {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: route.temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (r.status === 429 || r.status >= 500) throw new Retryable(`Groq ${r.status} on ${model}`);
    if (!r.ok) throw new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const content: string = j.choices?.[0]?.message?.content ?? "";
    const start = content.indexOf("{"), end = content.lastIndexOf("}");
    try { return JSON.parse(content.slice(start, end + 1)) as T; }
    catch { throw new Retryable(`unparseable output from ${model}`); }
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Retryable(`timeout on ${model}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** JSON completion with automatic fallback to the job's lighter model. */
export async function groqJson<T>(opts: { job: Job; system: string; user: string; maxTokens?: number }): Promise<T & { model: string }> {
  let last: unknown;
  for (const model of chain(opts.job)) {
    try {
      const out = await callOnce<T>(model, opts.job, opts.system, opts.user, opts.maxTokens ?? 900);
      return { ...out, model };
    } catch (e) {
      last = e;
      if (!(e instanceof Retryable)) throw e; // a 400 won't get better on another model
    }
  }
  throw last instanceof Error ? last : new Error("AI unavailable");
}

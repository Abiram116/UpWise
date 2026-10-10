const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

// Model routing per job: an ordered list of candidates. Anything that can't serve the request
// — rate limited (429), server trouble (5xx), timeout, unparseable output, or a model that's
// been retired / isn't on this account (404/403, "model not found") — falls through to the next
// one, and models that turn out to be unavailable are skipped for the rest of this instance's
// life. Override the first choice with secrets GROQ_MODEL_<JOB>.
type Job = "analyze" | "coach" | "cheer";
const GENERAL = ["openai/gpt-oss-20b", "llama-3.1-8b-instant", "llama-3.3-70b-versatile", "openai/gpt-oss-120b"];
const ROUTES: Record<Job, { models: string[]; timeoutMs: number; temperature: number }> = {
  analyze: { models: GENERAL, timeoutMs: 25_000, temperature: 0.3 },
  coach: { models: GENERAL, timeoutMs: 9_000, temperature: 0.9 },
  // A one-line cheer has to land while the celebration is still on screen.
  cheer: { models: ["llama-3.1-8b-instant", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"], timeoutMs: 2_500, temperature: 1.0 },
};
const unavailable = new Set<string>();

export const MODELS = {
  whisper: () => Deno.env.get("GROQ_MODEL_WHISPER") ?? "whisper-large-v3-turbo",
};

function chain(job: Job): string[] {
  const first = Deno.env.get(`GROQ_MODEL_${job.toUpperCase()}`);
  const all = first ? [first, ...ROUTES[job].models.filter((m) => m !== first)] : ROUTES[job].models;
  const live = all.filter((m) => !unavailable.has(m));
  return live.length ? live : all; // if everything was marked dead, try them all again
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
        // Reasoning models spend part of the budget thinking; a tiny limit leaves no room for the answer.
        max_tokens: model.startsWith("openai/gpt-oss") ? Math.max(maxTokens, 500) : maxTokens,
        response_format: { type: "json_object" },
        ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    if (r.status === 429 || r.status >= 500) throw new Retryable(`Groq ${r.status} on ${model}`);
    if (!r.ok) {
      const body = (await r.text()).slice(0, 300);
      // Retired / not-on-this-account models: remember it and let the next candidate answer.
      if (r.status === 404 || r.status === 403 || (r.status === 400 && /model/i.test(body))) { unavailable.add(model); throw new Retryable(`${model} unavailable`); }
      if (r.status === 400 && /json_validate_failed/.test(body)) throw new Retryable(`${model} returned invalid JSON`);
      throw new Error(`Groq ${r.status}: ${body}`);
    }
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

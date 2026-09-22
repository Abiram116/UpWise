import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, ArrowRight, Play } from "lucide-react";
import { useAnalyze, useCategories, useUpdateItem, type AnalyzeStage } from "../lib/api";
import { extractUrl, fmtMinutes, detectSource, SOURCE_LABEL } from "../lib/utils";
import type { Item } from "../lib/types";
import { Chip, CheckIcon, Dots, Pill, Sheet, easeOut, spring, useToast } from "./ui";
import { useSessionStore } from "./SessionBar";

// ---- tiny external store so share/paste can hand a URL to the sheet from anywhere ----
type Queued = { url: string; via: "paste" | "share"; nonce: number } | null;
let queued: Queued = null;
const listeners = new Set<() => void>();
const queueStore = {
  push(url: string, via: "paste" | "share") { queued = { url, via, nonce: Date.now() }; listeners.forEach((l) => l()); },
  take() { const q = queued; queued = null; listeners.forEach((l) => l()); return q; },
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  get: () => queued,
};
export function useAddQueue<T>(sel: (s: typeof queueStore) => T): T { return sel(queueStore); }

const STAGES: { key: AnalyzeStage; label: string }[] = [
  { key: "transcript", label: "Reading the transcript" },
  { key: "metadata", label: "Fetching details" },
  { key: "thinking", label: "Working out what it teaches" },
  { key: "saving", label: "Saving to your library" },
];

export function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [stage, setStage] = useState<AnalyzeStage | null>(null);
  const [result, setResult] = useState<{ item: Item; duplicate: boolean; ai_error: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const analyze = useAnalyze();
  const inputRef = useRef<HTMLInputElement>(null);
  const q = useSyncExternalStore(queueStore.subscribe, queueStore.get);

  const run = async (u: string, via: "paste" | "share" = "paste") => {
    setError(null); setResult(null); setStage("metadata");
    try {
      const r = await analyze.mutateAsync([u, { note: note.trim() || undefined, addedVia: via, onStage: setStage }]);
      setResult(r);
    } catch (e) {
      setError((e as Error).message || "Something went wrong");
    } finally {
      setStage(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (q) {
      const item = queueStore.take();
      if (item) { setUrl(item.url); void run(item.url, item.via); }
    } else {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q?.nonce]);

  const reset = () => { setUrl(""); setNote(""); setResult(null); setError(null); setStage(null); };
  const close = () => { onClose(); setTimeout(reset, 300); };

  const busy = stage !== null;
  const source = url ? detectSource(url) : null;

  return (
    <Sheet open={open} onClose={busy ? () => {} : close} title={result ? undefined : busy ? "Reading it" : "Add a link"}>
      <AnimatePresence mode="wait" initial={false}>
        {!busy && !result && (
          <motion.form key="form" className="col" style={{ gap: 12 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            onSubmit={(e) => { e.preventDefault(); const u = extractUrl(url); if (u) void run(u); }}>
            <input ref={inputRef} className="input input-lg" placeholder="YouTube, Instagram or article link" value={url}
              onChange={(e) => setUrl(e.target.value)} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="go" />
            {source && url && <p className="meta" style={{ paddingLeft: 20 }}>{SOURCE_LABEL[source]}{source === "instagram" ? " — add a note so the AI knows what it's about" : ""}</p>}
            <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            {error && <p className="meta row" style={{ color: "var(--error)", gap: 6, paddingLeft: 20 }}><AlertCircle size={14} /> {error}</p>}
            <Pill variant="filled" size="lg" type="submit" disabled={!extractUrl(url)} style={{ marginTop: 8 }}>Analyze and save</Pill>
          </motion.form>
        )}

        {busy && (
          <motion.div key="busy" className="steps" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {STAGES.filter((s) => s.key !== "transcript" || source === "youtube").map((s, i, arr) => {
              const idx = arr.findIndex((x) => x.key === stage);
              const state = i < idx ? "done" : i === idx ? "active" : "todo";
              return (
                <motion.div key={s.key} className="step" data-state={state} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...easeOut, delay: i * 0.06 }}>
                  <span className="step-dot">{state === "done" && <CheckIcon />}</span>{s.label}
                </motion.div>
              );
            })}
            <p className="meta" style={{ marginTop: 6 }}>Usually 3–8 seconds.</p>
          </motion.div>
        )}

        {result && <ResultCard key="result" result={result} onDone={close} />}
      </AnimatePresence>
    </Sheet>
  );
}

function ResultCard({ result, onDone }: { result: { item: Item; duplicate: boolean; ai_error: string | null }; onDone: () => void }) {
  const { item, duplicate, ai_error } = result;
  const nav = useNavigate();
  const toast = useToast();
  const update = useUpdateItem();
  const cats = useCategories();
  const start = useSessionStore((s) => s.start);
  const [cat, setCat] = useState(item.category?.id ?? null);

  const changeCat = async (id: string) => {
    setCat(id);
    await update.mutateAsync({ id: item.id, category_id: id, category: cats.data?.find((c) => c.id === id) ?? null });
  };

  return (
    <motion.div className="col" style={{ gap: 16 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <div className="row" style={{ gap: 8 }}>
        <Chip tone={duplicate ? "warm" : "primary"}>{duplicate ? "Already saved" : "Saved"}</Chip>
        {item.has_transcript && <Chip>Transcript read</Chip>}
        {ai_error && <Chip tone="error">AI unavailable</Chip>}
      </div>

      {item.thumbnail_url && <div className="thumb thumb-lg"><img src={item.thumbnail_url} alt="" /></div>}

      <div>
        <h3 className="headline-sm selectable">{item.title}</h3>
        <p className="meta row wrap" style={{ gap: 10, marginTop: 8 }}>
          {item.channel && <span>{item.channel}</span>}
          {item.estimated_minutes != null && <span>~{fmtMinutes(item.estimated_minutes)} to learn</span>}
          <Dots n={item.relevance_score} />
          {item.ai?.difficulty && <span style={{ textTransform: "capitalize" }}>{item.ai.difficulty}</span>}
        </p>
      </div>

      {item.ai?.summary && <p className="body selectable">{item.ai.summary}</p>}
      {item.ai?.why_it_matters && <p className="body" style={{ color: "var(--on-surface)" }}>{item.ai.why_it_matters}</p>}

      {!!cats.data?.length && (
        <div className="chips-scroll">
          {cats.data.map((c) => <Chip key={c.id} active={c.id === cat} onClick={() => changeCat(c.id)}>{c.name}</Chip>)}
        </div>
      )}

      <div className="row" style={{ gap: 8, marginTop: 4 }}>
        <Pill variant="filled" size="lg" className="grow" onClick={async () => { await start(item); onDone(); nav(`/item/${item.id}`); toast("Session started"); }}><Play size={17} fill="currentColor" /> Start now</Pill>
        <Pill variant="text" size="lg" onClick={() => { onDone(); nav(`/item/${item.id}`); }}>Details <ArrowRight size={16} /></Pill>
      </div>
    </motion.div>
  );
}

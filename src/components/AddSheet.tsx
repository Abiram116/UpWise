import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, ArrowRight, Bookmark, CloudOff, Play } from "lucide-react";
import { saveNote, useAnalyze, useCategories, useSetStatus, useUpdateItem, type AnalyzeStage } from "../lib/api";
import { haptic } from "../lib/haptics";
import { extractUrl, fmtMinutes, detectSource, FORMAT_LABEL, formatOf } from "../lib/utils";
import { FormatIcon } from "./ItemCard";
import { ItemThumb } from "./CoverArt";

/** What UpWise thinks it's about to save, before it's saved. */
function previewLabel(url: string, source: ReturnType<typeof detectSource>): string {
  if (source === "youtube") return /\/shorts\//.test(url) ? "YouTube Short" : "YouTube video";
  if (source === "instagram") return /\/p\//.test(url) ? "Instagram post — a note helps the AI" : "Instagram reel — a note helps the AI";
  return "Article or link — articles get a quick read, plain sites are just kept";
}
import { enqueue } from "../lib/outbox";
import { connection } from "../lib/connection";
import { describeError, isNetworkError } from "../lib/errors";
import type { Item } from "../lib/types";
import { Chip, CheckIcon, Pill, Sheet, easeOut, spring, useToast } from "./ui";
import { useSessionStore } from "./SessionBar";

// ---- tiny external store so share/paste can hand a URL to the sheet from anywhere ----
type Queued = { url: string; via: "paste" | "share"; nonce: number } | null;
let queued: Queued = null;
const listeners = new Set<() => void>();
const queueStore = {
  push(url: string, via: "paste" | "share") { queued = { url, via, nonce: Date.now() }; listeners.forEach((l) => l()); },
  take() { const q = queued; queued = null; listeners.forEach((l) => l()); return q; },
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
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
  // Typed text (no link) is a note or a topic to research — saved on the spot, no AI.
  const [textKind, setTextKind] = useState<"note" | "topic">("note");
  const [savingText, setSavingText] = useState(false);
  const [stage, setStage] = useState<AnalyzeStage | null>(null);
  const [result, setResult] = useState<{ item: Item; duplicate: boolean; ai_error: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Why a save was parked in the outbox instead of analyzed now — drives the confirmation copy.
  const [queuedOffline, setQueuedOffline] = useState<false | "offline" | "backend">(false);
  const analyze = useAnalyze();
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const q = useSyncExternalStore(queueStore.subscribe, queueStore.get);

  // Each add attempt gets an id. If the user dismisses the sheet while one is still
  // running, its id lands here — the request keeps going in the background (it's a
  // plain fetch, not tied to the sheet's visibility) and reports via toast instead of
  // trying to update a form the user already closed or has since reused for something else.
  const activeRunId = useRef(0);
  const dismissedRuns = useRef(new Set<number>());

  const run = async (u: string, via: "paste" | "share" = "paste") => {
    const runId = ++activeRunId.current;
    setError(null); setResult(null); setQueuedOffline(false);
    const park = async () => {
      await enqueue({ kind: "save", url: u, note: note.trim() || undefined, via });
      const why = connection.get() === "backend" ? "backend" : "offline";
      if (dismissedRuns.current.has(runId)) toast("Saved for later — it'll be analyzed once UpWise reconnects");
      else setQueuedOffline(why);
    };
    // Already known to be unreachable: don't make you watch a spinner time out first.
    if (connection.get() !== "ok") { await park(); return; }
    setStage("metadata");
    try {
      const r = await analyze.mutateAsync([u, {
        note: note.trim() || undefined, addedVia: via,
        onStage: (s) => { if (!dismissedRuns.current.has(runId)) setStage(s); },
      }]);
      if (dismissedRuns.current.has(runId)) {
        toast(r.duplicate ? "Already in your library" : `Saved: ${r.item.title ?? "your link"}`);
      } else {
        setResult(r);
      }
    } catch (e) {
      if (isNetworkError(e)) {
        connection.reportError(e);
        await park();
      } else {
        const message = describeError(e).message;
        if (dismissedRuns.current.has(runId)) toast(`Couldn't save that link — ${message}`);
        else setError(message);
      }
    } finally {
      dismissedRuns.current.delete(runId);
      if (activeRunId.current === runId) setStage(null);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (q) {
      const item = queueStore.take();
      if (item) {
        setUrl(item.url);
        // Shared plain text has no link to analyse: leave it in the box to be saved as a note.
        if (extractUrl(item.url)) void run(item.url, item.via);
      }
    } else {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q?.nonce]);

  const busy = stage !== null;
  const hasUrl = !!extractUrl(url);
  const isText = url.trim().length > 0 && !hasUrl;
  const source = hasUrl ? detectSource(url) : null;

  const saveText = async () => {
    setSavingText(true);
    try {
      await saveNote(url, textKind);
      haptic.success();
      toast(textKind === "note" ? "Note saved" : "Topic saved — it's in To learn");
      close();
    } catch (e) { setError(describeError(e).message); }
    finally { setSavingText(false); }
  };

  const reset = () => { setUrl(""); setNote(""); setResult(null); setError(null); setQueuedOffline(false); setStage(null); };
  const close = () => {
    if (busy) dismissedRuns.current.add(activeRunId.current);
    onClose();
    setTimeout(reset, 300);
  };

  return (
    <Sheet open={open} onClose={close} title={result || queuedOffline ? undefined : busy ? "Reading it" : "Save something"}>
      <AnimatePresence mode="wait" initial={false}>
        {queuedOffline && (
          <motion.div key="queued" className="col" style={{ gap: 14, alignItems: "center", textAlign: "center", padding: "8px 0" }}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
            <div className="thumb" data-tone="sage" style={{ width: 56, aspectRatio: "1", borderRadius: 999 }}><CloudOff size={24} /></div>
            <div>
              <h3 className="headline-sm">{queuedOffline === "backend" ? "Database unreachable" : "No connection"}</h3>
              <p className="body" style={{ marginTop: 6 }}>
                Saved for later — it'll be analyzed and added to your library as soon as {queuedOffline === "backend" ? "Supabase is back" : "you're back online"}.
              </p>
            </div>
            <Pill variant="filled" size="lg" style={{ width: "100%" }} onClick={close}>Got it</Pill>
          </motion.div>
        )}
        {!busy && !result && !queuedOffline && (
          <motion.form key="form" className="col" style={{ gap: 12 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            onSubmit={(e) => { e.preventDefault(); const u = extractUrl(url); if (u) void run(u); else if (isText) void saveText(); }}>
            <input ref={inputRef} className="input input-lg" placeholder="Paste a link, or type a note or topic" value={url}
              onChange={(e) => { setUrl(e.target.value); setError(null); }} autoCapitalize="sentences" autoCorrect="on" enterKeyHint="go" />
            {hasUrl && source && <p className="meta" style={{ paddingLeft: 20 }}>{previewLabel(url, source)}</p>}
            {isText && (
              <div className="col" style={{ gap: 8, paddingLeft: 4 }}>
                <div className="chips">
                  <Chip active={textKind === "note"} onClick={() => setTextKind("note")}>Note / reminder</Chip>
                  <Chip active={textKind === "topic"} onClick={() => setTextKind("topic")}>Topic to research</Chip>
                </div>
                <p className="meta" style={{ paddingLeft: 16 }}>{textKind === "note" ? "Kept in Saved — check it off when it's done." : "Goes into To learn. Start it and UpWise searches for you."}</p>
              </div>
            )}
            {hasUrl && <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />}
            {error && <p className="meta row" style={{ color: "var(--error)", gap: 6, paddingLeft: 20 }}><AlertCircle size={14} /> {error}</p>}
            <Pill variant="filled" size="lg" type="submit" loading={savingText} disabled={!hasUrl && !isText} style={{ marginTop: 8 }}>
              {hasUrl ? "Analyze and save" : isText ? (textKind === "note" ? "Save note" : "Save topic") : "Analyze and save"}
            </Pill>
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
            <p className="meta" style={{ marginTop: 6 }}>Usually a few seconds.</p>
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
  const setStatus = useSetStatus();
  const cats = useCategories();
  const start = useSessionStore((s) => s.start);
  const [cat, setCat] = useState(item.category?.id ?? null);
  const [dupSkipped, setDupSkipped] = useState(false);
  const possibleDup = item.ai?.possible_duplicate ?? null;
  const format = formatOf(item);
  const analyze = useAnalyze();
  const [switching, setSwitching] = useState(false);
  const learnInstead = async () => {
    setSwitching(true);
    try { await analyze.mutateAsync([item.url, { reanalyzeId: item.id, mode: "learn" }]); toast("Added to To learn"); onDone(); nav(`/item/${item.id}`); }
    catch { toast("Couldn't switch it — try from the item page"); }
    finally { setSwitching(false); }
  };

  if (format === "link" && !duplicate) {
    return (
      <motion.div className="col" style={{ gap: 16 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <div className="row" style={{ gap: 8 }}><Chip tone="primary">Saved to your links</Chip></div>
        <div className="row" style={{ gap: 14 }}>
          <div className="thumb"><ItemThumb item={item} /></div>
          <div className="grow col" style={{ gap: 2 }}>
            <h3 className="title clamp-2">{item.title}</h3>
            <p className="meta truncate">{item.channel}</p>
          </div>
        </div>
        <p className="meta">Looks like a site to keep, not something to study — so no AI summary. Wrong call?</p>
        <div className="row" style={{ gap: 8 }}>
          <Pill variant="filled" size="lg" className="grow" onClick={onDone}>Done</Pill>
          <Pill variant="tonal" size="lg" loading={switching} onClick={learnInstead}>Learn it instead</Pill>
        </div>
      </motion.div>
    );
  }

  const changeCat = async (id: string) => {
    setCat(id);
    await update.mutateAsync({ id: item.id, category_id: id, category: cats.data?.find((c) => c.id === id) ?? null });
  };

  return (
    <motion.div className="col" style={{ gap: 16 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <div className="row" style={{ gap: 8 }}>
        <Chip tone={duplicate ? "warm" : "primary"}>{duplicate ? "Already saved" : "Saved"}</Chip>
        <Chip><span className="row" style={{ gap: 5 }}><FormatIcon item={item} size={14} />{FORMAT_LABEL[format]}</span></Chip>
        {ai_error && <Chip tone="error">AI unavailable</Chip>}
      </div>

      <div className="thumb thumb-lg"><ItemThumb item={item} /></div>

      {possibleDup && !dupSkipped && (
        <div className="slab col" style={{ gap: 8 }}>
          <p className="body" style={{ color: "var(--warm)" }}>This looks similar to "{possibleDup.title}", already in your library.</p>
          <div className="row" style={{ gap: 8 }}>
            <Pill variant="tonal" size="sm" onClick={() => { onDone(); nav(`/item/${possibleDup.id}`); }}>View that one</Pill>
            <Pill variant="text" size="sm" onClick={async () => { await setStatus(item.id, "skipped"); setDupSkipped(true); toast("Skipped — you already have this"); }}>Skip this one</Pill>
          </div>
        </div>
      )}

      <div>
        <h3 className="headline-sm selectable">{item.title}</h3>
        <p className="meta row wrap" style={{ gap: 10, marginTop: 8 }}>
          {item.channel && <span>{item.channel}</span>}
          {item.estimated_minutes != null && <span>~{fmtMinutes(item.estimated_minutes)} to learn</span>}
          {item.ai?.difficulty && <span style={{ textTransform: "capitalize" }}>{item.ai.difficulty}</span>}
        </p>
      </div>

      {item.ai?.summary && <p className="body-lg selectable" style={{ color: "var(--on-surface-2)" }}>{item.ai.summary}</p>}

      {!!cats.data?.length && (
        <div className="chips-scroll">
          {cats.data.map((c) => <Chip key={c.id} active={c.id === cat} onClick={() => changeCat(c.id)}>{c.name}</Chip>)}
        </div>
      )}

      <div className="row" style={{ gap: 8, marginTop: 4 }}>
        <Pill variant="filled" size="lg" className="grow" onClick={async () => { await start(item); onDone(); nav(`/item/${item.id}`); toast("Session started"); }}><Play size={17} fill="currentColor" /> Start now</Pill>
        <Pill variant="text" size="lg" onClick={() => { onDone(); nav(`/item/${item.id}`); }}>Details <ArrowRight size={16} /></Pill>
      </div>
      <Pill variant="text" size="sm" style={{ alignSelf: "flex-start", marginLeft: -14 }}
        onClick={async () => { try { await setStatus(item.id, "saved"); toast("Kept as a reference — it's in Saved"); onDone(); } catch { toast("Couldn't change that — try from the item page"); } }}>
        <Bookmark size={16} /> Just a reference, not to study
      </Pill>
    </motion.div>
  );
}

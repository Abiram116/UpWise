import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { motion } from "motion/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, Check, ChevronDown, ExternalLink, ListPlus, Play, SkipForward, Trash2, Clock } from "lucide-react";
import { logManualMinutes, useCategories, useDeleteItem, useItem, useSetStatus, useUpdateItem } from "../lib/api";
import { isDesktop, isTauri } from "../lib/platform";
import { confidence, fmtDuration, fmtMinutes, relativeTime, STATUS_LABEL } from "../lib/utils";
import { haptic } from "../lib/haptics";
import { useActiveSession, useSessionStore } from "../components/SessionBar";
import { Chip, Dots, Page, Pill, Rise, Sheet, Skeleton, spring, useToast } from "../components/ui";
import { useQueryClient } from "@tanstack/react-query";

async function open(url: string) {
  if (isTauri) await openUrl(url); else window.open(url, "_blank");
}

export function ItemDetailScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: item, isLoading } = useItem(id);
  const setStatus = useSetStatus();
  const update = useUpdateItem();
  const del = useDeleteItem();
  const cats = useCategories();
  const active = useActiveSession();
  const start = useSessionStore((s) => s.start);
  const stop = useSessionStore((s) => s.stop);
  const [showTranscript, setShowTranscript] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [finishPromptOpen, setFinishPromptOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  if (isLoading) return <Page><Skeleton h={220} r={28} /><Skeleton h={30} w="70%" /><Skeleton h={80} /></Page>;
  if (!item) return <Page><p className="body">Not found.</p></Page>;

  const ai = item.ai ?? {};
  const isActive = active?.itemId === item.id;
  const embed = item.source === "youtube" && item.external_id && isDesktop();
  const done = item.status === "completed";
  const trust = confidence(item);

  // Only the timed-session path ("Done learning" while a session is running) logs real elapsed
  // time automatically. A manual "mark done" with zero time behind it is exactly how the stats
  // end up saying "2 things learned, 1 min invested" — so it goes through FinishPromptSheet
  // instead, which asks for an honest minute estimate before marking complete.
  const finish = async () => {
    if (isActive) { await stop(true); qc.invalidateQueries({ queryKey: ["activity"] }); toast("Marked as learned"); }
    else setFinishPromptOpen(true);
  };

  return (
    <Page>
      <Rise>
        <div className="row between">
          <Pill variant="text" size="sm" onClick={() => nav(-1)} style={{ marginLeft: -14 }}><ArrowLeft size={18} /> Back</Pill>
          <div className="row" style={{ gap: 6 }}>
            {trust && <Chip tone={trust.tone}>{trust.label}</Chip>}
            <Chip tone={done ? "primary" : undefined}>{STATUS_LABEL[item.status]}</Chip>
          </div>
        </div>
      </Rise>

      <Rise>
        {embed ? (
          <div className="player"><iframe src={`https://www.youtube-nocookie.com/embed/${item.external_id}?rel=0&modestbranding=1`} title={item.title ?? ""} allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen /></div>
        ) : item.thumbnail_url ? (
          <motion.button className="thumb thumb-lg" layoutId={`thumb-${item.id}`} transition={spring} onClick={() => open(item.url)} style={{ position: "relative" }} whileTap={{ scale: 0.99 }}>
            <img src={item.thumbnail_url} alt="" />
            <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
              <span style={{ width: 64, height: 64, borderRadius: 999, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", color: "#fff", backdropFilter: "blur(6px)" }}><Play size={26} fill="currentColor" /></span>
            </span>
          </motion.button>
        ) : null}
      </Rise>

      <Rise>
        <div className="col" style={{ gap: 8 }}>
          <h1 className="headline selectable">{item.title}</h1>
          <p className="meta">{[item.channel, fmtDuration(item.duration_seconds), `saved ${relativeTime(item.created_at)}`].filter(Boolean).join(" · ")}</p>
          <p className="meta row wrap" style={{ gap: 12 }}>
            {item.relevance_score != null && <span className="row" style={{ gap: 8 }}><Dots n={item.relevance_score} /> relevance</span>}
            {item.estimated_minutes != null && <span>~{fmtMinutes(item.estimated_minutes)} to learn</span>}
            {ai.difficulty && <span style={{ textTransform: "capitalize" }}>{ai.difficulty}</span>}
          </p>
        </div>
      </Rise>

      <Rise>
        <div className="col" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            {!done && (isActive
              ? <Pill variant="filled" size="lg" className="grow" onClick={finish}><Check size={18} strokeWidth={2.5} /> Done learning</Pill>
              : <Pill variant="filled" size="lg" className="grow" onClick={async () => { await start(item); if (!embed) void open(item.url); }}><Play size={18} fill="currentColor" /> Start</Pill>)}
            <Pill variant="tonal" size="lg" className={done ? "grow" : ""} onClick={() => open(item.url)}><ExternalLink size={17} /> Open</Pill>
          </div>
          <div className="row wrap" style={{ gap: 4, marginLeft: -14 }}>
            {item.status === "inbox" && <Pill variant="text" size="sm" onClick={() => setStatus(item.id, "queued")}><ListPlus size={16} /> Queue</Pill>}
            {!done && !isActive && <Pill variant="text" size="sm" onClick={finish}><Check size={16} /> Mark done</Pill>}
            {!done && item.status !== "skipped" && <Pill variant="text" size="sm" onClick={() => { void setStatus(item.id, "skipped"); toast("Skipped"); }}><SkipForward size={16} /> Skip</Pill>}
            {(done || item.status === "skipped") && <Pill variant="text" size="sm" onClick={() => setStatus(item.id, "inbox")}>Back to inbox</Pill>}
            <Pill variant="text" size="sm" onClick={() => setLogOpen(true)}><Clock size={16} /> Log time</Pill>
          </div>
        </div>
      </Rise>

      {ai.takeaway && (
        <Rise>
          <section className="slab slab-primary">
            <p className="title-sm">The takeaway</p>
            <p className="body-lg selectable" style={{ marginTop: 8, color: "inherit" }}>{ai.takeaway}</p>
            <p className="meta" style={{ marginTop: 12 }}>If this is enough, mark it done without watching.</p>
          </section>
        </Rise>
      )}

      {ai.summary && <Block title="What it teaches"><p className="prose selectable">{ai.summary}</p></Block>}
      {ai.why_it_matters && <Block title="Why it matters for you"><p className="prose selectable">{ai.why_it_matters}</p></Block>}
      {!!ai.key_concepts?.length && <Block title="Key concepts"><div className="chips">{ai.key_concepts.map((k) => <Chip key={k}>{k}</Chip>)}</div></Block>}
      {!!ai.segments?.length && (
        <Block title="Worth watching">
          <div className="col" style={{ gap: 4 }}>
            {ai.segments.map((s, i) => (
              <button key={i} className="row body" style={{ gap: 12, textAlign: "left", minHeight: 44 }} onClick={() => open(item.source === "youtube" ? `${item.canonical_url}&t=${toSeconds(s.start)}s` : item.url)}>
                <span className="kbd num">{s.start}–{s.end}</span><span style={{ color: "var(--on-surface)" }}>{s.label}</span>
              </button>
            ))}
          </div>
        </Block>
      )}
      {!!ai.prerequisites?.length && <Block title="You should already know"><ul className="prose">{ai.prerequisites.map((p) => <li key={p}>{p}</li>)}</ul></Block>}
      {ai.overlap && (
        <Block title="Overlap with your library">
          <p className="prose">{ai.overlap}</p>
          {!done && item.status !== "skipped" && (
            <Pill variant="tonal" size="sm" style={{ marginTop: 10, alignSelf: "flex-start" }}
              onClick={() => { void setStatus(item.id, "skipped"); toast("Skipped — already knew this one"); }}>
              <SkipForward size={15} /> Skip, I know this
            </Pill>
          )}
        </Block>
      )}
      {!!ai.resources?.length && (
        <Block title="Resources mentioned">
          <div className="col" style={{ gap: 2 }}>
            {ai.resources.map((r) => <button key={r.url} className="row body" style={{ gap: 8, textAlign: "left", color: "var(--primary)", minHeight: 44 }} onClick={() => open(r.url)}><ExternalLink size={14} /> <span className="truncate">{r.title || r.url}</span></button>)}
          </div>
        </Block>
      )}

      {!!cats.data?.length && (
        <Block title="Category">
          <div className="chips-scroll">
            {cats.data.map((c) => <Chip key={c.id} active={c.id === item.category?.id} onClick={() => update.mutate({ id: item.id, category_id: c.id, category: c })}>{c.name}</Chip>)}
          </div>
        </Block>
      )}

      <Block title="Notes">
        <textarea className="input" defaultValue={item.notes ?? ""} placeholder="Your own notes" onBlur={(e) => { if (e.target.value !== (item.notes ?? "")) update.mutate({ id: item.id, notes: e.target.value }); }} />
      </Block>

      {item.has_transcript && (
        <Rise>
          <button className="row title-sm" style={{ gap: 8, minHeight: 44 }} onClick={() => setShowTranscript((v) => !v)}>
            <ChevronDown size={18} style={{ transform: showTranscript ? "rotate(180deg)" : undefined, transition: "transform .25s var(--spring)" }} /> Transcript
          </button>
          {showTranscript && (
            <motion.div className="slab" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={spring} style={{ overflow: "hidden", marginTop: 8 }}>
              <p className="body selectable" style={{ lineHeight: 1.7, maxHeight: 360, overflow: "auto" }}>{item.transcript}</p>
            </motion.div>
          )}
        </Rise>
      )}

      <Rise>
        <div className="row between" style={{ paddingTop: 8 }}>
          <span className="meta">{ai.model ? `Analyzed by ${ai.model}` : ai.error ? `AI error: ${ai.error}` : ""}</span>
          <Pill variant="text" size="sm" onClick={() => setConfirmDel(true)} style={{ color: "var(--error)" }}><Trash2 size={16} /> Delete</Pill>
        </div>
      </Rise>

      <Sheet open={confirmDel} onClose={() => setConfirmDel(false)} title="Delete this item?">
        <p className="body" style={{ marginBottom: 18 }}>This removes it and its learning time from your stats.</p>
        <div className="row" style={{ gap: 8 }}>
          <Pill variant="tonal" size="lg" className="grow" onClick={() => setConfirmDel(false)}>Cancel</Pill>
          <Pill variant="danger" size="lg" className="grow" onClick={async () => { await del.mutateAsync(item.id); nav("/library", { replace: true }); toast("Deleted"); }}>Delete</Pill>
        </div>
      </Sheet>

      <LogTimeSheet open={logOpen} onClose={() => setLogOpen(false)} itemId={item.id} onLogged={() => { qc.invalidateQueries({ queryKey: ["activity"] }); qc.invalidateQueries({ queryKey: ["sessions"] }); toast("Time logged"); }} />

      <FinishPromptSheet open={finishPromptOpen} onClose={() => setFinishPromptOpen(false)} itemId={item.id} hasTakeaway={!!ai.takeaway}
        onDone={async (minutes) => {
          if (minutes > 0) await logManualMinutes(item.id, minutes);
          await setStatus(item.id, "completed");
          qc.invalidateQueries({ queryKey: ["activity"] });
          qc.invalidateQueries({ queryKey: ["sessions"] });
          setFinishPromptOpen(false);
          haptic.success();
          toast("Marked as learned");
        }} />
    </Page>
  );
}

function toSeconds(mmss: string): number {
  const p = mmss.split(":").map(Number).reverse();
  return (p[0] ?? 0) + (p[1] ?? 0) * 60 + (p[2] ?? 0) * 3600;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <Rise><section className="col" style={{ gap: 10 }}><p className="title-sm">{title}</p>{children}</section></Rise>;
}

function LogTimeSheet({ open, onClose, itemId, onLogged }: { open: boolean; onClose: () => void; itemId: string; onLogged: () => void }) {
  const [busy, setBusy] = useState(false);
  const log = async (m: number) => { setBusy(true); try { await logManualMinutes(itemId, m); onLogged(); onClose(); } finally { setBusy(false); } };
  return (
    <Sheet open={open} onClose={onClose} title="Log learning time">
      <p className="body" style={{ marginBottom: 16 }}>Watched it outside the app? Add the time so your stats stay honest.</p>
      <div className="chips">{[5, 10, 15, 20, 30, 45, 60].map((m) => <Chip key={m} onClick={() => !busy && log(m)}>{m} min</Chip>)}</div>
    </Sheet>
  );
}

// A "Mark done" with no session behind it is exactly how stats end up claiming "2 things
// learned, 1 min invested" — so completing always asks for an honest minute estimate first.
// No 0-min option on purpose: if truly no time was spent, "Skip" is the honest status, not "done".
function FinishPromptSheet({ open, onClose, hasTakeaway, onDone }: {
  open: boolean; onClose: () => void; itemId: string; hasTakeaway: boolean; onDone: (minutes: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const pick = async (m: number) => { setBusy(m); try { await onDone(m); } finally { setBusy(null); } };
  return (
    <Sheet open={open} onClose={onClose} title="How long did that take?">
      <p className="body" style={{ marginBottom: 16 }}>
        {hasTakeaway ? "Even just reading the takeaway counts — pick roughly how long." : "Pick roughly how long you actually spent, so your stats stay honest."}
      </p>
      <div className="chips">{[1, 3, 5, 10, 15, 20, 30, 45, 60].map((m) => <Chip key={m} onClick={() => busy === null && pick(m)}>{m} min</Chip>)}</div>
    </Sheet>
  );
}

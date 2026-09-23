import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ExternalLink, ListPlus, Play, RefreshCw, SkipForward, Trash2, Clock } from "lucide-react";
import { logManualMinutes, useAnalyze, useCategories, useDeleteItemWithUndo, useItem, useItemTranscript, useSetStatus, useUpdateItem } from "../lib/api";
import { isDesktop } from "../lib/platform";
import { openExternal as open } from "../lib/links";
import { describeError, isNetworkError } from "../lib/errors";
import { confidence, fmtDuration, fmtMinutes, relativeTime, STATUS_LABEL } from "../lib/utils";
import { haptic } from "../lib/haptics";
import { getPref, setPref } from "../lib/store";
import { useActiveSession, useSessionStore } from "../components/SessionBar";
import { Chip, Dots, Empty, ErrorState, Page, Pill, Rise, Sheet, Skeleton, Spinner, spring, useToast } from "../components/ui";
import { useQueryClient } from "@tanstack/react-query";

export function ItemDetailScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const qc = useQueryClient();
  const items = useItem(id);
  const item = items.data;
  const setStatus = useSetStatus();
  const update = useUpdateItem();
  const del = useDeleteItemWithUndo();
  const analyze = useAnalyze();
  const [reanalyzing, setReanalyzing] = useState(false);
  const cats = useCategories();
  const active = useActiveSession();
  const start = useSessionStore((s) => s.start);
  const stop = useSessionStore((s) => s.stop);
  const [showTranscript, setShowTranscript] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [finishPromptOpen, setFinishPromptOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [lastSegment, setLastSegment] = useState<number | null>(null);
  const transcript = useItemTranscript(id, showTranscript);
  // Opened straight from a notification there's no in-app history to go back to.
  const back = () => (loc.key === "default" ? nav("/", { replace: true }) : nav(-1));
  const fail = (what: string) => (e: unknown) => toast(`${what} — ${describeError(e).message}`);

  useEffect(() => {
    if (!id) return;
    getPref<number | null>(`lastSegment:${id}`, null).then(setLastSegment);
  }, [id]);

  if (items.isPending) return <Page><Skeleton h={220} r={28} /><Skeleton h={30} w="70%" /><Skeleton h={80} /></Page>;
  if (!item && items.isError) return <Page><ErrorState error={items.error} onRetry={() => items.refetch()} /></Page>;
  if (!item) {
    return (
      <Page>
        <Empty title="This item is gone" body="It was deleted, maybe on another device." action={<Pill variant="tonal" onClick={() => nav("/library", { replace: true })} style={{ alignSelf: "flex-start" }}>Go to Library</Pill>} />
      </Page>
    );
  }

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
    if (!isActive) { setFinishPromptOpen(true); return; }
    try { await stop(true); haptic.success(); toast("Marked as learned"); }
    catch (e) { fail("Couldn't finish")(e); }
  };

  return (
    <Page>
      <Rise>
        <div className="row between">
          <Pill variant="text" size="sm" onClick={back} style={{ marginLeft: -14 }}><ArrowLeft size={18} /> Back</Pill>
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
              <span style={{ width: 64, height: 64, borderRadius: 999, background: "rgba(0,0,0,0.62)", display: "grid", placeItems: "center", color: "#fff" }}><Play size={26} fill="currentColor" /></span>
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
              : <Pill variant="filled" size="lg" className="grow" onClick={async () => { try { await start(item); if (!embed) void open(item.url); } catch (e) { fail("Couldn't start")(e); } }}><Play size={18} fill="currentColor" /> Start</Pill>)}
            <Pill variant="tonal" size="lg" className={done ? "grow" : ""} onClick={() => open(item.url)}><ExternalLink size={17} /> Open</Pill>
          </div>
          <div className="row wrap" style={{ gap: 4, marginLeft: -14 }}>
            {item.status === "inbox" && <Pill variant="text" size="sm" onClick={() => setStatus(item.id, "queued").catch(fail("Couldn't queue it"))}><ListPlus size={16} /> Queue</Pill>}
            {!done && !isActive && <Pill variant="text" size="sm" onClick={finish}><Check size={16} /> Mark done</Pill>}
            {!done && item.status !== "skipped" && <Pill variant="text" size="sm" onClick={() => { setStatus(item.id, "skipped").then(() => toast("Skipped"), fail("Couldn't skip it")); }}><SkipForward size={16} /> Skip</Pill>}
            {(done || item.status === "skipped") && <Pill variant="text" size="sm" onClick={() => setStatus(item.id, "inbox").catch(fail("Couldn't move it"))}>Back to inbox</Pill>}
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
              <button key={i} className="row body" style={{ gap: 12, textAlign: "left", minHeight: 44 }}
                onClick={() => {
                  void setPref(`lastSegment:${item.id}`, i);
                  setLastSegment(i);
                  open(item.source === "youtube" ? `${item.canonical_url}&t=${toSeconds(s.start)}s` : item.url);
                }}>
                <span className="kbd num">{s.start}–{s.end}</span>
                <span style={{ color: "var(--on-surface)" }}>{s.label}</span>
                {lastSegment === i && <Chip tone="primary">Resume here</Chip>}
              </button>
            ))}
          </div>
        </Block>
      )}
      {!!ai.prerequisites?.length && <Block title="You should already know"><ul className="prose">{ai.prerequisites.map((p) => <li key={p}>{p}</li>)}</ul></Block>}
      {ai.related_item && (
        <Block title="Builds on">
          <button className="row body" style={{ gap: 8, textAlign: "left", color: "var(--primary)", minHeight: 44 }}
            onClick={() => nav(`/item/${ai.related_item!.id}`)}>
            <ArrowRight size={15} /> <span className="truncate">{ai.related_item.title}</span>
          </button>
        </Block>
      )}
      {ai.overlap && (
        <Block title="Overlap with your library">
          <p className="prose">{ai.overlap}</p>
          {!done && item.status !== "skipped" && (
            <Pill variant="tonal" size="sm" style={{ marginTop: 10, alignSelf: "flex-start" }}
              onClick={() => { setStatus(item.id, "skipped").then(() => toast("Skipped — already knew this one"), fail("Couldn't skip it")); }}>
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
            {cats.data.map((c) => <Chip key={c.id} active={c.id === item.category?.id} onClick={() => update.mutate({ id: item.id, category_id: c.id, category: c }, { onError: fail("Couldn't change category") })}>{c.name}</Chip>)}
          </div>
        </Block>
      )}

      <Block title="Notes">
        <textarea className="input" defaultValue={item.notes ?? ""} placeholder="Your own notes" onBlur={(e) => { if (e.target.value !== (item.notes ?? "")) update.mutate({ id: item.id, notes: e.target.value }, { onError: fail("Couldn't save your note") }); }} />
      </Block>

      {item.has_transcript && (
        <Rise>
          <button className="row title-sm" style={{ gap: 8, minHeight: 44 }} onClick={() => setShowTranscript((v) => !v)}>
            <ChevronDown size={18} style={{ transform: showTranscript ? "rotate(180deg)" : undefined, transition: "transform .25s var(--spring)" }} /> {item.source === "article" ? "Full text" : "Transcript"}
          </button>
          {showTranscript && (
            <motion.div className="slab" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={spring} style={{ overflow: "hidden", marginTop: 8 }}>
              {transcript.data ? (
                <p className="body selectable" style={{ lineHeight: 1.7, maxHeight: 360, overflow: "auto" }}>{transcript.data}</p>
              ) : transcript.isError ? (
                <p className="body">{isNetworkError(transcript.error) ? "The transcript isn't saved on this device — it'll load when you're back online." : describeError(transcript.error).message}</p>
              ) : transcript.isSuccess ? (
                <p className="body">No transcript text was stored for this one.</p>
              ) : <Spinner />}
            </motion.div>
          )}
        </Rise>
      )}

      <Rise>
        <div className="row between" style={{ paddingTop: 8 }}>
          <span className="meta">{ai.model ? `Analyzed by ${ai.model}` : ai.error ? (/removed|no longer accessible/i.test(ai.error) ? ai.error : `AI error: ${ai.error}`) : ""}</span>
          <div className="row" style={{ gap: 4 }}>
            <Pill variant="text" size="sm" loading={reanalyzing} onClick={async () => {
              setReanalyzing(true);
              try {
                const r = await analyze.mutateAsync([item.url, { note: item.notes ?? undefined, reanalyzeId: item.id }]);
                toast(r.ai_error ?? "Re-analyzed");
              } catch (e) {
                toast(isNetworkError(e) ? "Re-analyzing needs a connection — try again once you're back online" : `Couldn't re-analyze — ${describeError(e).message}`);
              }
              finally { setReanalyzing(false); }
            }}><RefreshCw size={16} /> Re-analyze</Pill>
            <Pill variant="text" size="sm" onClick={() => setConfirmDel(true)} style={{ color: "var(--error)" }}><Trash2 size={16} /> Delete</Pill>
          </div>
        </div>
      </Rise>

      <Sheet open={confirmDel} onClose={() => setConfirmDel(false)} title="Delete this item?">
        <p className="body" style={{ marginBottom: 18 }}>This removes it and its learning time from your stats.</p>
        <div className="row" style={{ gap: 8 }}>
          <Pill variant="tonal" size="lg" className="grow" onClick={() => setConfirmDel(false)}>Cancel</Pill>
          <Pill variant="danger" size="lg" className="grow" onClick={() => { setConfirmDel(false); del(item); nav("/library", { replace: true }); }}>Delete</Pill>
        </div>
      </Sheet>

      <LogTimeSheet open={logOpen} onClose={() => setLogOpen(false)} itemId={item.id} onError={fail("Couldn't log that")}
        onLogged={() => { qc.invalidateQueries({ queryKey: ["activity"] }); qc.invalidateQueries({ queryKey: ["sessions"] }); toast("Time logged"); }} />

      <FinishPromptSheet open={finishPromptOpen} onClose={() => setFinishPromptOpen(false)} itemId={item.id} hasTakeaway={!!ai.takeaway}
        onDone={async (minutes) => {
          try {
            if (minutes > 0) await logManualMinutes(item.id, minutes);
            await setStatus(item.id, "completed");
          } catch (e) { fail("Couldn't mark it done")(e); return; }
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

function LogTimeSheet({ open, onClose, itemId, onLogged, onError }: { open: boolean; onClose: () => void; itemId: string; onLogged: () => void; onError: (e: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const log = async (m: number) => {
    setBusy(true);
    try { await logManualMinutes(itemId, m); onLogged(); onClose(); }
    catch (e) { onError(e); }
    finally { setBusy(false); }
  };
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

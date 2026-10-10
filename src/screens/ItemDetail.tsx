import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { motion } from "motion/react";
import { ArrowLeft, BookOpen, Bookmark, Check, ChevronRight, Copy, ExternalLink, FileText, Play, RefreshCw, SkipForward, Trash2, Undo2 } from "lucide-react";
import { logManualMinutes, useAnalyze, useCategories, useDeleteItemWithUndo, useItem, useItemTranscript, useSetStatus, useUpdateItem } from "../lib/api";
import { isDesktop } from "../lib/platform";
import { openExternal as open } from "../lib/links";
import { describeError, isNetworkError } from "../lib/errors";
import { FORMAT_LABEL, confidence, fmtDuration, fmtMinutes, formatOf, isWatchable, relativeTime } from "../lib/utils";
import { getPref, setPref } from "../lib/store";
import { useActiveSession, useSessionStore } from "../components/SessionBar";
import { FormatIcon } from "../components/ItemCard";
import { celebrateDone } from "../components/Celebrate";
import { FinishSheet } from "../components/FinishSheet";
import { Chip, Empty, ErrorState, Page, Pill, Rise, Sheet, Skeleton, Spinner, spring, useToast } from "../components/ui";
import { useQueryClient } from "@tanstack/react-query";

// Designed around how it's actually used: you decide from the title, so the page is the title,
// one line of gist, and the actions. Everything else the AI used to write is gone.
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
  const format = formatOf(item);
  const isLink = format === "link";
  const isActive = active?.itemId === item.id;
  const embed = format === "video" && item.external_id && isDesktop();
  const done = item.status === "completed";
  const trust = confidence(item);
  const host = (() => { try { return new URL(item.url).hostname.replace(/^www\./, ""); } catch { return ""; } })();

  // Only a running session logs real elapsed time. A manual "done" asks for a rough minute
  // count instead, so stats never claim things were learned in zero minutes.
  const finish = async () => {
    if (!isActive) { setFinishPromptOpen(true); return; }
    try { await stop(true); } catch (e) { fail("Couldn't finish")(e); }
  };

  const reanalyze = async (mode?: "learn" | "link") => {
    setReanalyzing(true);
    try {
      const r = await analyze.mutateAsync([item.url, { note: item.notes ?? undefined, reanalyzeId: item.id, mode }]);
      toast(r.ai_error ? "Saved, but the AI couldn't read it this time" : mode === "link" ? "Kept as a link" : mode === "learn" ? "Added to To learn" : "Refreshed");
    } catch (e) {
      toast(isNetworkError(e) ? "That needs a connection — try again once you're back online" : `Couldn't do that — ${describeError(e).message}`);
    } finally { setReanalyzing(false); }
  };

  return (
    <Page>
      <Rise>
        <div className="row between">
          <Pill variant="text" size="sm" onClick={back} style={{ marginLeft: -14 }}><ArrowLeft size={18} /> Back</Pill>
          <div className="row" style={{ gap: 6 }}>
            {trust && <Chip tone={trust.tone}>{trust.label}</Chip>}
            {done && <Chip tone="primary">Done</Chip>}
            {item.status === "skipped" && <Chip>Skipped</Chip>}
          </div>
        </div>
      </Rise>

      <Rise>
        {embed ? (
          <div className="player"><iframe src={`https://www.youtube-nocookie.com/embed/${item.external_id}?rel=0&modestbranding=1`} title={item.title ?? ""} allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen /></div>
        ) : item.thumbnail_url ? (
          <motion.button className="thumb thumb-lg" data-format={format} layoutId={`thumb-${item.id}`} transition={spring} onClick={() => open(item.url)} style={{ position: "relative" }} whileTap={{ scale: 0.99 }}>
            <img src={item.thumbnail_url} alt="" />
            {isWatchable(format) && (
              <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                <span style={{ width: 64, height: 64, borderRadius: 999, background: "rgba(0,0,0,0.62)", display: "grid", placeItems: "center", color: "#fff" }}><Play size={26} fill="currentColor" /></span>
              </span>
            )}
          </motion.button>
        ) : null}
      </Rise>

      <Rise>
        <div className="col" style={{ gap: 10 }}>
          <h1 className="headline selectable">{item.title}</h1>
          <p className="meta row wrap" style={{ gap: 10 }}>
            <span className="row" style={{ gap: 5 }}><FormatIcon item={item} size={15} /> {FORMAT_LABEL[format]}</span>
            {[isLink ? host : item.channel, fmtDuration(item.duration_seconds), !isLink && item.estimated_minutes != null ? `~${fmtMinutes(item.estimated_minutes)} to learn` : null, `saved ${relativeTime(item.created_at)}`]
              .filter(Boolean).map((t) => <span key={t as string}>{t}</span>)}
          </p>
          {isLink ? (item.description && <p className="body clamp-3" style={{ color: "var(--on-surface-2)" }}>{item.description}</p>)
            : ai.summary && <p className="body-lg selectable" style={{ color: "var(--on-surface-2)" }}>{ai.summary}</p>}
          {!isLink && !!ai.key_concepts?.length && <div className="chips">{ai.key_concepts.slice(0, 5).map((k) => <Chip key={k}>{k}</Chip>)}</div>}
        </div>
      </Rise>

      <Rise>
        {isLink ? (
          <div className="row" style={{ gap: 8 }}>
            <Pill variant="filled" size="lg" className="grow" onClick={() => open(item.url)}><ExternalLink size={17} /> Open</Pill>
            <Pill variant="tonal" size="lg" loading={reanalyzing} onClick={() => reanalyze("learn")}><BookOpen size={17} /> Learn it</Pill>
          </div>
        ) : (
          <div className="col" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 8 }}>
              {done ? (
                <Pill variant="filled" size="lg" className="grow" onClick={() => setStatus(item.id, "queued").then(() => toast("Back on your To learn list — logged time is kept"), fail("Couldn't change it"))}>
                  <Undo2 size={17} /> Mark not done
                </Pill>
              ) : isActive ? (
                <Pill variant="filled" size="lg" className="grow" onClick={finish}><Check size={18} strokeWidth={2.5} /> Done learning</Pill>
              ) : (
                <Pill variant="filled" size="lg" className="grow" onClick={async () => { try { await start(item); if (!embed) void open(item.url); } catch (e) { fail("Couldn't start")(e); } }}>
                  <Play size={18} fill="currentColor" /> Start
                </Pill>
              )}
              <Pill variant="tonal" size="lg" icon aria-label="Open" onClick={() => open(item.url)}><ExternalLink size={18} /></Pill>
            </div>
            <div className="row wrap" style={{ gap: 4, marginLeft: -14 }}>
              {!done && !isActive && <Pill variant="text" size="sm" onClick={finish}><Check size={16} /> Mark done</Pill>}
              {!done && item.status !== "skipped" && <Pill variant="text" size="sm" onClick={() => { setStatus(item.id, "skipped").then(() => toast("Skipped"), fail("Couldn't skip it")); }}><SkipForward size={16} /> Skip</Pill>}
              {item.status === "skipped" && <Pill variant="text" size="sm" onClick={() => setStatus(item.id, "queued").then(() => toast("Back on your To learn list"), fail("Couldn't move it"))}><Undo2 size={16} /> Back to To learn</Pill>}
            </div>
          </div>
        )}
      </Rise>

      {format === "video" && !!ai.segments?.length && (
        <Block title="Worth watching">
          <div className="col" style={{ gap: 4 }}>
            {ai.segments.map((s, i) => (
              <button key={i} className="row body" style={{ gap: 12, textAlign: "left", minHeight: 44 }}
                onClick={() => {
                  void setPref(`lastSegment:${item.id}`, i);
                  setLastSegment(i);
                  open(`${item.canonical_url}&t=${toSeconds(s.start)}s`);
                }}>
                <span className="kbd num">{s.start}</span>
                <span className="grow" style={{ color: "var(--on-surface)" }}>{s.label}</span>
                {lastSegment === i && <Chip tone="primary">Resume here</Chip>}
              </button>
            ))}
          </div>
        </Block>
      )}

      {isWatchable(format) && item.has_transcript && (
        <Rise>
          <button className="setting" style={{ marginLeft: -4 }} onClick={() => setShowTranscript(true)}>
            <span className="setting-icon"><FileText size={18} /></span>
            <div className="grow"><div className="title-sm">Transcript</div><div className="meta">Read, search or copy it</div></div>
            <ChevronRight size={18} className="meta" />
          </button>
        </Rise>
      )}

      <TranscriptSheet open={showTranscript} onClose={() => setShowTranscript(false)} title="Transcript" query={transcript} />

      {!isLink && !!cats.data?.length && (
        <Block title="Area">
          <div className="chips-scroll">
            {cats.data.map((c) => <Chip key={c.id} active={c.id === item.category?.id} onClick={() => update.mutate({ id: item.id, category_id: c.id, category: c }, { onError: fail("Couldn't change area") })}>{c.name}</Chip>)}
          </div>
        </Block>
      )}

      <Block title="Note">
        <textarea className="input" defaultValue={item.notes ?? ""} placeholder={isLink ? "Why you kept this" : "Your own notes"} onBlur={(e) => { if (e.target.value !== (item.notes ?? "")) update.mutate({ id: item.id, notes: e.target.value }, { onError: fail("Couldn't save your note") }); }} />
      </Block>

      <Rise>
        <div className="row wrap" style={{ gap: 4, marginLeft: -14, paddingTop: 4 }}>
          {!isLink && <Pill variant="text" size="sm" loading={reanalyzing} onClick={() => reanalyze()}><RefreshCw size={16} /> Refresh</Pill>}
          {!isLink && !done && <Pill variant="text" size="sm" onClick={() => reanalyze("link")}><Bookmark size={16} /> Just keep the link</Pill>}
          <span className="grow" />
          <Pill variant="text" size="sm" onClick={() => setConfirmDel(true)} style={{ color: "var(--error)" }}><Trash2 size={16} /> Delete</Pill>
        </div>
      </Rise>

      <Sheet open={confirmDel} onClose={() => setConfirmDel(false)} title="Delete this?">
        <p className="body" style={{ marginBottom: 18 }}>{isLink ? "It'll be removed from your saved links." : "This removes it and its learning time from your stats."}</p>
        <div className="row" style={{ gap: 8 }}>
          <Pill variant="tonal" size="lg" className="grow" onClick={() => setConfirmDel(false)}>Cancel</Pill>
          <Pill variant="danger" size="lg" className="grow" onClick={() => { setConfirmDel(false); del(item); nav("/library", { replace: true }); }}>Delete</Pill>
        </div>
      </Sheet>

      <FinishSheet open={finishPromptOpen} onClose={() => setFinishPromptOpen(false)}
        onDone={async (minutes) => {
          try {
            if (minutes > 0) await logManualMinutes(item.id, minutes);
            await setStatus(item.id, "completed");
          } catch (e) { fail("Couldn't mark it done")(e); return; }
          qc.invalidateQueries({ queryKey: ["activity"] });
          qc.invalidateQueries({ queryKey: ["sessions"] });
          setFinishPromptOpen(false);
          celebrateDone(item.title);
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

/** Captions often arrive as one unpunctuated wall of text — break it into readable paragraphs:
 * by sentences when there's punctuation, by word count when there isn't. */
function paragraphs(text: string): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [];
  const out: string[] = [];
  if (sentences.length > 3) {
    for (let i = 0; i < sentences.length; i += 4) out.push(sentences.slice(i, i + 4).join("").trim());
  } else {
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i += 70) out.push(words.slice(i, i + 70).join(" "));
  }
  return out.filter(Boolean);
}

function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i} className="find-hit">{p}</mark> : p))}</>;
}

function TranscriptSheet({ open, onClose, title, query }: {
  open: boolean; onClose: () => void; title: string; query: ReturnType<typeof useItemTranscript>;
}) {
  const toast = useToast();
  const [find, setFind] = useState("");
  const paras = useMemo(() => (query.data ? paragraphs(query.data) : []), [query.data]);
  const term = find.trim().toLowerCase();
  const shown = term.length >= 2 ? paras.filter((p) => p.toLowerCase().includes(term)) : paras;
  return (
    <Sheet open={open} onClose={onClose} title={title} className="sheet-reader">
      {query.data ? (
        <div className="col" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 8 }}>
            <input className="input grow" placeholder="Find in transcript" value={find} onChange={(e) => setFind(e.target.value)} enterKeyHint="search" />
            <Pill variant="tonal" icon aria-label="Copy transcript" onClick={async () => {
              try { await navigator.clipboard.writeText(query.data!); toast("Copied"); }
              catch { toast("Couldn't copy automatically — long-press the text to select it"); }
            }}><Copy size={17} /></Pill>
          </div>
          {term.length >= 2 && <p className="meta">{shown.length ? `${shown.length} matching ${shown.length === 1 ? "part" : "parts"}` : "Not mentioned in this one"}</p>}
          <div className="col selectable" style={{ gap: 14 }}>
            {shown.map((p, i) => <p key={i} className="prose"><Highlight text={p} term={term.length >= 2 ? find.trim() : ""} /></p>)}
          </div>
        </div>
      ) : query.isError ? (
        <p className="body">{isNetworkError(query.error) ? "The transcript isn't saved on this device — it'll load when you're back online." : describeError(query.error).message}</p>
      ) : query.isSuccess ? (
        <p className="body">No transcript text was stored for this one.</p>
      ) : <div style={{ display: "grid", placeItems: "center", padding: 24 }}><Spinner /></div>}
    </Sheet>
  );
}

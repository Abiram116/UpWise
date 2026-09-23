import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { motion } from "motion/react";
import { Search, Trash2, X } from "lucide-react";
import { useCategories, useItems, useSetStatus, useDeleteItemWithUndo, useTranscriptSearch } from "../lib/api";
import { neglectedItems } from "../lib/stats";
import { getPref, setPref } from "../lib/store";
import { relativeTime, pluralize } from "../lib/utils";
import type { Item, ItemStatus } from "../lib/types";
import { ItemRow } from "../components/ItemCard";
import { Chip, Empty, ErrorState, Page, Pill, Rise, Segmented, Sheet, Skeleton, stagger } from "../components/ui";

type Filter = "todo" | "done" | "all";
const GROOM_SNOOZE_DAYS = 7;

export function LibraryScreen() {
  const items = useItems();
  const cats = useCategories();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  // Transcripts are searched on the server (the list never downloads them), so wait for a
  // pause in typing instead of firing a request per keystroke.
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q), 350); return () => clearTimeout(t); }, [q]);
  const transcriptHits = useTranscriptSearch(debouncedQ).data;
  const filter = (params.get("f") as Filter) || "todo";
  const cat = params.get("cat");
  const [groomOpen, setGroomOpen] = useState(false);
  const [groomSnoozed, setGroomSnoozed] = useState(true); // assume snoozed until pref loads, to avoid a flash

  const neglected = useMemo(() => neglectedItems(items.data ?? []), [items.data]);

  useEffect(() => {
    getPref<number>("groomSnoozeUntil", 0).then((until) => setGroomSnoozed(Date.now() < until));
  }, []);

  const dismissGroom = () => {
    setGroomSnoozed(true);
    void setPref("groomSnoozeUntil", Date.now() + GROOM_SNOOZE_DAYS * 86400e3);
  };

  const list = useMemo(() => {
    let l = items.data ?? [];
    const todo: ItemStatus[] = ["inbox", "queued", "in_progress"];
    if (filter === "todo") l = l.filter((i) => todo.includes(i.status));
    if (filter === "done") l = l.filter((i) => i.status === "completed");
    if (cat) l = l.filter((i) => i.category?.id === cat);
    if (q.trim()) {
      const s = q.toLowerCase();
      l = l.filter((i) =>
        (i.title ?? "").toLowerCase().includes(s) ||
        i.tags.some((t) => t.includes(s)) ||
        (i.ai?.summary ?? "").toLowerCase().includes(s) ||
        (i.ai?.key_concepts ?? []).some((c) => c.toLowerCase().includes(s)) ||
        !!transcriptHits?.has(i.id),
      );
    }
    if (filter === "todo") {
      const rank: Record<string, number> = { in_progress: 0, queued: 1, inbox: 2 };
      l = [...l].sort((a, b) => rank[a.status] - rank[b.status] || (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
    }
    return l;
  }, [items.data, filter, cat, q, transcriptHits]);

  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    setParams(p, { replace: true });
  };

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items.data ?? []) {
      if (filter === "todo" && !["inbox", "queued", "in_progress"].includes(i.status)) continue;
      if (filter === "done" && i.status !== "completed") continue;
      if (i.category) m.set(i.category.id, (m.get(i.category.id) ?? 0) + 1);
    }
    return m;
  }, [items.data, filter]);

  return (
    <Page>
      <Rise><header><h1 className="display">Library</h1></header></Rise>

      {!groomSnoozed && neglected.length > 0 && (
        <Rise>
          <div className="slab row" style={{ alignItems: "center", gap: 12 }}>
            <div className="grow">
              <div className="title-sm">{pluralize(neglected.length, "item")} waiting 2+ weeks</div>
              <div className="meta">Worth a quick keep-or-clear pass?</div>
            </div>
            <Pill variant="tonal" onClick={() => setGroomOpen(true)}>Review</Pill>
            <button aria-label="Dismiss" className="pill pill-text pill-icon" onClick={dismissGroom}><X size={16} /></button>
          </div>
        </Rise>
      )}

      <Rise>
        <div className="col" style={{ gap: 12 }}>
          <div className="searchbar">
            <Search size={18} strokeWidth={2} />
            <input className="input" placeholder="Search titles, concepts, even transcripts" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
          </div>
          <Segmented value={filter} onChange={(v) => set("f", v)} options={[{ value: "todo", label: "To learn" }, { value: "done", label: "Done" }, { value: "all", label: "All" }]} />
          {!!cats.data?.length && (
            <div className="chips-scroll">
              {[...cats.data].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)).map((c) => {
                const n = counts.get(c.id) ?? 0;
                if (!n) return null;
                return <Chip key={c.id} active={cat === c.id} onClick={() => set("cat", cat === c.id ? null : c.id)}>{c.name} <span style={{ opacity: 0.55 }}>{n}</span></Chip>;
              })}
            </div>
          )}
        </div>
      </Rise>

      {!items.data && items.isError ? <ErrorState error={items.error} onRetry={() => items.refetch()} /> : items.isPending ? (
        <div className="col">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={64} r={18} />)}</div>
      ) : list.length === 0 ? (
        <Empty title={q ? "No matches" : filter === "done" ? "Nothing finished yet" : "All clear"} body={q ? "Try a different search." : filter === "done" ? "Finish something and it lands here." : "Save a link to get started."} />
      ) : (
        <motion.div className="rows" variants={stagger} initial="hidden" animate="show" key={`${filter}-${cat}-${debouncedQ}`}>
          {list.map((i) => <ItemRow key={i.id} item={i} />)}
        </motion.div>
      )}

      <Sheet open={groomOpen} onClose={() => { setGroomOpen(false); dismissGroom(); }} title="Waiting a while">
        <div className="col" style={{ gap: 4 }}>
          {neglected.length === 0
            ? <p className="meta">All caught up.</p>
            : neglected.map((i) => <GroomRow key={i.id} item={i} />)}
        </div>
      </Sheet>
    </Page>
  );
}

function GroomRow({ item }: { item: Item }) {
  const setStatus = useSetStatus();
  const del = useDeleteItemWithUndo();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <motion.div layout className="row" style={{ gap: 10, padding: "10px 4px", alignItems: "center", borderBottom: "1px solid var(--surface-high)" }}>
      <div className="grow col" style={{ gap: 2 }}>
        <div className="truncate" style={{ fontSize: 14.5, fontWeight: 500 }}>{item.title ?? item.url}</div>
        <div className="meta">{item.ai?.summary ?? `Saved ${relativeTime(item.created_at)}`}</div>
      </div>
      <Pill variant="text" size="sm" onClick={() => setGone(true)}>Keep</Pill>
      <Pill variant="tonal" size="sm" onClick={async () => { await setStatus(item.id, "skipped"); setGone(true); }}>Skip</Pill>
      <button aria-label="Delete" className="pill pill-text pill-icon" style={{ color: "var(--error)" }}
        onClick={() => { del(item); setGone(true); }}>
        <Trash2 size={16} />
      </button>
    </motion.div>
  );
}

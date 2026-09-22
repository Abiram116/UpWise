import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { motion } from "motion/react";
import { Search } from "lucide-react";
import { useCategories, useItems } from "../lib/api";
import type { ItemStatus } from "../lib/types";
import { ItemRow } from "../components/ItemCard";
import { Chip, Empty, ErrorState, Page, Rise, Segmented, Skeleton, stagger } from "../components/ui";

type Filter = "todo" | "done" | "all";

export function LibraryScreen() {
  const items = useItems();
  const cats = useCategories();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const filter = (params.get("f") as Filter) || "todo";
  const cat = params.get("cat");

  const list = useMemo(() => {
    let l = items.data ?? [];
    const todo: ItemStatus[] = ["inbox", "queued", "in_progress"];
    if (filter === "todo") l = l.filter((i) => todo.includes(i.status));
    if (filter === "done") l = l.filter((i) => i.status === "completed");
    if (cat) l = l.filter((i) => i.category?.id === cat);
    if (q.trim()) {
      const s = q.toLowerCase();
      l = l.filter((i) => (i.title ?? "").toLowerCase().includes(s) || i.tags.some((t) => t.includes(s)) || (i.ai?.summary ?? "").toLowerCase().includes(s));
    }
    if (filter === "todo") {
      const rank: Record<string, number> = { in_progress: 0, queued: 1, inbox: 2 };
      l = [...l].sort((a, b) => rank[a.status] - rank[b.status] || (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
    }
    return l;
  }, [items.data, filter, cat, q]);

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

      <Rise>
        <div className="col" style={{ gap: 12 }}>
          <div className="searchbar">
            <Search size={18} strokeWidth={2} />
            <input className="input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
          </div>
          <Segmented value={filter} onChange={(v) => set("f", v)} options={[{ value: "todo", label: "To learn" }, { value: "done", label: "Done" }, { value: "all", label: "All" }]} />
          {!!cats.data?.length && (
            <div className="chips-scroll">
              {cats.data.map((c) => {
                const n = counts.get(c.id) ?? 0;
                if (!n && filter !== "all") return null;
                return <Chip key={c.id} active={cat === c.id} onClick={() => set("cat", cat === c.id ? null : c.id)}>{c.name} <span style={{ opacity: 0.55 }}>{n}</span></Chip>;
              })}
            </div>
          )}
        </div>
      </Rise>

      {items.isError ? <ErrorState message={items.error.message} onRetry={() => items.refetch()} /> : items.isLoading ? (
        <div className="col">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={64} r={18} />)}</div>
      ) : list.length === 0 ? (
        <Empty title={q ? "No matches" : filter === "done" ? "Nothing finished yet" : "All clear"} body={q ? "Try a different search." : filter === "done" ? "Finish something and it lands here." : "Save a link to get started."} />
      ) : (
        <motion.div className="rows" variants={stagger} initial="hidden" animate="show" key={`${filter}-${cat}-${q}`}>
          {list.map((i) => <ItemRow key={i.id} item={i} />)}
        </motion.div>
      )}
    </Page>
  );
}

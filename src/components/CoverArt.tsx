import { useMemo, useState } from "react";
import type { Item, ItemFormat } from "../lib/types";
import { formatOf } from "../lib/utils";

// Generated cover art for anything the source doesn't give us a preview image for (reels,
// posts, plain links, topics, notes — or an image that fails to load). Each format has its own
// palette and glyph, so you can tell a reel from a Short from a video at a glance, and each
// item's id seeds the gradient angle and the soft light blobs, so no two covers are identical.
// Pure SVG with radial gradients (no blur filters) — free to render and to scroll.
const PALETTES: Record<ItemFormat, [string, string, string, string]> = {
  video: ["#2a070c", "#C4302B", "#FF6B4A", "#FFD2C2"],
  short: ["#25082a", "#D81B60", "#FF7A5C", "#FFD6E0"],
  reel: ["#1b0d3a", "#8A3FFC", "#F03E6E", "#FFB347"],
  post: ["#0e2236", "#2F6FDB", "#6CC1F5", "#D9F0FF"],
  article: ["#0b2a1f", "#1B7A58", "#52CC92", "#F1EAD3"],
  link: ["#0f2238", "#2563C9", "#3FC2B0", "#DDF7F0"],
  topic: ["#16143a", "#4B4ACF", "#8E7CF0", "#FFD27A"],
  note: ["#33260a", "#C99A2B", "#F2CF62", "#FFF3CC"],
};

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const rnd = (seed: number, n: number) => ((Math.imul(seed ^ (n * 0x9e3779b1), 0x85ebca6b) >>> 0) % 1000) / 1000;

function Glyph({ f, letter }: { f: ItemFormat; letter: string }) {
  const stroke = { fill: "none", stroke: "#fff", strokeWidth: 7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, opacity: 0.95 };
  switch (f) {
    case "video": return <g><rect x="-52" y="-34" width="104" height="68" rx="18" fill="#fff" opacity=".95" /><path d="M-10 -16 L22 0 L-10 16Z" fill="#C4302B" /></g>;
    case "short": return <g><rect x="-30" y="-52" width="60" height="104" rx="16" fill="none" stroke="#fff" strokeWidth="7" opacity=".95" /><path d="M5 -26 L-12 4 h12 l-5 24 L14 -4 H2 Z" fill="#fff" /></g>;
    case "reel": return <g><rect x="-34" y="-34" width="68" height="68" rx="20" {...stroke} /><circle cx="0" cy="0" r="9" fill="#fff" opacity=".95" /><path d="M-34 -14 H34" {...stroke} strokeWidth={5} /><path d="M-12 -34 L-4 -14 M10 -34 L18 -14" {...stroke} strokeWidth={5} /></g>;
    case "post": return <g>{[[-38, -38], [4, -38], [-38, 4], [4, 4]].map(([x, y], i) => <rect key={i} x={x} y={y} width="34" height="34" rx="9" fill="#fff" opacity={i % 3 === 0 ? 0.95 : 0.45} />)}</g>;
    case "article": return <g><text x="-58" y="14" fontSize="86" fontWeight="700" fill="#fff" fontFamily="Georgia, serif" opacity=".96">{letter}</text>{[-10, 10, 30].map((y, i) => <path key={y} d={`M18 ${y} H${70 - i * 12}`} {...stroke} strokeWidth={6} opacity={0.75 - i * 0.12} />)}</g>;
    case "link": return <g><circle cx="0" cy="0" r="40" {...stroke} /><ellipse cx="0" cy="0" rx="18" ry="40" {...stroke} strokeWidth={5} /><path d="M-40 0 H40 M-34 -20 H34 M-34 20 H34" {...stroke} strokeWidth={4} opacity={0.7} /></g>;
    case "topic": return <g><path d="M0 -44 a28 28 0 0 1 16 51 v10 h-32 v-10 a28 28 0 0 1 16 -51Z" fill="#fff" opacity=".96" /><path d="M-12 26 h24 M-9 36 h18" {...stroke} strokeWidth={6} /><path d="M-52 -4 h-10 M52 -4 h10 M-38 -36 l-8 -8 M38 -36 l8 -8" {...stroke} strokeWidth={5} opacity={0.8} /></g>;
    case "note": return <g><rect x="-38" y="-46" width="76" height="92" rx="12" fill="#fff" opacity=".96" />{[-22, -6, 10].map((y, i) => <path key={y} d={`M-24 ${y} H${24 - i * 10}`} stroke="#C99A2B" strokeWidth="6" strokeLinecap="round" />)}</g>;
  }
}

export function CoverArt({ item, className }: { item: Item; className?: string }) {
  const f = formatOf(item);
  const tall = f === "short" || f === "reel";
  const [W, H] = tall ? [180, 320] : [320, 180];
  const art = useMemo(() => {
    const seed = hash(item.id || item.url || item.title || f);
    const [a, b, c, d] = PALETTES[f];
    const angle = 110 + Math.floor(rnd(seed, 1) * 100);
    const blobs = [0, 1, 2].map((i) => ({ x: rnd(seed, 10 + i) * W, y: rnd(seed, 20 + i) * H, r: (0.45 + rnd(seed, 30 + i) * 0.55) * Math.max(W, H) * 0.7, col: i === 0 ? c : i === 1 ? b : d, o: i === 2 ? 0.28 : 0.55 }));
    const host = (() => { try { return new URL(item.url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
    const letter = ((f === "link" ? host : item.title) ?? "·").trim().charAt(0).toUpperCase() || "·";
    return { a, b, angle, blobs, id: `cv${seed.toString(36)}`, letter };
  }, [item.id, item.url, item.title, f, W, H]);
  const rad = (art.angle * Math.PI) / 180;
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden style={{ display: "block" }}>
      <defs>
        <linearGradient id={`${art.id}g`} gradientUnits="userSpaceOnUse" x1={W / 2 - Math.cos(rad) * W} y1={H / 2 - Math.sin(rad) * H} x2={W / 2 + Math.cos(rad) * W} y2={H / 2 + Math.sin(rad) * H}>
          <stop offset="0" stopColor={art.a} /><stop offset="1" stopColor={art.b} />
        </linearGradient>
        {art.blobs.map((bl, i) => <radialGradient key={i} id={`${art.id}b${i}`}><stop offset="0" stopColor={bl.col} stopOpacity={bl.o} /><stop offset="1" stopColor={bl.col} stopOpacity="0" /></radialGradient>)}
      </defs>
      <rect width={W} height={H} fill={`url(#${art.id}g)`} />
      {art.blobs.map((bl, i) => <circle key={i} cx={bl.x} cy={bl.y} r={bl.r} fill={`url(#${art.id}b${i})`} />)}
      <g transform={`translate(${W / 2} ${H / 2}) scale(${tall ? 1.15 : 1})`}><Glyph f={f} letter={art.letter} /></g>
    </svg>
  );
}

/** The preview image when there is one (and it loads); otherwise the generated cover. */
export function ItemThumb({ item, className }: { item: Item; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (item.thumbnail_url && !failed) return <img className={className} src={item.thumbnail_url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  return <CoverArt item={item} className={className} />;
}

// A tiny canvas confetti engine (no dependency). One full-screen canvas that exists only while
// something is flying, physics in px/second so it looks identical at 60 and 120 Hz, and it
// removes itself the moment the last piece fades.
export type Pattern = "cannons" | "burst" | "rain" | "fountain" | "spiral" | "pop";
type Shape = "rect" | "circle" | "star" | "ribbon";

interface Bit {
  x: number; y: number; vx: number; vy: number; rot: number; vr: number;
  w: number; h: number; shape: Shape; color: string; flip: number; vf: number;
  age: number; life: number; delay: number;
}

const COLORS = ["#52CC92", "#FFB547", "#FFF3D6", "#FF7A66", "#8FD6FF", "#C9A7FF", "#FFE08A"];
const SHAPES: Shape[] = ["rect", "rect", "circle", "star", "ribbon"];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function bit(x: number, y: number, speed: number, angle: number, delay = 0, palette = COLORS): Bit {
  const shape = pick(SHAPES);
  const s = rnd(7, 13);
  return {
    x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, rot: rnd(0, 6.28), vr: rnd(-9, 9),
    w: shape === "ribbon" ? s * 0.45 : s, h: shape === "ribbon" ? s * 2.4 : shape === "rect" ? s * 0.62 : s,
    shape, color: pick(palette), flip: rnd(0, 6.28), vf: rnd(5, 13), age: 0, life: rnd(1.9, 2.9), delay,
  };
}

function launch(p: Pattern, W: number, H: number, power: number): Bit[] {
  const n = (c: number) => Math.round(c * power);
  const out: Bit[] = [];
  const deg = (d: number) => (d * Math.PI) / 180;
  switch (p) {
    case "cannons":
      for (let i = 0; i < n(55); i++) {
        out.push(bit(-10, H * 0.88, rnd(900, 1500), deg(rnd(-72, -42)), i * 0.004));
        out.push(bit(W + 10, H * 0.88, rnd(900, 1500), deg(rnd(-138, -108)), i * 0.004));
      }
      break;
    case "burst":
      for (let i = 0; i < n(110); i++) out.push(bit(W / 2, H * 0.44, rnd(300, 1100), rnd(0, 6.283)));
      break;
    case "rain":
      for (let i = 0; i < n(120); i++) { const b = bit(rnd(0, W), -20, rnd(80, 260), deg(rnd(70, 110)), rnd(0, 0.9)); b.life = rnd(2.6, 3.4); out.push(b); }
      break;
    case "fountain":
      for (let i = 0; i < n(110); i++) out.push(bit(W / 2 + rnd(-24, 24), H * 0.92, rnd(1100, 1800), deg(rnd(-112, -68)), rnd(0, 0.7)));
      break;
    case "spiral":
      for (let i = 0; i < n(100); i++) out.push(bit(W / 2, H * 0.44, rnd(450, 900), (i / 12) * 1.9, i * 0.008));
      break;
    case "pop":
      for (let k = 0; k < 3; k++) {
        const cx = rnd(W * 0.25, W * 0.75), cy = rnd(H * 0.22, H * 0.45);
        for (let i = 0; i < n(34); i++) out.push(bit(cx, cy, rnd(180, 620), rnd(0, 6.283), k * 0.18));
      }
      break;
  }
  return out;
}

function star(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

let running: HTMLCanvasElement | null = null;

export function confetti(pattern: Pattern, power = 1) {
  if (typeof document === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  running?.remove();
  const W = window.innerWidth, H = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cv = document.createElement("canvas");
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:75;pointer-events:none";
  document.body.appendChild(cv);
  running = cv;
  const ctx = cv.getContext("2d");
  if (!ctx) { cv.remove(); return; }
  ctx.scale(dpr, dpr);
  const bits = launch(pattern, W, H, power);
  let last = performance.now();

  const frame = (now: number) => {
    if (running !== cv) return;
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const b of bits) {
      if (b.delay > 0) { b.delay -= dt; alive++; continue; }
      b.age += dt;
      if (b.age >= b.life || b.y > H + 40) continue;
      alive++;
      // gravity + air drag; ribbons flutter (more drag) so they drift instead of dropping like stones
      b.vy += 1500 * dt;
      const drag = b.shape === "ribbon" ? 2.6 : 1.5;
      b.vx -= b.vx * drag * dt; b.vy -= b.vy * drag * 0.45 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.rot += b.vr * dt; b.flip += b.vf * dt;
      const fade = Math.min(1, (b.life - b.age) / 0.6);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.scale(1, Math.cos(b.flip)); // tumbling in 3D: the piece turns edge-on and back
      ctx.fillStyle = b.color;
      if (b.shape === "circle") { ctx.beginPath(); ctx.arc(0, 0, b.w / 2, 0, 6.283); ctx.fill(); }
      else if (b.shape === "star") star(ctx, b.w * 0.75);
      else ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    if (alive) requestAnimationFrame(frame);
    else { cv.remove(); if (running === cv) running = null; }
  };
  requestAnimationFrame(frame);
}

export function stopConfetti() { running?.remove(); running = null; }

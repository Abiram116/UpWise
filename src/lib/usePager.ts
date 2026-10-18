import { useLayoutEffect, useRef } from "react";
import { watchMotion } from "./diag";

// A vertical one-card-per-swipe pager, the way Reels/Shorts behave — instead of CSS scroll-snap.
// Scroll-snap leaves the hand-off between your fling and the snap to the browser, which on
// Android WebView can stop a fling short, pause, then snap; this owns the whole gesture:
//   • while your finger is down the track follows it 1:1 (one transform write per frame)
//   • on release, a flick of any length (velocity) or a drag past ~18% moves exactly one card
//   • the settle is a Web Animation on transform, so it runs on the compositor — the main
//     thread can be busy and the motion still doesn't hitch
//   • nothing in React re-renders until the card has landed (onLand)

const EASE = "cubic-bezier(0.22, 0.9, 0.24, 1)";
const SLOP = 8; // px before a touch counts as a drag (taps on buttons stay taps)
const FLICK = 0.35; // px/ms
const DISTANCE = 0.18; // of a card's height

type Gesture = { id: number; x0: number; y0: number; p0: number; samples: [number, number][]; dragging: boolean };

export function usePager(count: number, index: number, onLand: (i: number) => void, onMove?: (nearest: number) => void) {
  const view = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const h = useRef(0);
  const y = useRef(0);
  const cur = useRef(index);
  const anim = useRef<Animation | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef(0);
  const pending = useRef<number | null>(null);
  const swallowClick = useRef(false);
  const wheel = useRef({ acc: 0, until: 0 });
  const live = useRef({ count, onLand, onMove });
  live.current = { count, onLand, onMove };

  const write = (v: number) => { y.current = v; if (track.current) track.current.style.transform = `translate3d(0,${v}px,0)`; };
  const nearest = () => (h.current ? Math.round(-y.current / h.current) : 0);

  /** Freeze an in-flight settle exactly where it is on screen. */
  const stop = () => {
    const a = anim.current, t = track.current;
    if (!a || !t) return;
    const m = new DOMMatrixReadOnly(getComputedStyle(t).transform);
    a.cancel(); anim.current = null; write(m.m42);
  };

  const go = (target: number, velocity = 0) => {
    const t = track.current;
    if (!t || !h.current) return;
    const i = Math.max(0, Math.min(live.current.count - 1, target));
    const from = y.current, to = -i * h.current;
    anim.current?.cancel();
    write(to); // the resting value underneath; the animation plays over it
    const dist = Math.abs(to - from);
    const land = () => { cur.current = i; live.current.onLand(i); };
    if (dist < 0.5) { anim.current = null; land(); return; }
    const speed = Math.max(Math.abs(velocity), 1.4);
    const duration = Math.max(200, Math.min(440, (dist / speed) * 1.6));
    watchMotion(duration + 50);
    const a = t.animate([{ transform: `translate3d(0,${from}px,0)` }, { transform: `translate3d(0,${to}px,0)` }], { duration, easing: EASE });
    anim.current = a;
    a.onfinish = () => { if (anim.current === a) { anim.current = null; land(); } };
  };

  // An index set from outside (switching tabs, the list re-ordering under us): jump, no animation.
  useLayoutEffect(() => {
    if (index === cur.current && Math.abs(y.current + index * h.current) < 1) return;
    anim.current?.cancel(); anim.current = null;
    cur.current = index; write(-index * h.current);
  }, [index]);

  // Measured whenever the viewport element appears (the screen may mount it after a loading
  // state) and whenever it resizes.
  const ro = useRef<ResizeObserver | null>(null);
  const setView = (el: HTMLDivElement | null) => {
    if (el === view.current) return;
    ro.current?.disconnect(); ro.current = null;
    view.current = el;
    if (!el) return;
    const measure = () => { h.current = el.clientHeight; if (!anim.current && !gesture.current?.dragging) write(-cur.current * h.current); };
    measure();
    ro.current = new ResizeObserver(measure);
    ro.current.observe(el);
  };
  useLayoutEffect(() => () => { ro.current?.disconnect(); cancelAnimationFrame(frame.current); anim.current?.cancel(); }, []);

  const end = (e: React.PointerEvent, cancelled: boolean) => {
    const s = gesture.current;
    if (!s || s.id !== e.pointerId) return;
    gesture.current = null;
    if (!s.dragging) { if (Math.abs(y.current + cur.current * h.current) > 0.5) go(nearest()); return; }
    swallowClick.current = true;
    window.setTimeout(() => { swallowClick.current = false; }, 60);
    if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0; }
    if (pending.current != null) { write(pending.current); pending.current = null; }
    // release velocity over the last ~100 ms of movement
    const last = s.samples[s.samples.length - 1];
    const first = s.samples.find((p) => last[0] - p[0] <= 100) ?? s.samples[0];
    const vel = last[0] > first[0] ? (last[1] - first[1]) / (last[0] - first[0]) : 0;
    const moved = y.current - s.p0;
    const base = h.current ? Math.round(-s.p0 / h.current) : cur.current;
    let i = base;
    if (!cancelled) {
      if (moved < -h.current * DISTANCE || vel < -FLICK) i = base + 1;
      else if (moved > h.current * DISTANCE || vel > FLICK) i = base - 1;
    }
    go(i, vel);
  };

  const bind = {
    ref: setView,
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      stop();
      gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: y.current, samples: [[e.timeStamp, e.clientY]], dragging: false };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = gesture.current;
      if (!s || s.id !== e.pointerId) return;
      if (!s.dragging) {
        const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
        if (Math.abs(dy) < SLOP) return;
        if (Math.abs(dx) > Math.abs(dy)) { gesture.current = null; return; }
        s.dragging = true; s.y0 = e.clientY; // follow from here, so the card doesn't jump by the slop
        try { view.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      let v = s.p0 + (e.clientY - s.y0);
      const min = -(live.current.count - 1) * h.current;
      if (v > 0) v *= 0.35; else if (v < min) v = min + (v - min) * 0.35; // rubber-band at the ends
      s.samples.push([e.timeStamp, e.clientY]);
      if (s.samples.length > 10) s.samples.shift();
      pending.current = v;
      if (!frame.current) frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        if (pending.current == null) return;
        write(pending.current); pending.current = null;
        live.current.onMove?.(nearest());
      });
    },
    onPointerUp: (e: React.PointerEvent) => end(e, false),
    onPointerCancel: (e: React.PointerEvent) => end(e, true),
    // No native image drag (it would cancel the gesture on a thumbnail).
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
    // A drag that started on a button must not also press it.
    onClickCapture: (e: React.MouseEvent) => { if (swallowClick.current) { e.preventDefault(); e.stopPropagation(); swallowClick.current = false; } },
    // Mouse wheel / trackpad (laptop): one card per notch-burst.
    onWheel: (e: React.WheelEvent) => {
      const w = wheel.current, now = performance.now();
      if (now < w.until || anim.current) return;
      w.acc += e.deltaY;
      if (Math.abs(w.acc) < 40) return;
      const dir = Math.sign(w.acc); w.acc = 0; w.until = now + 450;
      go(nearest() + dir);
    },
  };

  return { bind, track, go: (i: number) => go(i), current: () => cur.current };
}

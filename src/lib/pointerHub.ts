// One window-level pointer listener for the whole app, however many owls are watching: events
// are coalesced to at most one dispatch per animation frame and fanned out to subscribers.
// (Five owls in the personality picker used to mean five listeners doing five layout reads.)
type Sub = (x: number, y: number) => void;
const subs = new Set<Sub>();
let raf = 0, lx = 0, ly = 0, attached = false;

const flush = () => { raf = 0; subs.forEach((s) => s(lx, ly)); };
const onMove = (e: PointerEvent) => { lx = e.clientX; ly = e.clientY; if (!raf) raf = requestAnimationFrame(flush); };

export function subscribePointer(s: Sub): () => void {
  subs.add(s);
  if (!attached) { attached = true; window.addEventListener("pointermove", onMove, { passive: true }); window.addEventListener("pointerdown", onMove, { passive: true }); }
  return () => {
    subs.delete(s);
    if (!subs.size && attached) { attached = false; window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerdown", onMove); cancelAnimationFrame(raf); raf = 0; }
  };
}

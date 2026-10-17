import { useEffect, useState } from "react";

// Kinetic type, the motion-graphics way: every word lives in its own mask (overflow: hidden) and
// slides up out of it, staggered, with a little overshoot. It's pure CSS keyframes — transform
// only, so it runs on the compositor and costs the main thread nothing. Numbers inside the text
// count up while they reveal.
const NUM = /^\d+$/;

function CountUp({ to, delay }: { to: number; delay: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0, t0 = 0;
    const tick = (t: number) => {
      t0 ||= t + delay * 1000;
      const k = Math.min(1, Math.max(0, (t - t0) / 800));
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay]);
  return <span className="num">{v}</span>;
}

export function MaskText({ text, delay = 0, step = 0.045, className }: { text: string; delay?: number; step?: number; className?: string }) {
  return (
    <span className={className} aria-label={text}>
      {text.split(" ").map((w, i) => (
        <span key={i} className="mask-word" aria-hidden>
          <span className="mask-in" style={{ animationDelay: `${delay + i * step}s` }}>
            {NUM.test(w) && w.length < 5 ? <CountUp to={Number(w)} delay={delay + i * step} /> : w}
          </span>
        </span>
      ))}
    </span>
  );
}

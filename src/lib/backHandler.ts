import { useEffect, useRef } from "react";
import "./android-bridge";

// Android's back gesture asks the page first (MainActivity → window.__upwiseBack). Handlers
// stack: the most recently registered one that's still active wins, so an open sheet closes
// before the screen underneath navigates.
type Handler = () => boolean;
const stack: Handler[] = [];

if (typeof window !== "undefined") {
  window.__upwiseBack = () => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i]()) return true;
    return false;
  };
}

/** While `active`, the back gesture calls `onBack` instead of leaving. `onBack` returns false
 * to pass it down the stack. */
export function useBackHandler(active: boolean, onBack: () => boolean | void) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return;
    const h: Handler = () => ref.current() !== false;
    stack.push(h);
    return () => { const i = stack.lastIndexOf(h); if (i >= 0) stack.splice(i, 1); };
  }, [active]);
}

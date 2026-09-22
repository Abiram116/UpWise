import { extractUrl } from "./utils";

// Android share-sheet bridge. MainActivity.kt injects `window.__upwiseShare(text)` and also
// stores the text in `window.__upwisePendingShare` in case the page wasn't ready yet.
declare global {
  interface Window {
    __upwiseShare?: (text: string) => void;
    __upwisePendingShare?: string | null;
  }
}

type Handler = (url: string, raw: string) => void;
let handler: Handler | null = null;

function deliver(raw: string) {
  const url = extractUrl(raw);
  if (!url) return;
  if (handler) handler(url, raw);
  else window.__upwisePendingShare = raw;
}

export function installShareBridge() {
  window.__upwiseShare = deliver;
  window.addEventListener("upwise:share", (e) => deliver(String((e as CustomEvent).detail ?? "")));
}

export function onShare(h: Handler): () => void {
  handler = h;
  const pending = window.__upwisePendingShare;
  if (pending) {
    window.__upwisePendingShare = null;
    deliver(pending);
  }
  return () => { if (handler === h) handler = null; };
}

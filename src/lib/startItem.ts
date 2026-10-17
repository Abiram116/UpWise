import { describeError } from "./errors";
import { haptic } from "./haptics";
import { openExternal } from "./links";
import { itemLink } from "./utils";
import type { Item } from "./types";

/** The Start button, done right: the link opens the instant you tap (inside the gesture, never
 * waiting on the network), and the session timer starts in the background — a slow or failing
 * save can no longer stop the link from opening. */
export function startItem(item: Item, start: (i: Item) => Promise<void>, toast: (m: string) => void, opts: { open?: boolean } = {}) {
  haptic.tap();
  if (opts.open !== false) {
    void openExternal(itemLink(item)).then((ok) => { if (!ok) toast("Couldn't open that link — it's copied, paste it in your browser"); });
  }
  start(item).catch((e) => toast(`Timer didn't start — ${describeError(e).message}`));
}

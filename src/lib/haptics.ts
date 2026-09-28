import { isAndroid } from "./platform";
import type { HapticType } from "./android-bridge";

// Routed through MainActivity.kt: on Pixels, composed haptic primitives (tick, click, rise,
// spin) — each moment has its own texture instead of one generic buzz. Nothing on desktop.
const fire = (type: HapticType) => { try { if (isAndroid()) window.AndroidNative?.haptic?.(type); } catch { /* ignore */ } };

export const haptic = {
  tap: () => fire("tap"),
  /** Toggling a chip/segment: lighter than a button press. */
  select: () => fire("select"),
  success: () => fire("success"),
  warn: () => fire("warn"),
  /** Finishing something: a rise that lands, then fading ticks. */
  celebrate: () => fire("celebrate"),
  /** The bigger wins (goal, streak milestones). */
  spin: () => fire("spin"),
};

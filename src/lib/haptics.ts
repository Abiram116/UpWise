import { isAndroid } from "./platform";
import "./android-bridge";

// Routed through MainActivity.kt's performHapticFeedback — the same OS-tuned taps system UI
// uses, not a raw vibrate() buzz. Falls back to nothing on desktop/older installs.
const fire = (type: "tap" | "success" | "warn") => { try { if (isAndroid()) window.AndroidNative?.haptic?.(type); } catch { /* ignore */ } };

export const haptic = {
  tap: () => fire("tap"),
  success: () => fire("success"),
  warn: () => fire("warn"),
};

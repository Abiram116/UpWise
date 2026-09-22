import { isAndroid } from "./platform";

// The WebView's Vibration API works fine on Android once VIBRATE is in the manifest.
// Desktop/iOS silently no-op — this is deliberately tasteful, not on every tap.
const vibrate = (pattern: number | number[]) => { try { if (isAndroid()) navigator.vibrate?.(pattern); } catch { /* ignore */ } };

export const haptic = {
  tap: () => vibrate(8),
  success: () => vibrate([12, 40, 18]),
  warn: () => vibrate([16, 60, 16, 60, 16]),
};

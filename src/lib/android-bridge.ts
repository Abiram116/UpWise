// Single source of truth for the JS<->Kotlin bridge shape (MainActivity.kt's NativeBridge).
// Anything touching window.AndroidNative should rely on this instead of re-declaring the type.
export type HapticType = "tap" | "select" | "success" | "warn" | "celebrate" | "spin";

declare global {
  interface Window {
    AndroidNative?: {
      setLightStatusBar?: (light: boolean) => void;
      haptic?: (type: HapticType) => void;
      dynamicColors?: () => string;
      downloadAndInstall?: (url: string) => void;
      canInstallPackages?: () => boolean;
      openInstallPermissionSettings?: () => void;
      openNotificationSettings?: () => void;
      moveToBackground?: () => void;
      sessionStart?: (title: string, startedAtMs: number, itemId: string) => void;
      sessionStop?: () => void;
      /** JSON {top, bottom, keyboard} in CSS px. */
      insets?: () => string;
      /** 0xRRGGBB for the strip Android keeps under the page. */
      setNavBarColor?: (rgb: number) => void;
      /** JSON layout facts for diagnostics. */
      diag?: () => string;
    };
    /** Called by MainActivity on the system back gesture; true = handled in-app. */
    __upwiseBack?: () => boolean;
    /** Launcher shortcuts: MainActivity asks the page to open "feed" | "add" | "today". */
    __upwiseGo?: (target: string, token?: string) => void;
    __upwisePendingGo?: { t: string; k: string };
  }
}

/** Re-apply the native safe-area insets (the native side also pushes them on change). */
export function syncNativeInsets() {
  try {
    const raw = window.AndroidNative?.insets?.(); if (!raw) return;
    const v = JSON.parse(raw) as { top: number; bottom: number; keyboard: number };
    const st = document.documentElement.style;
    if (v.top > 0 || v.bottom > 0) { st.setProperty("--native-safe-top", `${v.top}px`); st.setProperty("--native-safe-bottom", `${v.bottom}px`); }
    st.setProperty("--native-keyboard-inset", `${v.keyboard}px`);
  } catch { /* ignore */ }
}

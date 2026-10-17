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
    };
    /** Called by MainActivity on the system back gesture; true = handled in-app. */
    __upwiseBack?: () => boolean;
    /** Launcher shortcuts: MainActivity asks the page to open "feed" | "note" | "link" | "today". */
    __upwiseGo?: (target: string, token?: string) => void;
    __upwisePendingGo?: { t: string; k: string };
  }
}

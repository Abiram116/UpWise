// Single source of truth for the JS<->Kotlin bridge shape (MainActivity.kt's NativeBridge).
// Anything touching window.AndroidNative should rely on this instead of re-declaring the type.
export {};
declare global {
  interface Window {
    AndroidNative?: {
      setLightStatusBar?: (light: boolean) => void;
      haptic?: (type: "tap" | "success" | "warn") => void;
      downloadAndInstall?: (url: string) => void;
    };
  }
}

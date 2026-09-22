import { useEffect, useState } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { isDesktop } from "../lib/platform";

// Frameless-window title strip: drag anywhere on it, soft controls on the right.
export function WindowControls() {
  const [max, setMax] = useState(false);
  const [win, setWin] = useState<import("@tauri-apps/api/window").Window | null>(null);

  useEffect(() => {
    if (!isDesktop()) return;
    document.documentElement.setAttribute("data-frameless", "true");
    let off: (() => void) | undefined;
    import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const w = getCurrentWindow();
      setWin(w);
      setMax(await w.isMaximized());
      off = await w.onResized(async () => setMax(await w.isMaximized()));
    });
    return () => off?.();
  }, []);

  if (!win) return null;
  return (
    <div className="titlebar" data-tauri-drag-region onDoubleClick={() => win.toggleMaximize()}>
      <div className="titlebar-actions">
        <button aria-label="Minimize" onClick={() => win.minimize()}><Minus size={14} /></button>
        <button aria-label={max ? "Restore" : "Maximize"} onClick={() => win.toggleMaximize()}>{max ? <Copy size={12} /> : <Square size={12} />}</button>
        <button aria-label="Close" className="close" onClick={() => win.close()}><X size={15} /></button>
      </div>
    </div>
  );
}

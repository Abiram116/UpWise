import { AnimatePresence, motion, useReducedMotion, type Variants, type Transition } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { cx } from "../lib/utils";
import { haptic } from "../lib/haptics";

// ---------- motion presets ----------
export const spring: Transition = { type: "spring", stiffness: 420, damping: 36, mass: 0.8 };
export const springSoft: Transition = { type: "spring", stiffness: 260, damping: 30 };
export const easeOut: Transition = { duration: 0.32, ease: [0.05, 0.7, 0.1, 1] };
export const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } } };
export const rise: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.36, ease: [0.05, 0.7, 0.1, 1] } },
};

// ---------- ripple ----------
function useRipple() {
  return useCallback((e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const r = document.createElement("span");
    r.className = "ripple";
    r.style.width = r.style.height = `${size}px`;
    r.style.left = `${e.clientX - rect.left - size / 2}px`;
    r.style.top = `${e.clientY - rect.top - size / 2}px`;
    el.appendChild(r);
    setTimeout(() => r.remove(), 560);
  }, []);
}

// ---------- Pill button ----------
type Variant = "filled" | "tonal" | "soft" | "text" | "danger";
interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant; size?: "sm" | "md" | "lg"; block?: boolean; icon?: boolean; loading?: boolean;
}
export function Pill({ variant = "tonal", size = "md", block, icon, loading, className, children, disabled, onClick, ...rest }: PillProps) {
  const ripple = useRipple();
  return (
    <motion.button
      whileTap={disabled || loading ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      className={cx("pill", `pill-${variant}`, size !== "md" && `pill-${size}`, block && "pill-block", icon && "pill-icon", className)}
      disabled={disabled || loading}
      onClick={(e) => { ripple(e); haptic.tap(); onClick?.(e); }}
      {...(rest as object)}
    >
      {loading ? <Spinner /> : children}
    </motion.button>
  );
}
export const Button = Pill;

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------- Chip ----------
export function Chip({ children, tone, active, onClick, className }: {
  children: ReactNode; tone?: "primary" | "warm" | "error"; active?: boolean; onClick?: () => void; className?: string;
}) {
  if (onClick) {
    return (
      <motion.button whileTap={{ scale: 0.95 }} transition={spring} className={cx("chip chip-btn", className)} data-active={active} onClick={() => { haptic.tap(); onClick(); }}>
        {active && <Check size={14} strokeWidth={2.5} />}{children}
      </motion.button>
    );
  }
  return <span className={cx("chip chip-static", tone && `chip-${tone}`, className)}>{children}</span>;
}

export function Dots({ n, of = 5 }: { n: number | null; of?: number }) {
  return <span className="dots" aria-label={n ? `${n} of ${of}` : "unrated"}>{Array.from({ length: of }, (_, i) => <i key={i} data-on={n != null && i < n} />)}</span>;
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} className="switch" data-on={on} onClick={() => { haptic.tap(); onChange(!on); }} />;
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="chips" role="tablist">
      {options.map((o) => <Chip key={o.value} active={o.value === value} onClick={() => onChange(o.value)}>{o.label}</Chip>)}
    </div>
  );
}

// ---------- Sheet (bottom on touch, dialog on desktop) ----------
export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title?: string }) {
  const reduce = useReducedMotion();
  const isDesk = typeof window !== "undefined" && window.matchMedia("(min-width: 840px)").matches;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} />
          <motion.div
            className="sheet" role="dialog" aria-modal
            initial={reduce ? { opacity: 0 } : isDesk ? { opacity: 0, scale: 0.96, x: "-50%", y: "-47%" } : { y: "100%" }}
            animate={reduce ? { opacity: 1 } : isDesk ? { opacity: 1, scale: 1, x: "-50%", y: "-50%" } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : isDesk ? { opacity: 0, scale: 0.98, x: "-50%", y: "-47%" } : { y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36, mass: 0.9 }}
            drag={isDesk || reduce ? false : "y"} dragConstraints={{ top: 0 }} dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => { if (info.offset.y > 100 || info.velocity.y > 700) onClose(); }}
          >
            <div className="sheet-grip" />
            {title && (
              <div className="row between" style={{ marginBottom: 18 }}>
                <h3 className="headline-sm">{title}</h3>
                <button className="pill pill-text pill-icon pill-sm hide-mobile" onClick={onClose} aria-label="Close"><X size={18} /></button>
              </div>
            )}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------- Snackbar ----------
export interface ToastAction { label: string; onClick: () => void }
const ToastCtx = createContext<(msg: string, action?: ToastAction) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; action?: ToastAction } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((msg: string, action?: ToastAction) => {
    setToast({ msg, action });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), action ? 4500 : 2800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <AnimatePresence>
        {toast && (
          <motion.div className="snackbar" initial={{ opacity: 0, y: 16, x: "-50%", scale: 0.96 }} animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }} exit={{ opacity: 0, y: 10, x: "-50%", scale: 0.98 }} transition={spring}>
            <span>{toast.msg}</span>
            {toast.action && (
              <button className="snackbar-action" onClick={() => { toast.action!.onClick(); window.clearTimeout(timer.current); setToast(null); }}>
                {toast.action.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- misc ----------
export function Skeleton({ h = 16, w = "100%", r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} />;
}

export function Empty({ title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3 className="headline-sm">{title}</h3>
      {body && <p className="body" style={{ maxWidth: 360 }}>{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty" style={{ color: "var(--error)" }}>
      <h3 className="headline-sm" style={{ color: "var(--on-surface)" }}>Couldn't reach your library</h3>
      <p className="body" style={{ maxWidth: 360 }}>{message}</p>
      {onRetry && <Pill variant="tonal" onClick={onRetry} style={{ alignSelf: "flex-start", marginTop: 6 }}>Retry</Pill>}
    </div>
  );
}

// One authored entrance per page; sections inside do not animate separately.
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cx("page", className)}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: -6, transition: { duration: 0.15 } }}
      transition={{ duration: 0.36, ease: [0.05, 0.7, 0.1, 1] }}
    >
      {children}
    </motion.div>
  );
}
export const Rise = ({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) => (
  <div className={className} style={style}>{children}</div>
);

export function CheckIcon({ size = 12 }: { size?: number }) { return <Check size={size} strokeWidth={3} />; }

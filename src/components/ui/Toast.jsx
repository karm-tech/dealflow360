import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

// Confirms the caller's own action. The notification bell is for events that
// involve them and stay until read.

const ToastContext = createContext(null);

const DISMISS_AFTER = 4000;

const VARIANTS = {
  success: { icon: CheckCircle2, rail: "bg-state-ok", tint: "text-state-ok" },
  error: { icon: AlertTriangle, rail: "bg-state-bad", tint: "text-state-bad" },
  warn: { icon: AlertTriangle, rail: "bg-state-warn", tint: "text-state-warn" },
  info: { icon: Info, rail: "bg-ink-700", tint: "text-ink-700" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback((message, variant = "success") => {
    if (!message) return;
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, variant }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      {createPortal(
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-80 flex-col gap-2"
        >
          {toasts.map((item) => (
            <Toast key={item.id} {...item} onDismiss={() => dismiss(item.id)} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

// The surface stays neutral: colour is carried by the rail and the icon, so a
// toast never becomes the loudest thing on the page.
function Toast({ message, variant, onDismiss }) {
  const [isPaused, setIsPaused] = useState(false);
  const { icon: Icon, rail, tint } = VARIANTS[variant] || VARIANTS.success;

  useEffect(() => {
    if (isPaused) return undefined;
    const timer = setTimeout(onDismiss, DISMISS_AFTER);
    return () => clearTimeout(timer);
  }, [isPaused, onDismiss]);

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="animate-expand pointer-events-auto flex items-start gap-2.5 overflow-hidden rounded-lg border border-sand-200 bg-surface py-2.5 pl-0 pr-2 shadow-raised"
    >
      <span aria-hidden="true" className={`h-full w-1 self-stretch ${rail}`} />
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tint}`} aria-hidden="true" />
      <p className="flex-1 text-sm text-sand-800">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded p-0.5 text-sand-400 hover:bg-sand-100 hover:text-sand-700"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside a ToastProvider");
  return context.toast;
}

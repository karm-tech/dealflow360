import { useEffect } from "react";
import { X } from "lucide-react";

// A dialog for confirmations and small forms. Later phases use it for things
// like "override the warehouse split" and "cancel this subscription".
//
// Escape closes it and the background scroll is locked while it is open,
// because a dialog you can scroll behind feels broken.
export function Modal({ open, onClose, title, description, footer, children }) {
  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Clicking the dimmed background closes the dialog. */}
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink-900/40"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-lg rounded-2xl border border-sand-200 bg-surface p-6 shadow-modal animate-expand"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-sand-900">{title}</h2>
            {description && <p className="mt-1 text-sm text-sand-600">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-sand-500 hover:bg-sand-100 hover:text-sand-800"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4">{children}</div>

        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

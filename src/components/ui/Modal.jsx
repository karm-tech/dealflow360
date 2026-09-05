import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Dialog for confirmations and small forms. Escape closes it and background
// scroll is locked while open.
//
// Rendered into document.body: a fixed-position child is measured against the
// nearest transformed ancestor rather than the viewport, and the page entry
// animation leaves a transform in place, which would push the dialog below the
// fold on a long page.
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Clicking the backdrop closes the dialog. */}
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
        className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col rounded-2xl border border-sand-200 bg-surface p-6 shadow-modal animate-expand"
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

        {/* min-h-0 lets this shrink inside the flex column so it can scroll. */}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

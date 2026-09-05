import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ChevronDown, Search, X } from "lucide-react";
import { Link } from "react-router-dom";

// Picks one related record by typing. The list comes back from the server a
// page at a time, so a catalogue of any size stays usable.
//
//   <RecordPicker
//     queryKey="customers"
//     fetchOptions={(q) => ...}   // -> [{ id, label, meta, hint }]
//     value={id} onChange={(option) => ...}
//   />

function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

// The list is positioned against the input's place on screen and rendered into
// the body, so a modal or a table cell cannot clip it.
function useAnchorRect(ref, isOpen) {
  const [rect, setRect] = useState(null);

  useLayoutEffect(() => {
    if (!isOpen) return undefined;

    function measure() {
      const node = ref.current;
      if (node) setRect(node.getBoundingClientRect());
    }

    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [ref, isOpen]);

  return rect;
}

export function RecordPicker({
  id,
  queryKey,
  fetchOptions,
  value,
  selected,
  onChange,
  noun = "records",
  placeholder = "Type to search…",
  openTo,
  disabled = false,
  hasError = false,
  className = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const debouncedQuery = useDebounced(query);
  const rect = useAnchorRect(wrapperRef, isOpen);

  const options = useQuery({
    queryKey: [queryKey, "picker", debouncedQuery],
    enabled: isOpen,
    queryFn: () => fetchOptions(debouncedQuery),
    placeholderData: (previous) => previous,
  });

  const rows = options.data || [];

  useEffect(() => {
    setHighlight(0);
  }, [debouncedQuery]);

  // A click anywhere else closes the list and drops whatever was half typed.
  useEffect(() => {
    if (!isOpen) return undefined;

    function onPointerDown(event) {
      if (wrapperRef.current?.contains(event.target)) return;
      if (event.target.closest?.("[data-record-picker-list]")) return;
      close();
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isOpen]);

  function close() {
    setIsOpen(false);
    setQuery("");
  }

  function choose(option) {
    onChange(option);
    close();
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      close();
      return;
    }

    if (!isOpen && (event.key === "ArrowDown" || event.key === "Enter")) {
      setIsOpen(true);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (rows[highlight]) choose(rows[highlight]);
    }
  }

  const border = hasError
    ? "border-state-badBorder focus-within:border-state-bad focus-within:ring-state-bad/20"
    : "border-sand-300 hover:border-sand-400 focus-within:border-ink-500 focus-within:ring-ink-500/20";

  return (
    <div className={`relative ${className}`}>
      <div
        ref={wrapperRef}
        className={`flex w-full items-center gap-1.5 rounded-lg border bg-surface px-3 py-2 transition-colors focus-within:ring-2 ${border} ${
          disabled ? "bg-sand-100" : ""
        }`}
      >
        <Search className="h-4 w-4 shrink-0 text-sand-400" aria-hidden="true" />

        <input
          id={id}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={isOpen ? query : selected?.label || ""}
          placeholder={selected ? selected.label : placeholder}
          onFocus={() => !disabled && setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-base text-sand-900 placeholder:text-sand-400 focus:outline-none disabled:text-sand-500"
        />

        {selected && !disabled && (
          <button
            type="button"
            aria-label="Clear selection"
            onClick={() => onChange(null)}
            className="rounded p-0.5 text-sand-400 hover:bg-sand-100 hover:text-sand-700"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}

        {selected && openTo && (
          <Link
            to={openTo(selected.id)}
            aria-label={`Open ${selected.label}`}
            className="rounded p-0.5 text-ink-400 hover:bg-ink-50 hover:text-ink-700"
          >
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}

        <ChevronDown className="h-4 w-4 shrink-0 text-sand-400" aria-hidden="true" />
      </div>

      {isOpen &&
        rect &&
        createPortal(
          <div
            data-record-picker-list
            role="listbox"
            style={{ position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width }}
            className="z-[60] max-h-72 overflow-y-auto rounded-lg border border-sand-200 bg-surface py-1 shadow-raised"
          >
            {options.isLoading && rows.length === 0 && (
              <p className="px-3 py-2 text-sm text-sand-500">Searching {noun}…</p>
            )}

            {!options.isLoading && rows.length === 0 && (
              <p className="px-3 py-3 text-sm text-sand-600">
                {debouncedQuery ? `No ${noun} match “${debouncedQuery}”` : `No ${noun} yet`}
              </p>
            )}

            {rows.map((option, index) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === value}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(option)}
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left ${
                  index === highlight ? "bg-ink-50" : "hover:bg-sand-50"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-base text-sand-900">{option.label}</span>
                  {option.hint && (
                    <span className="block truncate text-xs text-sand-500">{option.hint}</span>
                  )}
                </span>
                {option.meta && (
                  <span className="shrink-0 text-xs text-sand-600">{option.meta}</span>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

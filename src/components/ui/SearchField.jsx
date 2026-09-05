import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "./Field";

// Typed value lives here. The parent only hears about it after a short pause,
// so one keystroke cannot remount the page or steal the cursor.
export function SearchField({
  id,
  value,
  onChange,
  placeholder,
  delay = 300,
  className = "!w-64 !pl-9",
}) {
  const [draft, setDraft] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (draft !== value) onChangeRef.current(draft);
    }, delay);
    return () => clearTimeout(timer);
  }, [draft, delay, value]);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sand-400"
        aria-hidden="true"
      />
      <Input
        id={id}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        className={className}
      />
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, RefreshCw } from "lucide-react";
import { useAuth } from "../app/AuthProvider";
import { ROLE_LABELS } from "../lib/constants";

// Everything about the person signed in, in one place: which instance they are
// working in, a manual refresh, and the way out. Keeps the header to one row as
// screens are added.
export function UserMenu() {
  const { user, isDemo, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    function onPointerDown(event) {
      if (!ref.current?.contains(event.target)) setIsOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  // Screens refresh themselves when the server says something changed. This is
  // here for the times somebody wants to be sure.
  function reloadData() {
    queryClient.invalidateQueries();
    setIsOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((open) => !open)}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sand-100"
      >
        <span className="hidden sm:block">
          <span className="block text-sm font-medium text-sand-900">{user.name}</span>
          <span className="block text-xs text-sand-600">{ROLE_LABELS[user.role]}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-sand-500" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-sand-200 bg-surface py-1 shadow-raised"
        >
          <div className="border-b border-sand-200 px-3 py-2">
            <p className="text-sm font-medium text-sand-900 sm:hidden">{user.name}</p>
            <p className="text-xs text-sand-600">
              {isDemo ? "Demo instance · sample data" : "Live instance"}
            </p>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={reloadData}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-sand-700 hover:bg-sand-50"
          >
            <RefreshCw className="h-4 w-4 text-sand-500" aria-hidden="true" />
            Reload data
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-sand-700 hover:bg-sand-50"
          >
            <LogOut className="h-4 w-4 text-sand-500" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, CheckCircle2, Info, X } from "lucide-react";
import { api } from "../lib/api";
import { daysSince, formatDate } from "../lib/format";

const TOAST_LIMIT = 3;
const DISMISS_AFTER = 10000;

const TONES = {
  warn: { Icon: AlertTriangle, rail: "bg-state-warn", tint: "text-state-warn" },
  bad: { Icon: AlertTriangle, rail: "bg-state-bad", tint: "text-state-bad" },
  ok: { Icon: CheckCircle2, rail: "bg-state-ok", tint: "text-state-ok" },
  info: { Icon: Info, rail: "bg-ink-700", tint: "text-ink-700" },
};

const WARN_TYPES = new Set([
  "APPROVAL_REQUESTED",
  "APPROVAL_ESCALATED",
  "DEAL_ESCALATED",
  "DEAL_NUDGED",
  "RENEWAL_DUE",
  "BACKORDER_RAISED",
]);
const BAD_TYPES = new Set(["QUOTATION_REJECTED", "CUSTOMER_REJECTED", "SUBSCRIPTION_CANCELLED"]);
const OK_TYPES = new Set([
  "QUOTATION_APPROVED",
  "QUOTATION_ACCEPTED",
  "PAYMENT_RECORDED",
  "INVOICE_ISSUED",
  "BACKORDER_CONSOLIDATED",
]);

function toneFor(type) {
  if (WARN_TYPES.has(type)) return TONES.warn;
  if (BAD_TYPES.has(type)) return TONES.bad;
  if (OK_TYPES.has(type)) return TONES.ok;
  return TONES.info;
}

function timeAgo(value) {
  const days = daysSince(value);
  if (days === null) return "";
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (days < 1) {
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  return formatDate(value);
}

function useInbox() {
  const queryClient = useQueryClient();

  const feed = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get("/notifications")).data,
  });

  const markRead = useMutation({
    mutationFn: (id) => api.post(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return {
    unread: feed.data?.unreadCount || 0,
    notifications: feed.data?.notifications || [],
    markRead,
    markAll,
  };
}

export function NotificationBell() {
  const navigate = useNavigate();
  const { unread, notifications, markRead, markAll } = useInbox();
  const [open, setOpen] = useState(false);
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const rootRef = useRef(null);

  const toasts = notifications
    .filter((item) => !item.readAt && !hiddenIds.has(item.id))
    .slice(0, TOAST_LIMIT);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function hideToast(id) {
    setHiddenIds((current) => new Set(current).add(id));
  }

  function openNotification(notification) {
    setOpen(false);
    hideToast(notification.id);
    if (!notification.readAt) markRead.mutate(notification.id);
    if (notification.quotationId) navigate(`/quotations/${notification.quotationId}`);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative rounded-md p-2 text-sand-700 hover:bg-sand-100 hover:text-sand-900"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="figure absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink-700 px-1 text-2xs font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-md border border-sand-200 bg-surface shadow-raised"
        >
          <div className="flex items-center justify-between gap-3 border-b border-sand-200 px-3 py-2">
            <p className="text-sm font-semibold text-sand-900">
              Notifications
              {unread > 0 && (
                <span className="ml-1.5 font-medium text-ink-700">{unread}</span>
              )}
            </p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className="text-sm font-medium text-ink-700 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-sand-600">Nothing yet.</p>
          ) : (
            <ul className="max-h-[min(24rem,60vh)] divide-y divide-sand-200 overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-sand-50 ${
                      notification.readAt ? "" : "bg-ink-50"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        notification.readAt ? "bg-sand-300" : "bg-ink-700"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-sand-900">
                        {notification.title}
                      </span>
                      {notification.body && (
                        <span className="mt-0.5 block text-sm text-sand-600">
                          {notification.body}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 pt-0.5 text-xs text-sand-500">
                      {timeAgo(notification.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {toasts.length > 0 &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed right-3 top-20 z-40 flex w-96 max-w-[calc(100vw-1.5rem)] flex-col gap-2"
          >
            {toasts.map((item) => (
              <InboxToast
                key={item.id}
                notification={item}
                onOpen={() => openNotification(item)}
                onDismiss={() => hideToast(item.id)}
              />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

function InboxToast({ notification, onOpen, onDismiss }) {
  const [isPaused, setIsPaused] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const { Icon, rail, tint } = toneFor(notification.type);

  useEffect(() => {
    if (isPaused) return undefined;
    const timer = setTimeout(() => dismissRef.current(), DISMISS_AFTER);
    return () => clearTimeout(timer);
  }, [isPaused]);

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="animate-slideIn pointer-events-auto relative flex overflow-hidden rounded-md bg-surface shadow-raised"
    >
      <span aria-hidden="true" className={`w-1.5 shrink-0 ${rail}`} />
      <div className="flex min-w-0 flex-1 gap-2.5 border border-l-0 border-sand-200 py-3 pl-3 pr-10">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tint}`} aria-hidden="true" />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-semibold text-sand-900">{notification.title}</span>
          {notification.body && (
            <span className="mt-0.5 block text-sm text-sand-600">{notification.body}</span>
          )}
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded p-1 text-sand-400 hover:bg-sand-100 hover:text-sand-700"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

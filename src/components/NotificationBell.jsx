import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
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

  const unread = feed.data?.unreadCount || 0;
  const notifications = feed.data?.notifications || [];

  function openNotification(notification) {
    setOpen(false);
    if (!notification.readAt) markRead.mutate(notification.id);
    if (notification.quotationId) navigate(`/quotations/${notification.quotationId}`);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative rounded-md p-2 text-sand-600 transition-colors hover:bg-sand-100 hover:text-sand-900"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink-700 px-1 text-2xs font-semibold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Clicking anywhere else closes the panel. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />

          <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-sand-200 bg-surface shadow-raised">
            <div className="flex items-center justify-between border-b border-sand-200 px-3 py-2">
              <p className="text-sm font-semibold text-sand-900">Notifications</p>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  className="text-xs font-medium text-ink-700 hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-sand-600">Nothing yet.</p>
            ) : (
              <ul className="max-h-96 divide-y divide-sand-200 overflow-y-auto">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(notification)}
                      className={`w-full px-3 py-2.5 text-left transition-colors hover:bg-sand-50 ${
                        notification.readAt ? "" : "bg-ink-50"
                      }`}
                    >
                      <p className="text-sm font-medium text-sand-900">{notification.title}</p>
                      {notification.body && (
                        <p className="mt-0.5 text-xs text-sand-600">{notification.body}</p>
                      )}
                      <p className="mt-1 text-2xs text-sand-500">
                        {formatDate(notification.createdAt)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

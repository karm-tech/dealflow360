import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { useAuth } from "./AuthProvider";
import { getToken } from "../lib/api";

// Keeps one socket open while somebody is signed in. An event only says that
// something changed; the screen refetches so the server stays the one source of
// the figures.
//
// This is what keeps data current. A socket event lands in the bell, never as a
// toast: a toast confirms something you did yourself.
export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return undefined;

    const socket = io({ auth: { token: getToken() } });

    socket.on("notification", (event) => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      queryClient.invalidateQueries({ queryKey: ["fulfilment"] });

      // Anything open on the record the event is about is refreshed too.
      if (event?.quotationId) {
        queryClient.invalidateQueries({ queryKey: ["quotation", String(event.quotationId)] });
      }
    });

    return () => socket.close();
  }, [user, queryClient]);

  return children;
}

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { useAuth } from "./AuthProvider";
import { getToken } from "../lib/api";

// One socket while signed in. Events invalidate queries; they never raise a toast.
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

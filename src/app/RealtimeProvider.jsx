import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { useAuth } from "./AuthProvider";
import { getToken } from "../lib/api";

// Keeps one socket open while somebody is signed in. An event only says that
// something changed; the screen refetches so the server stays the one source of
// the figures.
export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return undefined;

    const socket = io({ auth: { token: getToken() } });

    socket.on("notification", () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    });

    return () => socket.close();
  }, [user, queryClient]);

  return children;
}

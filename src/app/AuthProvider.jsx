import { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, setToken, clearToken, getMode, setMode } from "../lib/api";
import { DB_MODES } from "../lib/constants";

const AuthContext = createContext(null);

// Holds "who is logged in" and "which instance they are in" for the whole app.
// Any screen can read it with useAuth() instead of passing props down.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [mode, setModeState] = useState(getMode() || DB_MODES.LIVE);
  const [isLoading, setIsLoading] = useState(true);

  // On a page refresh the token is still in localStorage but we have no user
  // object, so ask the server who it belongs to. The server also tells us which
  // database that token belongs to — we never decide that here.
  useEffect(() => {
    async function loadCurrentUser() {
      if (!getToken()) {
        setIsLoading(false);
        return;
      }
      try {
        const response = await api.get("/auth/me");
        setUser(response.data.user);
        applyMode(response.data.mode);
      } catch {
        // Token is expired or the account was disabled — start clean.
        clearToken();
      } finally {
        setIsLoading(false);
      }
    }
    loadCurrentUser();
  }, []);

  function applyMode(nextMode) {
    const safeMode = nextMode === DB_MODES.DEMO ? DB_MODES.DEMO : DB_MODES.LIVE;
    setModeState(safeMode);
    setMode(safeMode);
  }

  async function login(email, password, requestedMode) {
    const response = await api.post("/auth/login", { email, password, mode: requestedMode });
    setToken(response.data.token);
    setUser(response.data.user);
    applyMode(response.data.mode);
    return response.data.user;
  }

  // Signup does not log anyone in — it files a request an admin has to approve.
  // The caller gets the message back so it can show the waiting state.
  async function requestAccess({ name, email, password, requestedRole, mode: requestedMode }) {
    const response = await api.post("/auth/signup", {
      name,
      email,
      password,
      requestedRole,
      mode: requestedMode,
    });
    return response.data;
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  const value = {
    user,
    mode,
    isDemo: mode === DB_MODES.DEMO,
    isLoading,
    login,
    requestAccess,
    logout,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}

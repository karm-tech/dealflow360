import { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, setToken, clearToken, getMode, setMode } from "../lib/api";
import { DB_MODES } from "../lib/constants";

const AuthContext = createContext(null);

// Holds the current user and instance for the whole app; read with useAuth().
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [mode, setModeState] = useState(getMode() || DB_MODES.LIVE);
  const [isLoading, setIsLoading] = useState(true);

  // After a refresh the token survives but the user object does not, so ask the
  // server. The instance comes back from the server, never decided here.
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
        // Expired token or disabled account.
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

  // Files a request rather than creating a session; returns the message for
  // the waiting state.
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

  // Customers need no approval, so this signs them in the way login does.
  async function registerCustomer(details) {
    const response = await api.post("/auth/portal-signup", details);
    setToken(response.data.token);
    setUser(response.data.user);
    applyMode(response.data.mode);
    return response.data.user;
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
    registerCustomer,
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

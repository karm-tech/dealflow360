import axios from "axios";

// Vite proxies /api to the Express server, so no host or port is hardcoded.
export const api = axios.create({ baseURL: "/api" });

const TOKEN_KEY = "dealflow360.token";
const MODE_KEY = "dealflow360.mode";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(MODE_KEY);
}

// Cached so the marker can render before /auth/me answers. The instance the
// server uses comes from the signed token, not from this.
export function getMode() {
  return localStorage.getItem(MODE_KEY);
}

export function setMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
}

// Attaches the login token to every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Extracts the API's message from an axios failure.
export function errorMessage(error) {
  return error?.response?.data?.error || "Something went wrong. Please try again.";
}

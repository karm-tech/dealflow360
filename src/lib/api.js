import axios from "axios";

// Vite forwards anything starting with /api to the Express server, so the
// frontend never needs to know the API's host or port.
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

// Remembered only so the banner can render before /auth/me answers. The value
// that actually decides which database is used lives inside the signed token,
// so changing this in the browser changes nothing on the server.
export function getMode() {
  return localStorage.getItem(MODE_KEY);
}

export function setMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
}

// Attach the login token to every request instead of remembering to add it
// at each call site.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Turn an axios failure into the plain message the API sent, so screens can
// show it directly without digging through the error object.
export function errorMessage(error) {
  return error?.response?.data?.error || "Something went wrong. Please try again.";
}

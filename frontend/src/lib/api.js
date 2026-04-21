import axios from "axios";
import { Capacitor } from "@capacitor/core";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const BASE_PATH = process.env.REACT_APP_BASE_PATH || "";

export const API_BASE = `${BACKEND_URL}${BASE_PATH}/api`;

// Plataforma identificada para el backend. Los clientes (role=client) solo
// pueden loguearse si este header es "native" — bloqueo estricto desde web.
const APP_PLATFORM = Capacitor.isNativePlatform() ? "native" : "web";

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    "X-App-Platform": APP_PLATFORM,
  },
});

// Attach token from localStorage as fallback
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Re-asegurar el header (para instancias que se clonan en upload, etc.)
  config.headers["X-App-Platform"] = APP_PLATFORM;
  return config;
});

export function formatApiError(detail) {
  if (detail == null) return "Ocurrió un error. Intenta de nuevo.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export default api;

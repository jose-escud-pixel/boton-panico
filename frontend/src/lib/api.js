import axios from "axios";
import { Capacitor } from "@capacitor/core";
import { APP_BUILD } from "./appVersion";
import { getStoredDeviceId } from "./deviceBind";

/** Origen del API (https://dominio) sin barra final. Vacío → rutas relativas (sólo web). */
const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").trim().replace(/\/$/, "");
const BASE_PATH = (process.env.REACT_APP_BASE_PATH || "").trim();
const API_PATH = `${BASE_PATH}/api`.replace(/\/{2,}/g, "/");

// En navegador, /boton-panico/api resuelve contra el mismo host. En Capacitor (APK)
// la app vive en capacitor://localhost: una ruta relativa NUNCA llega al servidor.
export const API_BASE = BACKEND_URL
  ? `${BACKEND_URL}${API_PATH.startsWith("/") ? API_PATH : `/${API_PATH}`}`
  : API_PATH;

/** Origen para socket.io-client (mismo host que el API). En web sin env, cae al host actual. */
export const SOCKET_IO_SERVER_URL =
  BACKEND_URL ||
  (typeof window !== "undefined" && !Capacitor.isNativePlatform()
    ? window.location.origin
    : "");

if (Capacitor.isNativePlatform() && !/^https?:\/\//i.test(API_BASE)) {
  // eslint-disable-next-line no-console
  console.error(
    "[ÑACURUTU] Falta REACT_APP_BACKEND_URL en el build. La APK no puede llamar al API. " +
      "Definilo en frontend/.env.production y recompilá con deploy/build-android-apk.sh."
  );
}

// Plataforma identificada para el backend. Los clientes (role=client) solo
// pueden loguearse si este header es "native" — bloqueo estricto desde web.
const APP_PLATFORM = Capacitor.isNativePlatform() ? "native" : "web";

// En WebView nativo, withCredentials + cookies cross-origin suele disparar CORS
// estricto o bloqueo de terceros → axios queda sin response (ERR_NETWORK). El JWT
// va en Authorization y en el body del login; no hace falta enviar cookies HttpOnly.
const api = axios.create({
  baseURL: API_BASE,
  withCredentials: !Capacitor.isNativePlatform(),
  headers: {
    "X-App-Platform": APP_PLATFORM,
    "X-App-Build": String(APP_BUILD),
  },
});

let refreshPromise = null;

// Attach token from localStorage as fallback
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Re-asegurar headers de identificación
  config.headers["X-App-Platform"] = APP_PLATFORM;
  config.headers["X-App-Build"] = String(APP_BUILD);
  // Device ID — se usa para el lock de dispositivo del cliente
  const deviceId = getStoredDeviceId();
  if (deviceId) {
    config.headers["X-Device-Id"] = deviceId;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error?.config || {};
    const status = error?.response?.status;
    const url = String(original?.url || "");
    const isLogin = url.includes("/auth/login");
    const isRefresh = url.includes("/auth/refresh");

    // No intentamos refresh para login/refresh ni si ya se reintentó.
    if (status !== 401 || isLogin || isRefresh || original._retry) {
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) {
      return Promise.reject(error);
    }

    try {
      if (!refreshPromise) {
        refreshPromise = api.post("/auth/refresh", { refresh_token: refreshToken });
      }
      const { data } = await refreshPromise;
      if (data?.access_token) {
        localStorage.setItem("access_token", data.access_token);
      }
      if (data?.refresh_token) {
        localStorage.setItem("refresh_token", data.refresh_token);
      }
      original._retry = true;
      return api(original);
    } catch (refreshErr) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      return Promise.reject(refreshErr);
    } finally {
      refreshPromise = null;
    }
  }
);

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

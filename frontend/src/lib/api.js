import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const BASE_PATH = process.env.REACT_APP_BASE_PATH || "";

export const API_BASE = `${BACKEND_URL}${BASE_PATH}/api`;

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Attach token from localStorage as fallback
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
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

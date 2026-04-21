/**
 * Device binding para clientes nativos:
 * - Obtiene device info con Capacitor Device plugin
 * - La envía al backend vía POST /api/app/device-bind al abrir la app
 * - Guarda el device_id en localStorage para que api.js lo mande como
 *   header X-Device-Id en todas las requests.
 */
import { Capacitor } from "@capacitor/core";
import { APP_BUILD } from "./appVersion";

const DEVICE_ID_KEY = "nacurutu_device_id";

export function getStoredDeviceId() {
  try {
    return localStorage.getItem(DEVICE_ID_KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredDeviceId(id) {
  try {
    localStorage.setItem(DEVICE_ID_KEY, id || "");
  } catch {}
}

/**
 * Obtiene y persiste el device info. Retorna el payload listo para enviar
 * al backend. En web → null (no se bindea).
 */
export async function readDeviceInfo() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { Device } = await import("@capacitor/device");
    const [id, info] = await Promise.all([
      Device.getId(),
      Device.getInfo(),
    ]);
    const deviceId = id?.identifier || id?.uuid || "";
    if (!deviceId) return null;
    setStoredDeviceId(deviceId);
    return {
      device_id: deviceId,
      brand: info?.manufacturer || null,
      model: info?.model || null,
      platform: info?.platform || null,
      os_version: info?.osVersion || null,
      app_build: APP_BUILD,
    };
  } catch (e) {
    console.warn("Device info failed:", e);
    return null;
  }
}

/**
 * Llama al endpoint de bind. Idempotente: si el device coincide con el
 * guardado, solo actualiza info; si difiere, backend devuelve 423.
 */
export async function bindDeviceToBackend(api) {
  const payload = await readDeviceInfo();
  if (!payload) return { ok: false, reason: "not-native" };
  try {
    const { data } = await api.post("/app/device-bind", payload);
    return { ok: true, data };
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.detail || err.message;
    return { ok: false, status, detail };
  }
}

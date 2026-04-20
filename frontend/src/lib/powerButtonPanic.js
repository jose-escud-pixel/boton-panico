/**
 * Wrapper del plugin nativo PowerButtonPanic (Android).
 * En web todas las funciones retornan { supported: false } sin ejecutar nada.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

// El plugin se registra automáticamente en el MainActivity del APK nativo.
// En web, registerPlugin devuelve un stub que rechaza las llamadas.
const PowerButtonPanicNative = registerPlugin("PowerButtonPanic");

const STORAGE_KEY = "nacurutu_power_button_panic_enabled";

export function isPowerButtonSupported() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function getPowerButtonPref() {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "1";
}

export function setPowerButtonPref(enabled) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}

/** Activar el servicio nativo. Guarda la preferencia. */
export async function enablePowerButton() {
  if (!isPowerButtonSupported()) {
    return { ok: false, reason: "unsupported" };
  }
  try {
    await PowerButtonPanicNative.enable();
    setPowerButtonPref(true);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "native-error", error: String(e) };
  }
}

/** Detener el servicio nativo. Guarda la preferencia. */
export async function disablePowerButton() {
  if (!isPowerButtonSupported()) {
    return { ok: false, reason: "unsupported" };
  }
  try {
    await PowerButtonPanicNative.disable();
    setPowerButtonPref(false);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "native-error", error: String(e) };
  }
}

/**
 * Aplicar la preferencia guardada al iniciar la app. Si el usuario la tenía
 * activada, reinicia el servicio (importante después de reboots del teléfono).
 */
export async function applyPowerButtonPref() {
  if (!isPowerButtonSupported()) return;
  if (getPowerButtonPref()) {
    try {
      await PowerButtonPanicNative.enable();
    } catch {}
  }
}

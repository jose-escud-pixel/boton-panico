/**
 * Native push + helpers usando @capacitor/push-notifications.
 * Sólo se ejecuta cuando la app corre en Capacitor (Android/iOS nativo).
 * En web retorna sin hacer nada — los navegadores usan Web Push + Notification API.
 */
import { Capacitor } from "@capacitor/core";
import api from "./api";

export function isNative() {
  try {
    return Capacitor.isNativePlatform?.() || false;
  } catch {
    return false;
  }
}

export function getPlatform() {
  try {
    return Capacitor.getPlatform?.() || "web";
  } catch {
    return "web";
  }
}

/**
 * Registra el dispositivo con FCM y envía el token al backend.
 * Llamar al iniciar sesión (cuando el user está autenticado).
 */
export async function registerNativePush() {
  if (!isNative()) return { ok: false, reason: "not-native" };

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    // 1) Request permission
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") {
      return { ok: false, reason: "denied" };
    }

    // 2) Register (trigger FCM token retrieval)
    await PushNotifications.register();

    // 3) Listen for the token and send it to our backend
    return await new Promise((resolve) => {
      const tokenListener = PushNotifications.addListener("registration", async (token) => {
        try {
          await api.post("/push/fcm-register", {
            token: token.value,
            platform: getPlatform(),
          });
          resolve({ ok: true, token: token.value });
        } catch (e) {
          resolve({ ok: false, reason: "backend-failed", error: String(e) });
        }
        // Cleanup (cada login re-subscribe limpio)
        try { (await tokenListener)?.remove?.(); } catch {}
      });

      PushNotifications.addListener("registrationError", (err) => {
        resolve({ ok: false, reason: "fcm-error", error: err?.error });
      });

      // Timeout de seguridad
      setTimeout(() => resolve({ ok: false, reason: "timeout" }), 15000);
    });
  } catch (e) {
    console.error("registerNativePush failed", e);
    return { ok: false, reason: "error", error: String(e) };
  }
}

/**
 * Configura listeners para mostrar notificaciones cuando llegan con la app abierta.
 * Capacitor por defecto sólo muestra notificaciones cuando la app está en background.
 */
export async function setupForegroundListeners(onAlertReceived) {
  if (!isNative()) return () => {};

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const { LocalNotifications } = await import("@capacitor/local-notifications");

    await LocalNotifications.requestPermissions();

    const l1 = await PushNotifications.addListener("pushNotificationReceived", async (notification) => {
      // App abierta → mostrar notificación local + sonar
      try {
        await LocalNotifications.schedule({
          notifications: [{
            id: Date.now() % 2147483647,
            title: notification.title || "ÑACURUTU",
            body: notification.body || "Nueva alerta",
            sound: "default",
            smallIcon: "ic_stat_icon_config_sample",
            extra: notification.data || {},
          }],
        });
      } catch {}
      if (onAlertReceived) onAlertReceived(notification.data || {});
    });

    const l2 = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      if (onAlertReceived) onAlertReceived(action.notification?.data || {});
    });

    return () => {
      try { l1.remove(); l2.remove(); } catch {}
    };
  } catch (e) {
    console.error("setupForegroundListeners failed", e);
    return () => {};
  }
}

/** Geolocalización nativa (más precisa y funciona en background que la del navegador) */
export async function getNativeLocation() {
  if (!isNative()) {
    // Fallback al navegador
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Sin geolocalización"));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    });
  }
  const { Geolocation } = await import("@capacitor/geolocation");
  const perm = await Geolocation.checkPermissions();
  if (perm.location !== "granted") {
    const req = await Geolocation.requestPermissions();
    if (req.location !== "granted") throw new Error("Permiso de ubicación denegado");
  }
  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 10000,
  });
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  };
}

/** Vibración háptica más intensa y confiable en native */
export async function hapticImpact(heavy = false) {
  if (isNative()) {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: heavy ? ImpactStyle.Heavy : ImpactStyle.Medium });
    } catch {}
  } else if (navigator.vibrate) {
    navigator.vibrate(heavy ? [100, 50, 200] : 50);
  }
}

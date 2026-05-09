/**
 * Native push + helpers usando @capacitor/push-notifications.
 * Sólo se ejecuta cuando la app corre en Capacitor (Android/iOS nativo).
 * En web retorna sin hacer nada — los navegadores usan Web Push + Notification API.
 */
import { Capacitor } from "@capacitor/core";
import api from "./api";
import { IS_ADMIN_BUILD } from "./buildMode";

export const ADMIN_CHANNELS = {
  police: {
    id: "nacurutu_admin_police_v2",
    name: "Alertas policiales",
    description: "Pánico y alertas críticas con sirena policial",
    sound: "police",
  },
  fire: {
    id: "nacurutu_admin_fire_v2",
    name: "Alertas de incendio",
    description: "Incendio con sirena de bomberos",
    sound: "firetruck",
  },
  ambulance: {
    id: "nacurutu_admin_ambulance_v2",
    name: "Alertas médicas",
    description: "Asistencia médica con sirena de ambulancia",
    sound: "ambulance",
  },
};

function channelForAlertType(alertType) {
  // Mantener coherencia con backend/push.py
  if (alertType === "fire") return ADMIN_CHANNELS.fire;
  if (alertType === "medical") return ADMIN_CHANNELS.ambulance;
  return ADMIN_CHANNELS.police;
}

/**
 * Crea el canal Android "nacurutu_admin_panic" con sonido sirena custom,
 * importancia máxima, visibilidad pública y vibración.
 *
 * El sonido `siren` referencia el archivo en android/app/src/main/res/raw/siren.ogg
 * (se copia durante el build con build-android-apk.sh).
 *
 * Llamar sólo en builds ADMIN. Android exige crear el canal ANTES del primer
 * push — una vez creado, el usuario puede cambiar sus propiedades manualmente
 * pero el sonido/importancia inicial sólo se aplica si el canal aún no existe.
 */
export async function ensureAdminPanicChannel() {
  if (!isNative()) return { ok: false, reason: "not-native" };
  if (getPlatform() !== "android") return { ok: false, reason: "not-android" };
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const channels = Object.values(ADMIN_CHANNELS);
    for (const ch of channels) {
      await PushNotifications.createChannel({
        id: ch.id,
        name: ch.name,
        description: ch.description,
        importance: 5, // IMPORTANCE_HIGH
        visibility: 1, // VISIBILITY_PUBLIC
        sound: ch.sound, // referencia a res/raw/<sound>.ogg
        vibration: true,
        lights: true,
        lightColor: "#FF0000",
      });
    }
    return { ok: true };
  } catch (e) {
    console.error("ensureAdminPanicChannel failed", e);
    return { ok: false, reason: "error", error: String(e) };
  }
}

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

    // 0) Si es build admin, crear canal con sirena ANTES de registrar
    //    (Android aplica sonido/importancia sólo al crear el canal por 1ra vez).
    if (IS_ADMIN_BUILD && getPlatform() === "android") {
      await ensureAdminPanicChannel();
    }

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

    if (IS_ADMIN_BUILD && getPlatform() === "android") {
      await ensureAdminPanicChannel();
    }

    await LocalNotifications.requestPermissions();

    const l1 = await PushNotifications.addListener("pushNotificationReceived", async (notification) => {
      // App abierta → mostrar notificación local + sonar
      try {
        await LocalNotifications.schedule({
          notifications: [{
            id: Date.now() % 2147483647,
            title: notification.title || "ÑACURUTU",
            body: notification.body || "Nueva alerta",
            sound: `${channelForAlertType(notification?.data?.alertType).sound}.ogg`,
            channelId: channelForAlertType(notification?.data?.alertType).id,
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

/**
 * Web Push registration + subscription for admin users.
 * Registers /service-worker.js with scope = REACT_APP_BASE_PATH (or "/") and
 * subscribes to push with the VAPID public key from the backend.
 */
import api from "./api";

const BASE_PATH = process.env.REACT_APP_BASE_PATH || "";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Registers SW and subscribes to push. Safe to call multiple times. */
export async function enablePushNotifications() {
  try {
    if (!("serviceWorker" in navigator)) {
      console.warn("Service Worker not supported");
      return { ok: false, reason: "no-sw" };
    }
    if (!("PushManager" in window)) {
      console.warn("Push API not supported");
      return { ok: false, reason: "no-push" };
    }
    if (!("Notification" in window)) {
      return { ok: false, reason: "no-notif" };
    }

    // Permission
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return { ok: false, reason: "denied" };
    }
    if (Notification.permission !== "granted") {
      return { ok: false, reason: "denied" };
    }

    // Register service worker with correct scope (subpath aware)
    const swUrl = `${BASE_PATH}/service-worker.js`;
    const scope = `${BASE_PATH}/`;
    const reg = await navigator.serviceWorker.register(swUrl, { scope });

    // Wait for the SW to be ready
    await navigator.serviceWorker.ready;

    // Get VAPID public key from backend
    const { data } = await api.get("/push/vapid-public-key");
    if (!data?.publicKey) return { ok: false, reason: "no-vapid" };

    const applicationServerKey = urlBase64ToUint8Array(data.publicKey);

    // Reuse existing subscription if valid
    let subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      // Verify the key matches (if the server rotates keys, resubscribe)
      try {
        const existingKey = new Uint8Array(subscription.options.applicationServerKey || []);
        const matches = existingKey.length === applicationServerKey.length &&
          existingKey.every((v, i) => v === applicationServerKey[i]);
        if (!matches) {
          await subscription.unsubscribe();
          subscription = null;
        }
      } catch {}
    }
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    const sub = subscription.toJSON();
    await api.post("/push/subscribe", {
      endpoint: sub.endpoint,
      keys: sub.keys,
    });

    return { ok: true, subscription };
  } catch (e) {
    console.error("enablePushNotifications failed", e);
    return { ok: false, reason: "error", error: String(e) };
  }
}

export async function disablePushNotifications() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration(`${BASE_PATH}/`);
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      try {
        await api.post("/push/unsubscribe", { endpoint: sub.endpoint });
      } catch {}
      await sub.unsubscribe();
    }
  } catch (e) {
    console.error("disablePushNotifications failed", e);
  }
}

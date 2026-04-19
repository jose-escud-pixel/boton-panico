/**
 * ÑACURUTU SEGURIDAD - Service Worker
 * Handles Web Push notifications even when the browser tab is closed.
 *
 * Scope: auto-detected from registration URL (e.g. /boton-panico/)
 */

/* eslint-disable no-restricted-globals */

const SCOPE = self.registration ? self.registration.scope : self.location.origin + "/";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    try {
      data = { title: event.data.text() };
    } catch {}
  }

  const title = data.title || "Nueva alerta";
  const body = data.body || "Tenés una nueva alerta de emergencia";
  const tag = data.alertId || `alert-${Date.now()}`;

  const options = {
    body,
    icon: SCOPE + "logo192.png",
    badge: SCOPE + "logo192.png",
    tag,
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 400, 100, 200],
    data,
    silent: false,
    actions: [
      { action: "open", title: "Ver alerta" },
      { action: "close", title: "Cerrar" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "close") return;

  const alertsUrl = SCOPE + "admin/alerts";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(SCOPE) && "focus" in client) {
          if ("navigate" in client) client.navigate(alertsUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(alertsUrl);
    })
  );
});

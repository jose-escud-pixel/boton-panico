import React, { createContext, useContext, useEffect, useRef, useCallback, useState } from "react";
import { useSocket } from "./SocketContext";
import { useAuth } from "./AuthContext";
import { sirenManager, speak } from "../lib/sirenManager";
import { enablePushNotifications, disablePushNotifications } from "../lib/webPush";
import api from "../lib/api";

const PHRASES = {
  panic: "Pánico",
  fire: "Fuego",
  medical: "Asistencia",
  on_way: "En camino",
  here: "Estoy aquí",
  silent: "Alerta silenciosa",
  normal: "Alerta nueva",
};

// Prioridad para decidir qué frase repetir cuando hay varias alertas pendientes
const TYPE_PRIORITY = {
  panic: 5,
  fire: 4,
  medical: 3,
  silent: 3,
  normal: 2,
  on_way: 2,
  here: 1,
};

// Cada cuánto se repite la voz TTS mientras hay alertas pendientes (ms)
const REPEAT_INTERVAL_MS = 8000;
const FALLBACK_SYNC_MS = 8000;

const AlertAudioContext = createContext(null);

export function AlertAudioProvider({ children }) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const pendingIdsRef = useRef(new Set());
  // Map<alertId, { type, phrase }> — info para saber qué frase decir
  const pendingAlertsRef = useRef(new Map());
  const repeatIntervalRef = useRef(null);
  const notifPermRef = useRef("default");
  const [pushStatus, setPushStatus] = useState("idle"); // idle | enabled | denied | unsupported | error
  const [pushLoading, setPushLoading] = useState(false);

  const showNotification = useCallback((alert) => {
    if (!("Notification" in window)) return;
    if (notifPermRef.current !== "granted" && Notification.permission !== "granted") return;
    const phrase = PHRASES[alert.type] || "Nueva alerta";
    try {
      const n = new Notification(`🚨 ${phrase.toUpperCase()}`, {
        body: `${alert.user_name} — ${alert.organization_name || ""}`,
        tag: alert.id,
        requireInteraction: true,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {}
  }, []);

  const startRepeatLoop = useCallback(() => {
    if (repeatIntervalRef.current) return; // ya está corriendo
    repeatIntervalRef.current = setInterval(() => {
      const alerts = pendingAlertsRef.current;
      if (alerts.size === 0) {
        clearInterval(repeatIntervalRef.current);
        repeatIntervalRef.current = null;
        if (sirenManager.isPlaying()) sirenManager.stop();
        return;
      }
      // Hablar el tipo más urgente de los pendientes
      let best = null;
      for (const a of alerts.values()) {
        const p = TYPE_PRIORITY[a.type] || 0;
        if (!best || p > (TYPE_PRIORITY[best.type] || 0)) best = a;
      }
      if (best) {
        // Resume AudioContext (por si se suspendió en background)
        sirenManager.resume();
        // Re-asegurar que la sirena siga sonando (por si el navegador la cortó)
        if (!sirenManager.isPlaying()) sirenManager.start(best.type);
        // Chrome a veces para speechSynthesis tras ~15s — kick con resume
        try { window.speechSynthesis.resume(); } catch {}
        speak(best.phrase);
      }
    }, REPEAT_INTERVAL_MS);
  }, []);

  const stopRepeatLoop = useCallback(() => {
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }
  }, []);

  const syncPendingFromServer = useCallback(async (announce = false) => {
    if (!user || user === false || user.role === "client") return;
    try {
      const { data } = await api.get("/alerts?status=pending&limit=500");
      const previousIds = new Set(pendingIdsRef.current);

      pendingIdsRef.current = new Set(data.map((a) => a.id));
      pendingAlertsRef.current.clear();
      data.forEach((a) => {
        pendingAlertsRef.current.set(a.id, {
          type: a.type,
          phrase: PHRASES[a.type] || "Alerta pendiente",
        });
      });

      const newAlerts = data.filter((a) => !previousIds.has(a.id));
      if (pendingAlertsRef.current.size > 0) {
        sirenManager.resume();
        if (!sirenManager.isPlaying()) {
          let best = null;
          for (const a of pendingAlertsRef.current.values()) {
            const p = TYPE_PRIORITY[a.type] || 0;
            if (!best || p > (TYPE_PRIORITY[best.type] || 0)) best = a;
          }
          sirenManager.start(best?.type || "panic");
        }
        if (!repeatIntervalRef.current) startRepeatLoop();
      }
      if (announce && newAlerts.length > 0) {
        const first = newAlerts[0];
        const phrase = PHRASES[first.type] || "Alerta nueva";
        setTimeout(() => speak(phrase), 600);
        showNotification(first);
      }
      if (pendingAlertsRef.current.size === 0) {
        stopRepeatLoop();
        if (sirenManager.isPlaying()) sirenManager.stop();
      }
    } catch {}
  }, [user, showNotification, startRepeatLoop, stopRepeatLoop]);

  const enablePush = useCallback(async () => {
    setPushLoading(true);
    const res = await enablePushNotifications();
    setPushLoading(false);
    if (res.ok) setPushStatus("enabled");
    else if (res.reason === "denied") setPushStatus("denied");
    else if (res.reason && res.reason.startsWith("no-")) setPushStatus("unsupported");
    else setPushStatus("error");
    return res;
  }, []);

  const disablePush = useCallback(async () => {
    await disablePushNotifications();
    setPushStatus("idle");
  }, []);

  // Al entrar el admin: pide permiso + autoregistra push si ya lo concedieron
  useEffect(() => {
    if (!user || user === false) return;
    if (user.role === "client") return;
    if ("Notification" in window) {
      notifPermRef.current = Notification.permission;
    }
    if ("Notification" in window && Notification.permission === "granted") {
      enablePush();
    }
  }, [user, enablePush]);

  // Primer gesto del admin en la página → resume AudioContext.
  // Sin esto, Chrome/Firefox no reproducen audio (autoplay policy) si el
  // usuario abrió la pestaña y nunca hizo click antes de que llegue una alerta.
  useEffect(() => {
    if (!user || user === false || user.role === "client") return;
    const onFirstInteraction = () => {
      sirenManager.resume();
      // Si hay pendientes y la sirena aún no suena, arrancarla ahora
      if (pendingAlertsRef.current.size > 0 && !sirenManager.isPlaying()) {
        sirenManager.start();
        if (!repeatIntervalRef.current) startRepeatLoop();
      }
    };
    document.addEventListener("click", onFirstInteraction, { once: true });
    document.addEventListener("keydown", onFirstInteraction, { once: true });
    return () => {
      document.removeEventListener("click", onFirstInteraction);
      document.removeEventListener("keydown", onFirstInteraction);
    };
  }, [user, startRepeatLoop]);

  // Carga pendientes al entrar y re-sincroniza desde backend.
  useEffect(() => {
    if (!user || user === false || user.role === "client") return;
    syncPendingFromServer(false);
  }, [user, syncPendingFromServer]);

  // Page visibility: cuando el admin vuelve a la pestaña, si había pendientes
  // y la sirena se silenció por autoplay policy, la reanuda.
  useEffect(() => {
    if (!user || user === false || user.role === "client") return;
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      syncPendingFromServer(true);
      if (pendingAlertsRef.current.size === 0) return;
      sirenManager.resume();
      if (!sirenManager.isPlaying()) {
        let best = null;
        for (const a of pendingAlertsRef.current.values()) {
          const p = TYPE_PRIORITY[a.type] || 0;
          if (!best || p > (TYPE_PRIORITY[best.type] || 0)) best = a;
        }
        sirenManager.start(best?.type || "panic");
      }
      if (!repeatIntervalRef.current) startRepeatLoop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [user, startRepeatLoop, syncPendingFromServer]);

  // Poll de respaldo: si el websocket se cae en background, esta verificación
  // periódica vuelve a sincronizar alertas y evita perder pánicos.
  useEffect(() => {
    if (!user || user === false || user.role === "client") return;
    const tick = () => {
      const isVisible = document.visibilityState === "visible";
      syncPendingFromServer(isVisible);
    };
    tick();
    const id = setInterval(tick, FALLBACK_SYNC_MS);
    return () => clearInterval(id);
  }, [user, syncPendingFromServer]);

  useEffect(() => {
    if (!socket) return;
    // Clientes NO escuchan sirena + voz: es feedback para los admins que monitorean
    if (user && user !== false && user.role === "client") return;
    const onNew = (alert) => {
      pendingIdsRef.current.add(alert.id);
      const phrase = PHRASES[alert.type] || "Alerta nueva";
      // Guardar info para que el loop de repetición hable el tipo más urgente
      pendingAlertsRef.current.set(alert.id, { type: alert.type, phrase });
      sirenManager.start(alert.type);
      setTimeout(() => speak(phrase), 1200);
      showNotification(alert);
      startRepeatLoop();
    };
    const onUpdated = (alert) => {
      if (alert.status && alert.status !== "pending") {
        pendingIdsRef.current.delete(alert.id);
        pendingAlertsRef.current.delete(alert.id);
        if (pendingIdsRef.current.size === 0) {
          stopRepeatLoop();
          if (sirenManager.isPlaying()) sirenManager.stop();
        }
      } else if (alert.status === "pending") {
        pendingIdsRef.current.add(alert.id);
        if (!pendingAlertsRef.current.has(alert.id)) {
          const phrase = PHRASES[alert.type] || "Alerta nueva";
          pendingAlertsRef.current.set(alert.id, { type: alert.type, phrase });
        }
      }
    };
    const onConnect = () => syncPendingFromServer(false);
    socket.on("alert:new", onNew);
    socket.on("alert:updated", onUpdated);
    socket.on("connect", onConnect);
    return () => {
      socket.off("alert:new", onNew);
      socket.off("alert:updated", onUpdated);
      socket.off("connect", onConnect);
    };
  }, [socket, user, showNotification, startRepeatLoop, stopRepeatLoop, syncPendingFromServer]);

  useEffect(() => {
    const onLocalStatusChanged = (event) => {
      const id = event?.detail?.id;
      const status = event?.detail?.status;
      if (!id) return;
      if (status && status !== "pending") {
        pendingIdsRef.current.delete(id);
        pendingAlertsRef.current.delete(id);
        if (pendingIdsRef.current.size === 0) {
          stopRepeatLoop();
          if (sirenManager.isPlaying()) sirenManager.stop();
        }
      }
    };
    window.addEventListener("nacurutu:alert-status-changed", onLocalStatusChanged);
    return () => window.removeEventListener("nacurutu:alert-status-changed", onLocalStatusChanged);
  }, [stopRepeatLoop]);

  const silence = useCallback(() => {
    sirenManager.stop();
    stopRepeatLoop();
    pendingIdsRef.current.clear();
    pendingAlertsRef.current.clear();
  }, [stopRepeatLoop]);

  return (
    <AlertAudioContext.Provider
      value={{
        silence,
        sirenPlaying: sirenManager.isPlaying,
        pushStatus,
        pushLoading,
        enablePush,
        disablePush,
      }}
    >
      {children}
    </AlertAudioContext.Provider>
  );
}

export function useAlertAudio() {
  return (
    useContext(AlertAudioContext) || {
      silence: () => {},
      sirenPlaying: () => false,
      pushStatus: "idle",
      pushLoading: false,
      enablePush: async () => ({ ok: false }),
      disablePush: async () => {},
    }
  );
}

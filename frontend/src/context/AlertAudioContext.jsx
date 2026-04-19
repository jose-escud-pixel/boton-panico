import React, { createContext, useContext, useEffect, useRef, useCallback } from "react";
import { useSocket } from "./SocketContext";
import { useAuth } from "./AuthContext";
import { sirenManager, speak } from "../lib/sirenManager";
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

const AlertAudioContext = createContext(null);

/**
 * Gestiona audio global de alertas para el admin:
 * - Al recibir alert:new → sirena + voz + notificación
 * - Al recibir alert:updated (status != pending) → remueve de pendientes
 * - Cuando no quedan pendientes → detiene la sirena
 */
export function AlertAudioProvider({ children }) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const pendingIdsRef = useRef(new Set());
  const notifPermRef = useRef("default");

  // Pide permiso de notificaciones al montar (para admin)
  useEffect(() => {
    if (!user || user === false) return;
    if (user.role === "client") return; // sólo admins
    if ("Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().then((p) => { notifPermRef.current = p; });
      } else {
        notifPermRef.current = Notification.permission;
      }
    }
  }, [user]);

  // Al login del admin, cargar alertas pendientes existentes y SIN hacer sonar
  // (el admin ya estaba informado). Sólo las usamos para trackear.
  useEffect(() => {
    if (!user || user === false || user.role === "client") return;
    (async () => {
      try {
        const { data } = await api.get("/alerts?status=pending&limit=500");
        pendingIdsRef.current = new Set(data.map((a) => a.id));
      } catch {}
    })();
  }, [user]);

  const showNotification = useCallback((alert) => {
    if (!("Notification" in window)) return;
    if (notifPermRef.current !== "granted") return;
    const phrase = PHRASES[alert.type] || "Nueva alerta";
    try {
      const n = new Notification(`🚨 ${phrase.toUpperCase()}`, {
        body: `${alert.user_name} — ${alert.organization_name || ""}`,
        tag: alert.id,
        requireInteraction: true,
        icon: "/logo192.png",
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {}
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onNew = (alert) => {
      pendingIdsRef.current.add(alert.id);
      const phrase = PHRASES[alert.type] || "Alerta nueva";

      // 1) Sirena primero (loop)
      sirenManager.start();

      // 2) Voz a los 1.2s (después de que arranque la sirena)
      setTimeout(() => speak(phrase), 1200);

      // 3) Notificación nativa
      showNotification(alert);
    };

    const onUpdated = (alert) => {
      if (alert.status && alert.status !== "pending") {
        pendingIdsRef.current.delete(alert.id);
        if (pendingIdsRef.current.size === 0 && sirenManager.isPlaying()) {
          sirenManager.stop();
        }
      } else if (alert.status === "pending") {
        pendingIdsRef.current.add(alert.id);
      }
    };

    socket.on("alert:new", onNew);
    socket.on("alert:updated", onUpdated);
    return () => {
      socket.off("alert:new", onNew);
      socket.off("alert:updated", onUpdated);
    };
  }, [socket, showNotification]);

  const silence = useCallback(() => {
    sirenManager.stop();
    pendingIdsRef.current.clear();
  }, []);

  return (
    <AlertAudioContext.Provider value={{ silence, sirenPlaying: sirenManager.isPlaying }}>
      {children}
    </AlertAudioContext.Provider>
  );
}

export function useAlertAudio() {
  return useContext(AlertAudioContext) || { silence: () => {}, sirenPlaying: () => false };
}

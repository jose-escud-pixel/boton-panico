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

const AlertAudioContext = createContext(null);

export function AlertAudioProvider({ children }) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const pendingIdsRef = useRef(new Set());
  const notifPermRef = useRef("default");
  const [pushStatus, setPushStatus] = useState("idle"); // idle | enabled | denied | unsupported | error
  const [pushLoading, setPushLoading] = useState(false);

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

  // Carga alertas pendientes existentes (sin hacer sonar — admin ya estaba informado)
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

  useEffect(() => {
    if (!socket) return;
    const onNew = (alert) => {
      pendingIdsRef.current.add(alert.id);
      const phrase = PHRASES[alert.type] || "Alerta nueva";
      sirenManager.start();
      setTimeout(() => speak(phrase), 1200);
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

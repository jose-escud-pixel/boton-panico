import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";
import { SOCKET_IO_SERVER_URL } from "../lib/api";

const SocketContext = createContext(null);
const BASE_PATH = process.env.REACT_APP_BASE_PATH || "";

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user || user === false) return;
    const token = localStorage.getItem("access_token");
    if (!token) return;
    if (!SOCKET_IO_SERVER_URL) {
      // eslint-disable-next-line no-console
      console.warn("[Socket] Sin REACT_APP_BACKEND_URL — no se abre WebSocket (típico de APK mal compilada).");
      return;
    }
    const socket = io(SOCKET_IO_SERVER_URL, {
      path: `${BASE_PATH}/api/socket.io`,
      transports: ["websocket", "polling"],
      auth: { token },
      withCredentials: !Capacitor.isNativePlatform(),
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
    });
    socketRef.current = socket;
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    const onWake = () => {
      if (document.visibilityState === "visible" || document.visibilityState == null) {
        socket.connect();
      }
    };
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

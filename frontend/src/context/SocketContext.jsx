import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { SOCKET_IO_SERVER_URL, SOCKET_IO_PATH } from "../lib/api";
import { useAuth } from "./AuthContext";

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user || user === false) return;
    const token = localStorage.getItem("access_token");
    if (!token) return;
    const socket = io(SOCKET_IO_SERVER_URL, {
      path: SOCKET_IO_PATH,
      transports: ["websocket", "polling"],
      auth: { token },
      withCredentials: true,
    });
    socketRef.current = socket;
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    return () => {
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

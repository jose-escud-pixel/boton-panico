import React, { createContext, useContext, useEffect, useState } from "react";
import api from "../lib/api";
import { isNative, registerNativePush } from "../lib/nativePush";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=guest, obj=user
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/auth/me");
        setUser(data);
        // Si estamos en app nativa, registrar FCM al recuperar sesión
        if (isNative()) {
          registerNativePush().catch(() => {});
        }
      } catch {
        setUser(false);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const login = async (identifier, password) => {
    const { data } = await api.post("/auth/login", { identifier, password });
    if (data.access_token) {
      localStorage.setItem("access_token", data.access_token);
    }
    setUser(data.user);
    // Auto-registro FCM en native después del login
    if (isNative()) {
      registerNativePush().catch(() => {});
    }
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    localStorage.removeItem("access_token");
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, checking, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

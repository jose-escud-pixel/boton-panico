import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import api from "../lib/api";

const OrgContext = createContext(null);
const STORAGE_KEY = "nacurutu_active_org_id";

/**
 * Para el super_admin: permite elegir qué organización está viendo.
 * Para admin/client: siempre fija a su org.
 * El org_id activo se persiste en localStorage y se expone a las páginas
 * que necesitan filtrar por org (dashboard, alerts, users, etc.).
 *
 * Para conservar compatibilidad y NO tener que modificar cada endpoint,
 * el filter se aplica del lado del cliente en las vistas, pasando
 * ?organization_id=X cuando corresponde.
 */
export function OrgProvider({ children }) {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState([]);
  const [activeOrgId, setActiveOrgId] = useState("");

  useEffect(() => {
    if (!user || user === false) return;
    if (user.role !== "super_admin") {
      setActiveOrgId(user.organization_id || "");
      return;
    }
    // super_admin: cargar todas las orgs + restaurar última elegida
    (async () => {
      try {
        const { data } = await api.get("/organizations");
        setOrgs(data);
        const stored = localStorage.getItem(STORAGE_KEY) || "";
        // "all" es un valor válido para super_admin (ver todas)
        if (stored === "all" || data.some((o) => o.id === stored)) {
          setActiveOrgId(stored);
        } else {
          setActiveOrgId("all");
        }
      } catch {}
    })();
  }, [user]);

  const selectOrg = (id) => {
    setActiveOrgId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  };

  const isAll = user?.role === "super_admin" && activeOrgId === "all";

  return (
    <OrgContext.Provider
      value={{
        orgs,
        activeOrgId,
        selectOrg,
        isAll,
        canSwitch: user?.role === "super_admin",
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext) || {
    orgs: [],
    activeOrgId: "",
    selectOrg: () => {},
    isAll: false,
    canSwitch: false,
  };
}

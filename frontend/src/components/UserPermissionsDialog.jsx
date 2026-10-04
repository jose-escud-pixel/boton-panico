import React, { useEffect, useState } from "react";
import api, { formatApiError } from "../lib/api";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

// ── Fuente única de verdad de módulos + agrupación visual ──────────────────
// Reflejar acá cualquier módulo nuevo del sistema (y su ítem de menú en
// AdminLayout.jsx) para que los permisos granulares no queden desactualizados.
export const PERMISSION_GROUPS = [
  {
    title: "Panel",
    modules: [{ key: "dashboard", label: "Dashboard" }],
  },
  {
    title: "Alertas y auditoría",
    modules: [
      { key: "alerts", label: "Alertas" },
      { key: "audit", label: "Auditoría", viewOnly: true },
    ],
  },
  {
    title: "Gestión de cuentas",
    modules: [
      { key: "users", label: "Usuarios" },
      { key: "organizations", label: "Organizaciones" },
      { key: "online_users", label: "Usuarios en línea", viewOnly: true },
    ],
  },
  {
    title: "Dispositivos y alarmas",
    modules: [{ key: "devices", label: "Dispositivos" }],
  },
  {
    title: "Soporte",
    modules: [{ key: "tickets", label: "Tickets" }],
  },
];

export const PERMISSION_MODULES = PERMISSION_GROUPS.flatMap((g) => g.modules);
export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete"];

export function emptyCrud(viewDefault = false) {
  return { view: !!viewDefault, create: false, edit: false, delete: false };
}

export function defaultAdminPermissions() {
  return PERMISSION_MODULES.reduce((acc, m) => {
    acc[m.key] = emptyCrud(m.key === "dashboard" || m.key === "alerts");
    return acc;
  }, {});
}

export function defaultClientPermissions() {
  return PERMISSION_MODULES.reduce((acc, m) => {
    acc[m.key] = emptyCrud(false);
    return acc;
  }, {});
}

export function defaultSuperAdminPermissions() {
  return PERMISSION_MODULES.reduce((acc, m) => {
    acc[m.key] = { view: true, create: true, edit: true, delete: true };
    return acc;
  }, {});
}

export function normalizePermissions(perms, role) {
  if (role === "client") return defaultClientPermissions();
  if (role === "super_admin") return defaultSuperAdminPermissions();
  const p = perms || {};
  const hasModules = PERMISSION_MODULES.some((m) => p[m.key]);
  if (hasModules) {
    const out = defaultAdminPermissions();
    PERMISSION_MODULES.forEach((m) => {
      const src = p[m.key] || {};
      out[m.key] = {
        view: !!src.view,
        create: !!src.create,
        edit: !!src.edit,
        delete: !!src.delete,
      };
    });
    return out;
  }
  // Compatibilidad payload viejo (create/edit/delete/view global)
  if (["view", "create", "edit", "delete"].some((k) => Object.prototype.hasOwnProperty.call(p, k))) {
    const flat = {
      view: !!p.view,
      create: !!p.create,
      edit: !!p.edit,
      delete: !!p.delete,
    };
    const out = defaultAdminPermissions();
    PERMISSION_MODULES.forEach((m) => { out[m.key] = { ...flat }; });
    out.dashboard = { view: flat.view, create: false, edit: false, delete: false };
    out.online_users = { view: flat.view, create: false, edit: false, delete: false };
    out.audit = { view: flat.view, create: false, edit: false, delete: false };
    return out;
  }
  return defaultAdminPermissions();
}

/**
 * Diálogo dedicado para editar los permisos granulares de un admin.
 * Se abre desde un ícono aparte en la fila de la tabla (no mezclado con el
 * resto de los datos del usuario). Guarda directamente vía PATCH /users/{id}.
 */
export default function UserPermissionsDialog({ open, onOpenChange, targetUser, onSaved }) {
  const [permissions, setPermissions] = useState(defaultAdminPermissions());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (targetUser) {
      setPermissions(normalizePermissions(targetUser.permissions, "admin"));
    }
  }, [targetUser]);

  const setModuleAction = (moduleKey, action, checked) => {
    setPermissions((prev) => ({
      ...prev,
      [moduleKey]: { ...(prev[moduleKey] || emptyCrud()), [action]: checked },
    }));
  };

  const setAllInModule = (moduleKey, checked) => {
    setPermissions((prev) => ({
      ...prev,
      [moduleKey]: { view: checked, create: checked, edit: checked, delete: checked },
    }));
  };

  const save = async () => {
    if (!targetUser) return;
    setSaving(true);
    try {
      await api.put(`/users/${targetUser.id}`, { permissions });
      toast.success(`Permisos actualizados — ${targetUser.name}`);
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg max-w-xl max-h-[88vh] flex flex-col"
        data-testid="user-permissions-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-heading tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-rose-600" strokeWidth={1.8} />
            Permisos — {targetUser?.name}
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-xs">
            Acceso granular por módulo. Los módulos marcados como "solo ver" no tienen crear/editar/eliminar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.title} className="space-y-2">
              <p className="overline text-[0.65rem] text-slate-400 dark:text-slate-500">{group.title}</p>
              <div className="space-y-2">
                {group.modules.map((m) => {
                  const perm = permissions[m.key] || emptyCrud();
                  const actions = m.viewOnly ? ["view"] : PERMISSION_ACTIONS;
                  return (
                    <div key={m.key} className="border border-slate-200 dark:border-slate-700 rounded-md p-2.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{m.label}</span>
                        {!m.viewOnly && (
                          <button
                            type="button"
                            onClick={() => setAllInModule(m.key, !(perm.view && perm.create && perm.edit && perm.delete))}
                            className="text-[0.65rem] text-rose-600 hover:text-rose-500 font-medium"
                          >
                            {perm.view && perm.create && perm.edit && perm.delete ? "Quitar todo" : "Marcar todo"}
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {actions.map((a) => (
                          <label key={`${m.key}-${a}`} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <Checkbox
                              checked={!!perm[a]}
                              onCheckedChange={(c) => setModuleAction(m.key, a, !!c)}
                              data-testid={`perm-${m.key}-${a}-checkbox`}
                            />
                            <span className="capitalize">{a}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="sticky bottom-0 bg-white dark:bg-slate-900 pt-2 border-t border-slate-200 dark:border-slate-700">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-md">
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={saving}
            className="bg-rose-600 hover:bg-rose-500 text-white rounded-md"
            data-testid="save-permissions-button"
          >
            {saving ? "Guardando..." : "Guardar permisos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

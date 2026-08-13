import React, { useCallback, useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "../../lib/api";
import { useOrg } from "../../context/OrgContext";
import { useAuth } from "../../context/AuthContext";
import ChipFilter from "../../components/ChipFilter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { toast } from "sonner";
import { Activity, Wifi, WifiOff } from "lucide-react";

export default function OnlineUsers() {
  const { user } = useAuth();
  const { activeOrgId, isAll } = useOrg();
  const [rows, setRows] = useState([]);
  const [chips, setChips] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/users/online");
      setRows(data || []);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((u) => {
      if (user?.role === "super_admin" && activeOrgId && !isAll) {
        if (u.organization_id !== activeOrgId) return false;
      }
      for (const c of chips) {
        const v = String(c.value || "").toLowerCase();
        if (c.key === "online") {
          const want = v === "yes" || v === "si" || v === "sí" || v === "true";
          if (!!u.is_online !== want) return false;
        } else if (c.key === "role") {
          if ((u.role || "").toLowerCase() !== v) return false;
        } else {
          const hay = [u.name, u.email, u.phone, u.organization_name, u.role]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(v)) return false;
        }
      }
      return true;
    });
  }, [rows, chips, user, activeOrgId, isAll]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="admin-online-users">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="overline mb-2">Monitoreo</p>
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Usuarios en línea
          </h1>
        </div>
        <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700">
          <Activity className="w-3 h-3 mr-1" />
          {filtered.filter((r) => r.is_online).length} conectados
        </Badge>
      </div>

      <div className="mb-4">
        <ChipFilter
          chips={chips}
          onChange={setChips}
          placeholder="Buscar: online:yes, role:admin, nombre, email, teléfono..."
          suggestions={{ online: ["yes", "no"], role: ["super_admin", "admin", "client"] }}
        />
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 dark:border-slate-700 hover:bg-transparent">
                <TableHead className="overline text-slate-500">Estado</TableHead>
                <TableHead className="overline text-slate-500">Usuario</TableHead>
                <TableHead className="overline text-slate-500">Rol</TableHead>
                <TableHead className="overline text-slate-500">Contacto</TableHead>
                <TableHead className="overline text-slate-500">Organización</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={5} className="text-slate-400 py-6">Cargando...</TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-slate-400 py-8 text-center">Sin usuarios con estos filtros</TableCell></TableRow>
              )}
              {filtered.map((u) => (
                <TableRow key={u.id} className="border-slate-100 dark:border-slate-800">
                  <TableCell>
                    {u.is_online ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                        <Wifi className="w-3 h-3" /> En línea
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-500 text-xs">
                        <WifiOff className="w-3 h-3" /> Desconectado
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-800 dark:text-slate-200">
                    <div className="font-semibold">{u.name || "—"}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{u.role}</TableCell>
                  <TableCell className="text-xs text-slate-600">{u.phone || "—"}</TableCell>
                  <TableCell className="text-sm text-slate-700">{u.organization_name || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

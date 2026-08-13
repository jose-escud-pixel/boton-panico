import React, { useCallback, useEffect, useState } from "react";
import api from "../../lib/api";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function Audit() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (action.trim()) params.set("action", action.trim());
      const { data } = await api.get(`/audit?${params.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [action]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="admin-audit">
      <div className="mb-6">
        <p className="overline mb-2 text-slate-500 dark:text-slate-400">Trazabilidad</p>
        <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Auditoría
        </h1>
      </div>

      <div className="mb-4 max-w-sm">
        <Label className="overline block mb-1.5">Filtrar por acción</Label>
        <Input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="alert.created"
          className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-600 rounded-md"
        />
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 dark:border-slate-700 hover:bg-transparent">
                <TableHead className="overline text-slate-500 dark:text-slate-400">Cuándo</TableHead>
                <TableHead className="overline text-slate-500 dark:text-slate-400">Acción</TableHead>
                <TableHead className="overline text-slate-500 dark:text-slate-400">Resumen</TableHead>
                <TableHead className="overline text-slate-500 dark:text-slate-400">Actor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-slate-400 dark:text-slate-500">Cargando…</TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-slate-400 dark:text-slate-500">Sin registros</TableCell>
                </TableRow>
              )}
              {!loading && rows.map((r) => (
                <TableRow key={r.id} className="border-slate-100 dark:border-slate-700 align-top">
                  <TableCell className="text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap font-mono-tactical">
                    {r.ts ? format(new Date(r.ts), "PPp", { locale: es }) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded text-[0.65rem] dark:border-slate-600 dark:text-slate-200">
                      {r.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-800 dark:text-slate-100 max-w-md">
                    <div>{r.summary}</div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                    <div>{r.actor_name || "—"}</div>
                    <div className="text-slate-500 dark:text-slate-400">{r.actor_email || ""}</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

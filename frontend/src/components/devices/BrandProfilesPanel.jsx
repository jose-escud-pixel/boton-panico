import React, { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Plus, Pencil, Trash2, RefreshCw, Lock } from "lucide-react";
import { toast } from "sonner";
import EventRulesEditor from "./EventRulesEditor";

/**
 * CRUD de "marcas de panel" — cada una es una plantilla reutilizable de reglas
 * de eventos (severidad + armado/desarmado por código). Se usa para no tener
 * que reconfigurar las mismas reglas dispositivo por dispositivo: al crear o
 * editar un dispositivo se puede "cargar" la plantilla de su marca con un click.
 */
export default function BrandProfilesPanel({ onBrandsChanged }) {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: "", notes: "", event_rules: [] });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/alarm-brands");
      setBrands(data);
      onBrandsChanged?.(data);
    } catch {
      toast.error("No se pudieron cargar las marcas");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", notes: "", event_rules: [] });
    setFormOpen(true);
  };

  const openEdit = (b) => {
    setEditing(b);
    setForm({ name: b.name, notes: b.notes || "", event_rules: b.event_rules || [] });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("El nombre es requerido"); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), notes: form.notes.trim() || null, event_rules: form.event_rules };
      if (editing) {
        await api.patch(`/alarm-brands/${editing.id}`, payload);
        toast.success("Marca actualizada");
      } else {
        await api.post("/alarm-brands", payload);
        toast.success("Marca creada");
      }
      setFormOpen(false);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b) => {
    if (!window.confirm(`¿Eliminar la marca "${b.name}"? Esta acción no se puede deshacer. Si algún dispositivo la está usando, el sistema no va a dejar borrarla.`)) return;
    try {
      await api.delete(`/alarm-brands/${b.id}`);
      toast.success("Marca eliminada");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
          Cada marca es una plantilla de reglas de eventos reutilizable. Al crear o editar un
          dispositivo podés cargar las reglas de su marca con un click y después ajustarlas
          para ese dispositivo en particular, sin tener que reconfigurar todo de cero. Las marcas
          precargadas (con candado) también se pueden renombrar o eliminar libremente — solo se
          bloquea el borrado si algún dispositivo la tiene asignada.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={load} disabled={loading} className="rounded-md dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} strokeWidth={1.8} />
          </Button>
          <Button onClick={openCreate} className="rounded-md bg-rose-600 hover:bg-rose-700 text-white">
            <Plus className="w-4 h-4 mr-1" strokeWidth={2} /> Nueva marca
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {brands.map((b) => (
          <div key={b.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span className="truncate">{b.name}</span>
                  {b.is_system && (
                    <Lock
                      className="w-3 h-3 text-slate-400 shrink-0"
                      strokeWidth={1.8}
                      title="Marca precargada por el sistema — se puede renombrar o eliminar igual, siempre que ningún dispositivo la esté usando"
                    />
                  )}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {(b.event_rules || []).length} reglas configuradas
                </p>
              </div>
            </div>
            {b.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{b.notes}</p>}
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => openEdit(b)} className="flex-1 text-xs dark:border-slate-700 dark:text-slate-300">
                <Pencil className="w-3.5 h-3.5 mr-1" strokeWidth={1.8} /> Editar reglas
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(b)} title="Eliminar marca" className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
              </Button>
            </div>
          </div>
        ))}
        {!loading && brands.length === 0 && (
          <p className="text-sm text-slate-400 col-span-full text-center py-10">Todavía no hay marcas configuradas.</p>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={(o) => { if (!o) setFormOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="dark:text-white">
              {editing ? `Editar marca — ${editing.name}` : "Nueva marca"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="dark:text-slate-300">Nombre *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="ej: DSC PowerSeries, Alarma local Piso 4…"
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="dark:text-slate-300">Notas (opcional)</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                placeholder="Notas internas sobre esta marca/panel"
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
            <div>
              <Label className="dark:text-slate-300 mb-2 block">Reglas de eventos de esta marca</Label>
              <EventRulesEditor rules={form.event_rules} onChange={(r) => setForm((p) => ({ ...p, event_rules: r }))} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setFormOpen(false)} className="flex-1 dark:border-slate-700 dark:text-slate-300">
                Cancelar
              </Button>
              <Button onClick={save} disabled={saving} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

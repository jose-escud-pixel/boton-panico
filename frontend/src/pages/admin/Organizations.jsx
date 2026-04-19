import React, { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
import { Plus, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

export default function Organizations() {
  const { user: me } = useAuth();
  const [orgs, setOrgs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id: null, name: "", logo_url: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/organizations");
      setOrgs(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ id: null, name: "", logo_url: "" });
    setOpen(true);
  };

  const openEdit = (o) => {
    setEditing(o);
    setForm({ id: o.id, name: o.name, logo_url: o.logo_url || "" });
    setOpen(true);
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo demasiado grande (máx 2MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setForm((f) => ({ ...f, logo_url: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/organizations/${form.id}`, { name: form.name, logo_url: form.logo_url });
        toast.success("Organización actualizada");
      } else {
        await api.post("/organizations", { name: form.name, logo_url: form.logo_url });
        toast.success("Organización creada");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (o) => {
    if (!window.confirm(`¿Eliminar ${o.name}?`)) return;
    try {
      await api.delete(`/organizations/${o.id}`);
      toast.success("Organización eliminada");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const canCreate = me?.role === "super_admin";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="admin-organizations">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="overline mb-2">Gestión</p>
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight">Organizaciones</h1>
        </div>
        {canCreate && (
          <Button
            onClick={openCreate}
            className="bg-rose-600 hover:bg-rose-500 text-white rounded-sm"
            data-testid="new-org-button"
          >
            <Plus className="w-4 h-4 mr-1" strokeWidth={2} /> Nueva
          </Button>
        )}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="overline text-zinc-400">Logo</TableHead>
                <TableHead className="overline text-zinc-400">Nombre</TableHead>
                <TableHead className="overline text-zinc-400">Creada</TableHead>
                <TableHead className="overline text-zinc-400 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((o) => (
                <TableRow key={o.id} className="border-zinc-800 hover:bg-zinc-800/40" data-testid="org-row">
                  <TableCell>
                    {o.logo_url ? (
                      <img src={o.logo_url} alt={o.name} className="w-10 h-10 rounded-sm object-cover border border-zinc-800" />
                    ) : (
                      <div className="w-10 h-10 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-500 text-xs">
                        —
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-heading font-semibold">{o.name}</TableCell>
                  <TableCell className="text-zinc-400 text-xs font-mono-tactical">
                    {new Date(o.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(o)} className="text-zinc-400 hover:text-white" data-testid="edit-org-button">
                      <Pencil className="w-4 h-4" strokeWidth={1.5} />
                    </Button>
                    {canCreate && (
                      <Button size="sm" variant="ghost" onClick={() => remove(o)} className="text-zinc-400 hover:text-rose-400" data-testid="delete-org-button">
                        <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {orgs.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-zinc-500 py-8 text-center">Sin organizaciones</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-md max-w-lg" data-testid="org-form-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">
              {editing ? "Editar organización" : "Nueva organización"}
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-xs">
              Configura el nombre y logo que verán los usuarios
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div>
              <Label className="overline block mb-1.5">Nombre</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="bg-zinc-900 border-zinc-800 rounded-sm"
                data-testid="org-name-input"
              />
            </div>
            <div>
              <Label className="overline block mb-1.5">Logo</Label>
              <div className="flex items-center gap-3">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="preview" className="w-16 h-16 rounded-sm object-cover border border-zinc-800" />
                ) : (
                  <div className="w-16 h-16 rounded-sm bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 text-xs">
                    Sin logo
                  </div>
                )}
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center justify-center gap-2 py-2 px-3 bg-zinc-900 border border-zinc-800 rounded-sm hover:bg-zinc-800 text-sm">
                    <Upload className="w-4 h-4" strokeWidth={1.5} />
                    <span>Subir imagen</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => uploadLogo(e.target.files?.[0])}
                    data-testid="org-logo-input"
                  />
                </label>
              </div>
              <p className="text-xs text-zinc-600 mt-1.5">Máx 2MB. Se guarda como data URL.</p>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="rounded-sm">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-rose-600 hover:bg-rose-500 rounded-sm"
                data-testid="org-save-button"
              >
                {saving ? "Guardando..." : editing ? "Actualizar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

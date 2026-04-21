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
import { Badge } from "../../components/ui/badge";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const ROLE_STYLE = {
  super_admin: "bg-rose-50 text-rose-700 border-rose-200",
  admin: "bg-amber-50 text-amber-700 border-amber-200",
  client: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm());
  const [saving, setSaving] = useState(false);

  function initialForm() {
    return {
      id: null,
      email: "",
      password: "",
      name: "",
      role: "client",
      organization_id: me?.organization_id || "",
      permissions: { create: false, edit: false, delete: false, view: true },
    };
  }

  const load = useCallback(async () => {
    try {
      const [uRes, oRes] = await Promise.all([
        api.get("/users"),
        api.get("/organizations"),
      ]);
      setUsers(uRes.data);
      setOrgs(oRes.data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(initialForm());
    setOpen(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({
      id: u.id,
      email: u.email,
      password: "",
      name: u.name,
      role: u.role,
      organization_id: u.organization_id,
      permissions: u.permissions || { create: false, edit: false, delete: false, view: true },
    });
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const { id, email, ...patch } = form;
        if (!patch.password) delete patch.password;
        await api.put(`/users/${id}`, patch);
        toast.success("Usuario actualizado");
      } else {
        await api.post("/users", form);
        toast.success("Usuario creado");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`¿Eliminar ${u.name}?`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.success("Usuario eliminado");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const orgMap = Object.fromEntries(orgs.map((o) => [o.id, o.name]));
  const canCreateAdmin = me?.role === "super_admin";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="admin-users">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="overline mb-2">Gestión</p>
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight text-slate-900">Usuarios</h1>
        </div>
        <Button
          onClick={openCreate}
          className="bg-rose-600 hover:bg-rose-500 text-white rounded-md"
          data-testid="new-user-button"
        >
          <Plus className="w-4 h-4 mr-1" strokeWidth={2} /> Nuevo
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 hover:bg-transparent">
                <TableHead className="overline text-slate-500">Nombre</TableHead>
                <TableHead className="overline text-slate-500">Email</TableHead>
                <TableHead className="overline text-slate-500">Rol</TableHead>
                <TableHead className="overline text-slate-500">Organización</TableHead>
                <TableHead className="overline text-slate-500 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isSelf = me?.id === u.id;
                const ROLE_LEVEL = { super_admin: 3, admin: 2, client: 1 };
                const canModify = !isSelf && (ROLE_LEVEL[me?.role] || 0) > (ROLE_LEVEL[u.role] || 0);
                return (
                <TableRow key={u.id} className="border-slate-100 hover:bg-slate-50" data-testid="user-row">
                  <TableCell className="font-heading font-semibold text-slate-900">
                    {u.name}
                    {isSelf && <span className="ml-2 text-[0.6rem] text-slate-400 font-mono-tactical">(TÚ)</span>}
                  </TableCell>
                  <TableCell className="text-slate-600 text-sm">{u.email}</TableCell>
                  <TableCell>
                    <Badge className={`rounded ${ROLE_STYLE[u.role]}`}>{u.role}</Badge>
                  </TableCell>
                  <TableCell className="text-slate-700 text-sm">{orgMap[u.organization_id] || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canModify}
                      title={isSelf ? "No puedes editarte a ti mismo" : !canModify ? "Sin permiso" : "Editar"}
                      onClick={() => canModify && openEdit(u)}
                      className="text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed"
                      data-testid="edit-user-button"
                    >
                      <Pencil className="w-4 h-4" strokeWidth={1.8} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canModify}
                      title={isSelf ? "No puedes eliminarte a ti mismo" : !canModify ? "Sin permiso" : "Eliminar"}
                      onClick={() => canModify && remove(u)}
                      className="text-slate-500 hover:text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      data-testid="delete-user-button"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })}
              {users.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-slate-400 py-8 text-center">Sin usuarios</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-white border-slate-200 rounded-lg max-w-lg" data-testid="user-form-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight text-slate-900">
              {editing ? "Editar usuario" : "Nuevo usuario"}
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              {editing ? "Actualizar información del usuario" : "Crear un nuevo usuario del sistema"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div>
              <Label className="overline block mb-1.5">Nombre</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="bg-white border-slate-200 rounded-md"
                data-testid="user-name-input"
              />
            </div>
            <div>
              <Label className="overline block mb-1.5">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                disabled={!!editing}
                className="bg-white border-slate-200 rounded-md"
                data-testid="user-email-input"
              />
            </div>
            <div>
              <Label className="overline block mb-1.5">
                {editing ? "Nueva clave (opcional)" : "Clave"}
              </Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editing}
                className="bg-white border-slate-200 rounded-md"
                data-testid="user-password-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="overline block mb-1.5">
                  Rol {editing && me?.id === editing.id && (
                    <span className="text-[0.55rem] text-amber-600 ml-1">(No puedes modificar tu propio rol)</span>
                  )}
                </Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm({ ...form, role: v })}
                  disabled={editing && me?.id === editing.id}
                >
                  <SelectTrigger className="bg-white border-slate-200 rounded-md" data-testid="user-role-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    <SelectItem value="client">Cliente</SelectItem>
                    {canCreateAdmin && <SelectItem value="admin">Admin</SelectItem>}
                    {canCreateAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="overline block mb-1.5">Organización</Label>
                <Select
                  value={form.organization_id}
                  onValueChange={(v) => setForm({ ...form, organization_id: v })}
                  disabled={me?.role !== "super_admin"}
                >
                  <SelectTrigger className="bg-white border-slate-200 rounded-md" data-testid="user-org-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200">
                    {orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="overline block mb-2">Permisos</Label>
              <div className="grid grid-cols-2 gap-2">
                {["view", "create", "edit", "delete"].map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm text-slate-700">
                    <Checkbox
                      checked={!!form.permissions[p]}
                      onCheckedChange={(c) =>
                        setForm({
                          ...form,
                          permissions: { ...form.permissions, [p]: !!c },
                        })
                      }
                      data-testid={`perm-${p}-checkbox`}
                    />
                    <span className="capitalize">{p}</span>
                  </label>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="rounded-md">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-rose-600 hover:bg-rose-500 text-white rounded-md"
                data-testid="user-save-button"
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

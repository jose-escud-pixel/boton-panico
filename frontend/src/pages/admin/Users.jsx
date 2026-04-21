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
import { Plus, Pencil, Trash2, Unlock, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useOrg } from "../../context/OrgContext";
import ChipFilter from "../../components/ChipFilter";

const ROLE_STYLE = {
  super_admin: "bg-rose-50 text-rose-700 border-rose-200",
  admin: "bg-amber-50 text-amber-700 border-amber-200",
  client: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function Users() {
  const { user: me } = useAuth();
  const { activeOrgId, isAll } = useOrg();
  const [users, setUsers] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm());
  const [saving, setSaving] = useState(false);
  const [chips, setChips] = useState([]);

  function initialForm() {
    return {
      id: null,
      email: "",
      username: "",
      first_name: "",
      last_name: "",
      phone: "",
      password: "",
      name: "",
      role: "client",
      organization_id: me?.organization_id || "",
      permissions: { create: false, edit: false, delete: false, view: true },
      status: "active",
      access_type: "permanent",
      access_start: "",
      access_end: "",
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
      username: u.username || "",
      first_name: u.first_name || "",
      last_name: u.last_name || "",
      phone: u.phone || "",
      password: "",
      name: u.name,
      role: u.role,
      organization_id: u.organization_id,
      permissions: u.permissions || { create: false, edit: false, delete: false, view: true },
      status: u.status || "active",
      access_type: u.access_type || "permanent",
      access_start: u.access_start || "",
      access_end: u.access_end || "",
    });
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Sanear fechas vacías
      const cleaned = { ...form };
      if (cleaned.access_type === "permanent") {
        cleaned.access_start = null;
        cleaned.access_end = null;
      } else {
        if (!cleaned.access_start) cleaned.access_start = null;
        if (!cleaned.access_end) cleaned.access_end = null;
      }
      // Username vacío → no se envía (o se envía null para editar y limpiar)
      if (!cleaned.username) {
        if (editing) cleaned.username = null;
        else delete cleaned.username;
      } else {
        cleaned.username = cleaned.username.trim().toLowerCase();
      }
      if (editing) {
        const { id, email, ...patch } = cleaned;
        if (!patch.password) delete patch.password;
        await api.put(`/users/${id}`, patch);
        toast.success("Usuario actualizado");
      } else {
        await api.post("/users", cleaned);
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

  const unbindDevice = async (u) => {
    if (!window.confirm(`Desvincular el dispositivo de ${u.name}? Podrá loguearse desde un celular nuevo.`)) return;
    try {
      await api.post(`/users/${u.id}/unbind-device`);
      toast.success("Dispositivo desvinculado");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    }
  };

  const orgMap = Object.fromEntries(orgs.map((o) => [o.id, o.name]));
  const canCreateAdmin = me?.role === "super_admin";

  // ---- Filtrado por chips + org activa ----
  const filteredUsers = users.filter((u) => {
    // Org activa (solo super_admin)
    if (me?.role === "super_admin" && activeOrgId && !isAll) {
      if (u.organization_id !== activeOrgId) return false;
    }
    for (const c of chips) {
      const v = c.value.toLowerCase();
      if (c.key === "role") {
        if (u.role !== v) return false;
      } else if (c.key === "status") {
        const s = u.status || "active";
        if (s !== v) return false;
      } else if (c.key === "access") {
        if ((u.access_type || "permanent") !== v) return false;
      } else if (c.key === "org") {
        const orgName = (orgMap[u.organization_id] || "").toLowerCase();
        if (!orgName.includes(v)) return false;
      } else if (c.key === "device") {
        // device:yes | device:no (si tiene o no device asociado)
        const has = !!(u.device_id);
        const want = v === "yes" || v === "sí" || v === "si";
        if (has !== want) return false;
      } else {
        // user: o texto libre → busca en name, email, username, phone, model, brand
        const haystack = [
          u.name, u.email, u.username, u.first_name, u.last_name,
          u.phone, u.device_brand, u.device_model, u.device_platform,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(v)) return false;
      }
    }
    return true;
  });

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

      <div className="mb-4">
        <ChipFilter
          chips={chips}
          onChange={setChips}
          placeholder="Buscar: role:client, status:active, access:custom, device:yes, teléfono, marca..."
          suggestions={{
            status: ["active", "disabled"],
          }}
        />
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 dark:border-slate-700 hover:bg-transparent">
                <TableHead className="overline text-slate-500 dark:text-slate-400">Nombre</TableHead>
                <TableHead className="overline text-slate-500 dark:text-slate-400">Contacto</TableHead>
                <TableHead className="overline text-slate-500 dark:text-slate-400">Rol</TableHead>
                <TableHead className="overline text-slate-500 dark:text-slate-400">Organización</TableHead>
                <TableHead className="overline text-slate-500 dark:text-slate-400">Dispositivo</TableHead>
                <TableHead className="overline text-slate-500 dark:text-slate-400 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((u) => {
                const isSelf = me?.id === u.id;
                const ROLE_LEVEL = { super_admin: 3, admin: 2, client: 1 };
                const canModify = !isSelf && (ROLE_LEVEL[me?.role] || 0) > (ROLE_LEVEL[u.role] || 0);
                const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.name;
                return (
                <TableRow key={u.id} className="border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid="user-row">
                  <TableCell className="font-heading font-semibold text-slate-900 dark:text-white">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {u.status === "disabled" && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.55rem] font-mono bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 uppercase tracking-wider">
                          desactivado
                        </span>
                      )}
                      {u.access_type && u.access_type !== "permanent" && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.55rem] font-mono bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 uppercase tracking-wider"
                              title={`${u.access_type}${u.access_start ? ` desde ${u.access_start}` : ""}${u.access_end ? ` hasta ${u.access_end}` : ""}`}>
                          {u.access_type}
                        </span>
                      )}
                      <span>{fullName}</span>
                      {u.username && (
                        <span className="text-[0.6rem] text-slate-500 dark:text-slate-400 font-mono">@{u.username}</span>
                      )}
                      {isSelf && <span className="text-[0.6rem] text-slate-400 dark:text-slate-500 font-mono-tactical">(TÚ)</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-300 text-xs">
                    <div className="truncate max-w-[180px]">{u.email}</div>
                    {u.phone && <div className="text-slate-500 font-mono mt-0.5">{u.phone}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge className={`rounded ${ROLE_STYLE[u.role]}`}>{u.role}</Badge>
                  </TableCell>
                  <TableCell className="text-slate-700 dark:text-slate-300 text-sm">{orgMap[u.organization_id] || "—"}</TableCell>
                  <TableCell className="text-xs">
                    {u.device_id ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-slate-700 dark:text-slate-200">
                          <Smartphone className="w-3 h-3 text-emerald-600" strokeWidth={2} />
                          <span className="font-semibold">{u.device_brand || "Desconocido"}</span>
                          <span className="text-slate-500">{u.device_model || ""}</span>
                        </div>
                        <div className="font-mono text-[0.6rem] text-slate-500 dark:text-slate-400">
                          {u.device_platform}{u.device_os_version ? ` ${u.device_os_version}` : ""}
                          {u.device_app_build ? ` · build ${u.device_app_build}` : ""}
                        </div>
                        <div className="font-mono text-[0.55rem] text-slate-400 truncate max-w-[180px]" title={u.device_id}>
                          id: {u.device_id?.slice(0, 16)}...
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[0.7rem] italic">Sin vincular</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {u.device_id && canModify && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => unbindDevice(u)}
                        className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                        title="Desvincular dispositivo"
                        data-testid="unbind-device-button"
                      >
                        <Unlock className="w-4 h-4" strokeWidth={1.8} />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canModify}
                      title={isSelf ? "No puedes editarte a ti mismo" : !canModify ? "Sin permiso" : "Editar"}
                      onClick={() => canModify && openEdit(u)}
                      className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
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
              {filteredUsers.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-slate-400 py-8 text-center">Sin usuarios con estos filtros</TableCell></TableRow>
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
              <Label className="overline block mb-1.5">Nombre (display)</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="bg-white border-slate-200 rounded-md"
                data-testid="user-name-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="overline block mb-1.5">Nombre</Label>
                <Input
                  value={form.first_name || ""}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  className="bg-white border-slate-200 rounded-md"
                  data-testid="user-first-name-input"
                />
              </div>
              <div>
                <Label className="overline block mb-1.5">Apellido</Label>
                <Input
                  value={form.last_name || ""}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  className="bg-white border-slate-200 rounded-md"
                  data-testid="user-last-name-input"
                />
              </div>
            </div>
            <div>
              <Label className="overline block mb-1.5">Teléfono</Label>
              <Input
                type="tel"
                value={form.phone || ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+595 9XX XXX XXX"
                className="bg-white border-slate-200 rounded-md"
                data-testid="user-phone-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
                  Usuario <span className="normal-case text-[0.6rem] text-slate-400">(opcional)</span>
                </Label>
                <Input
                  type="text"
                  value={form.username || ""}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="ej: jperez"
                  autoComplete="off"
                  className="bg-white border-slate-200 rounded-md"
                  data-testid="user-username-input"
                />
              </div>
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

            <div className="border-t border-slate-200 pt-3 mt-2">
              <Label className="overline block mb-2">Control de acceso</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-600 mb-1 block">Estado</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v })}
                  >
                    <SelectTrigger className="bg-white border-slate-200 rounded-md" data-testid="user-status-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200">
                      <SelectItem value="active">Activo</SelectItem>
                      <SelectItem value="disabled">Desactivado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-slate-600 mb-1 block">Tipo de acceso</Label>
                  <Select
                    value={form.access_type}
                    onValueChange={(v) => setForm({ ...form, access_type: v })}
                  >
                    <SelectTrigger className="bg-white border-slate-200 rounded-md" data-testid="user-access-type-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200">
                      <SelectItem value="permanent">Permanente</SelectItem>
                      <SelectItem value="annual">Anual</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.access_type !== "permanent" && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <Label className="text-xs text-slate-600 mb-1 block">Desde</Label>
                    <Input
                      type="date"
                      value={form.access_start || ""}
                      onChange={(e) => setForm({ ...form, access_start: e.target.value })}
                      className="bg-white border-slate-200 rounded-md"
                      data-testid="user-access-start-input"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-600 mb-1 block">Hasta</Label>
                    <Input
                      type="date"
                      value={form.access_end || ""}
                      onChange={(e) => setForm({ ...form, access_end: e.target.value })}
                      className="bg-white border-slate-200 rounded-md"
                      data-testid="user-access-end-input"
                    />
                  </div>
                </div>
              )}
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

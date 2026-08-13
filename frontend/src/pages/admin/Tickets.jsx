import React, { useEffect, useState, useCallback } from "react";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useSocket } from "../../context/SocketContext";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../../components/ui/dialog";
import {
  LifeBuoy, RefreshCw, Send, Clock, CheckCircle, XCircle,
  AlertCircle, ChevronRight, MessageSquare, User, Building2,
  Tag, ChevronDown, Plus,
} from "lucide-react";
import { Label } from "../../components/ui/label";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

// ── Constantes ─────────────────────────────────────────────────────────────────
const STATUSES = [
  { value: "open",       label: "Abierto",     icon: AlertCircle,  cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800" },
  { value: "in_process", label: "En proceso",  icon: Clock,        cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800" },
  { value: "resolved",   label: "Resuelto",    icon: CheckCircle,  cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800" },
  { value: "closed",     label: "Cerrado",     icon: XCircle,      cls: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700" },
];
const PRIORITIES = [
  { value: "low",    label: "Baja",    cls: "text-slate-500" },
  { value: "medium", label: "Media",   cls: "text-blue-600 dark:text-blue-400" },
  { value: "high",   label: "Alta",    cls: "text-orange-600 dark:text-orange-400" },
  { value: "urgent", label: "Urgente", cls: "text-rose-600 dark:text-rose-400" },
];
const CATEGORIES = [
  { value: "app",       label: "Aplicación" },
  { value: "account",   label: "Cuenta" },
  { value: "technical", label: "Técnico" },
  { value: "other",     label: "Otro" },
];

const statusMeta  = (v) => STATUSES.find(s => s.value === v) || STATUSES[0];
const priorityMeta = (v) => PRIORITIES.find(p => p.value === v) || PRIORITIES[1];
const categoryMeta = (v) => CATEGORIES.find(c => c.value === v) || CATEGORIES[3];

const fmtFecha = (iso) => {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es });
  } catch { return iso.slice(0, 10); }
};
const fmtFechaFull = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-PY", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso.slice(0, 16).replace("T", " "); }
};

// ── Badges ──────────────────────────────────────────────────────────────────
function StatusBadge({ value }) {
  const m = statusMeta(value);
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${m.cls}`}>
      <Icon className="w-3 h-3" />{m.label}
    </span>
  );
}
function PriorityBadge({ value }) {
  const m = priorityMeta(value);
  return <span className={`text-xs font-semibold ${m.cls}`}>{m.label}</span>;
}

// ── Componente principal ────────────────────────────────────────────────────
export default function Tickets() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [tickets, setTickets]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail]     = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending]   = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [newOpen, setNewOpen]   = useState(false);
  const [newForm, setNewForm]   = useState({ title: "", description: "", category: "other", priority: "medium" });
  const [creating, setCreating] = useState(false);

  // ── Fetch lista ──────────────────────────────────────────────────────────
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.append("status", filterStatus);
      const { data } = await api.get(`/tickets?${params}`);
      setTickets(data);
    } catch {
      if (!silent) toast.error("No se pudieron cargar los tickets");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load({ silent: true }), 30_000, !selected);

  // ── Socket.IO — actualización en tiempo real ─────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handler = () => load({ silent: true });
    socket.on("ticket:new",     handler);
    socket.on("ticket:updated", handler);
    return () => {
      socket.off("ticket:new",     handler);
      socket.off("ticket:updated", handler);
    };
  }, [socket, load]);

  // ── Abrir detalle ────────────────────────────────────────────────────────
  const openDetail = useCallback(async (ticket) => {
    setSelected(ticket);
    setDetail(null);
    setDetailLoading(true);
    setReplyText("");
    try {
      const { data } = await api.get(`/tickets/${ticket.id}`);
      setDetail(data);
    } catch {
      toast.error("No se pudo cargar el ticket");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ── Enviar respuesta ─────────────────────────────────────────────────────
  const sendReply = async () => {
    if (!replyText.trim() || !selected) return;
    setSending(true);
    try {
      await api.post(`/tickets/${selected.id}/messages`, { content: replyText.trim() });
      setReplyText("");
      const { data } = await api.get(`/tickets/${selected.id}`);
      setDetail(data);
      load({ silent: true });
      toast.success("Respuesta enviada");
    } catch {
      toast.error("No se pudo enviar la respuesta");
    } finally {
      setSending(false);
    }
  };

  // ── Crear ticket (admin) ─────────────────────────────────────────────────
  const createTicket = async () => {
    if (!newForm.title.trim() || !newForm.description.trim()) return;
    setCreating(true);
    try {
      await api.post("/tickets", {
        title: newForm.title.trim(),
        description: newForm.description.trim(),
        category: newForm.category,
        priority: newForm.priority,
      });
      toast.success("Ticket creado");
      setNewOpen(false);
      setNewForm({ title: "", description: "", category: "other", priority: "medium" });
      load();
    } catch {
      toast.error("No se pudo crear el ticket");
    } finally {
      setCreating(false);
    }
  };

  // ── Cambiar estado ───────────────────────────────────────────────────────
  const changeStatus = async (newStatus) => {
    if (!selected) return;
    setChangingStatus(true);
    try {
      const { data } = await api.patch(`/tickets/${selected.id}/status`, { status: newStatus });
      setDetail(data);
      setSelected({ ...selected, status: newStatus });
      setTickets(prev => prev.map(t => t.id === selected.id ? { ...t, status: newStatus } : t));
      toast.success("Estado actualizado");
    } catch {
      toast.error("No se pudo cambiar el estado");
    } finally {
      setChangingStatus(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="admin-tickets">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="overline mb-2 text-slate-500 dark:text-slate-400">Soporte</p>
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Tickets
          </h1>
        </div>
        <div className="flex gap-2 items-center">
          {/* Filtro por estado */}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {STATUSES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => setNewOpen(true)}
            className="rounded-md bg-rose-600 hover:bg-rose-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" strokeWidth={2} />
            Nuevo ticket
          </Button>
          <Button
            variant="outline"
            onClick={() => load()}
            disabled={loading}
            className="rounded-md dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            title="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} strokeWidth={1.8} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {loading && tickets.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-400 dark:text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Cargando tickets...
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
            <LifeBuoy className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">No hay tickets{filterStatus !== "all" ? " con este estado" : ""}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {tickets.map(ticket => {
              const sm = statusMeta(ticket.status);
              return (
                <button
                  key={ticket.id}
                  onClick={() => openDetail(ticket)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center gap-3 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <StatusBadge value={ticket.status} />
                      <PriorityBadge value={ticket.priority} />
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {categoryMeta(ticket.category).label}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {ticket.title}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />{ticket.user_name || "—"}
                      </span>
                      {ticket.organization_name && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />{ticket.organization_name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />{ticket.message_count ?? 0}
                      </span>
                      <span>{fmtFecha(ticket.updated_at || ticket.created_at)}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog crear ticket */}
      <Dialog open={newOpen} onOpenChange={(o) => { setNewOpen(o); if (!o) setNewForm({ title: "", description: "", category: "other", priority: "medium" }); }}>
        <DialogContent className="max-w-lg dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 dark:text-white">
              <Plus className="w-4 h-4 text-rose-500" strokeWidth={2} />
              Nuevo ticket
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="dark:text-slate-300">Título *</Label>
              <Input
                value={newForm.title}
                onChange={(e) => setNewForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Describe brevemente el problema..."
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="dark:text-slate-300">Descripción *</Label>
              <Textarea
                value={newForm.description}
                onChange={(e) => setNewForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Detalla el problema o consulta..."
                rows={4}
                className="resize-none dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="dark:text-slate-300">Categoría</Label>
                <Select value={newForm.category} onValueChange={(v) => setNewForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="dark:text-slate-300">Prioridad</Label>
                <Select value={newForm.priority} onValueChange={(v) => setNewForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setNewOpen(false)} className="dark:border-slate-700 dark:text-slate-300">
                Cancelar
              </Button>
              <Button
                onClick={createTicket}
                disabled={!newForm.title.trim() || !newForm.description.trim() || creating}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {creating ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" strokeWidth={1.8} />}
                Crear ticket
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog detalle */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setDetail(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 dark:text-white">
              <LifeBuoy className="w-4 h-4 text-rose-500" strokeWidth={1.8} />
              {selected?.title}
            </DialogTitle>
            {selected && (
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <StatusBadge value={selected.status} />
                <PriorityBadge value={selected.priority} />
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {categoryMeta(selected.category).label}
                </span>
              </div>
            )}
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando...
            </div>
          ) : detail && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Meta info */}
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                <span><strong className="text-slate-700 dark:text-slate-300">Usuario:</strong> {detail.user_name || "—"}</span>
                <span><strong className="text-slate-700 dark:text-slate-300">Org:</strong> {detail.organization_name || "—"}</span>
                <span><strong className="text-slate-700 dark:text-slate-300">Creado:</strong> {fmtFechaFull(detail.created_at)}</span>
                <span><strong className="text-slate-700 dark:text-slate-300">Actualizado:</strong> {fmtFechaFull(detail.updated_at)}</span>
              </div>

              {/* Descripción */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wide">Descripción</p>
                <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{detail.description}</p>
              </div>

              {/* Hilo de mensajes */}
              {detail.messages && detail.messages.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" /> Hilo ({detail.messages.length})
                  </p>
                  {detail.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-lg p-3 text-sm ${
                        m.is_admin_response
                          ? "bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 ml-4"
                          : "bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 mr-4"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <span className={`text-xs font-semibold ${m.is_admin_response ? "text-rose-700 dark:text-rose-300" : "text-slate-600 dark:text-slate-300"}`}>
                          {m.author_name || "Usuario"}{m.is_admin_response ? " · Admin" : ""}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">{fmtFechaFull(m.created_at)}</span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{m.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Acciones — responder y cambiar estado */}
          {detail && (
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-3">
              {/* Cambiar estado */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500 dark:text-slate-400">Estado:</span>
                {STATUSES.map(s => (
                  <button
                    key={s.value}
                    disabled={changingStatus || detail.status === s.value}
                    onClick={() => changeStatus(s.value)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      detail.status === s.value
                        ? s.cls + " opacity-100 font-semibold"
                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {/* Responder */}
              <div className="flex gap-2">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Escribe una respuesta..."
                  rows={2}
                  className="flex-1 text-sm resize-none dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendReply();
                  }}
                />
                <Button
                  onClick={sendReply}
                  disabled={!replyText.trim() || sending}
                  className="self-end bg-rose-600 hover:bg-rose-700 text-white rounded-md"
                >
                  {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" strokeWidth={1.8} />}
                </Button>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">Ctrl+Enter para enviar</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

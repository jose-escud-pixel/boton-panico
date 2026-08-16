import React, { useEffect, useState, useCallback, useRef } from "react";
import api, { API_BASE } from "../../lib/api";
import { useSocket } from "../../context/SocketContext";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../../components/ui/dialog";
import {
  Camera, RefreshCw, Plus, Pencil, Trash2, Copy, RotateCcw,
  Wifi, WifiOff, MapPin, Building2, AlertTriangle, Settings, Layers,
  Network, Server, HardDrive, Shield, ShieldOff, Activity, ChevronDown, ChevronUp,
  Zap, Clock, Eye, EyeOff, BellOff, Bell, Info, Search, X, Archive,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

// ── Constantes ──────────────────────────────────────────────────────────────
const DEVICE_TYPES = [
  { value: "nvr",          label: "NVR" },
  { value: "dvr",          label: "DVR" },
  { value: "ipcam",        label: "Cámara IP" },
  { value: "panel_alarma", label: "Panel de Alarma" },
];

const DEVICE_TYPE_META = {
  nvr:          { Icon: Server,  color: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-950/30" },
  dvr:          { Icon: HardDrive, color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-950/30" },
  ipcam:        { Icon: Camera,  color: "text-sky-500",    bg: "bg-sky-50 dark:bg-sky-950/30" },
  panel_alarma: { Icon: Shield,  color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-950/30" },
};

const EVENT_TYPES = [
  { value: "VMD",             label: "Movimiento (VMD)" },
  { value: "linedetection",   label: "Cruce de línea" },
  { value: "fielddetection",  label: "Intrusión en zona" },
  { value: "IO",              label: "Entrada digital / PIR" },
  { value: "videoloss",       label: "Pérdida de video" },
  { value: "tamperdetection", label: "Manipulación de cámara" },
];

const ALARM_PROTOCOLS = [
  { value: "http_webhook", label: "HTTP Webhook (ISAPI Event Notification)" },
  { value: "adm_cid",     label: "ADM-CID (Alarm Receiving Center — Hikvision legacy)" },
  { value: "sia_dcs",     label: "SIA DC-09 (Alarm Receiving Center — estándar recomendado)" },
];

const PROTOCOL_BADGE = {
  http_webhook: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
  adm_cid:      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  sia_dcs:      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
};

const WATCHDOG_OPTIONS = [
  { value: 0,   label: "Desactivado" },
  { value: 5,   label: "5 minutos" },
  { value: 15,  label: "15 minutos" },
  { value: 30,  label: "30 minutos" },
  { value: 60,  label: "1 hora" },
  { value: 120, label: "2 horas" },
];

const RETENTION_OPTIONS = [
  { value: 7,  label: "7 días" },
  { value: 15, label: "15 días" },
  { value: 30, label: "30 días (por defecto)" },
  { value: 60, label: "60 días" },
  { value: 90, label: "90 días" },
];

const ALARM_BRANDS = [
  { value: "hikvision_axpro", label: "Hikvision AX Pro" },
  { value: "ajax",            label: "Ajax Systems" },
  { value: "dsc",             label: "DSC (Johnson Controls)" },
  { value: "paradox",         label: "Paradox Security" },
  { value: "bosch",           label: "Bosch Security" },
  { value: "texecom",         label: "Texecom" },
  { value: "honeywell",       label: "Honeywell / Resideo" },
  { value: "napco",           label: "Napco Security" },
  { value: "generic",         label: "Genérico / Otro" },
];

const DEFAULT_EVENTS = ["VMD", "linedetection", "fielddetection", "IO"];

// Categorías Contact ID (numérico) para reglas de eventos
const EVENT_CATEGORIES_CID = [
  {
    prefix: "1",
    label: "Alarmas (E1xx)",
    description: "Incendio, intrusión, pánico, médico, robo",
    defaultSeverity: "alarm",
  },
  {
    prefix: "2",
    label: "Bypass / Supervisión (E2xx)",
    description: "Zonas desactivadas, supervisión de señal",
    defaultSeverity: "warning",
  },
  {
    prefix: "3",
    label: "Problemas / Trouble (E3xx)",
    description: "Batería baja, fallo AC, tamper, desconexión TCP/IP (E381)",
    defaultSeverity: "info",
  },
  {
    prefix: "4",
    label: "Apertura / Cierre (E4xx)",
    description: "Armado, desarmado, acceso de usuarios",
    defaultSeverity: "ignore",
  },
  {
    prefix: "6",
    label: "Test / Mantenimiento (E6xx)",
    description: "Prueba periódica, reset de sistema",
    defaultSeverity: "ignore",
  },
];

// Categorías SIA DC-09 (alfabético) — Hikvision AX Pro, Ajax, DSC...
// La primera letra del código SIA determina el default; prefijos configurables
const EVENT_CATEGORIES_SIA = [
  {
    prefix: "B",
    label: "Intrusión SIA (BA, BV, BD...)",
    description: "Zona disparada (BA=intrusión, BV=verificación, BD=apertura zona)",
    defaultSeverity: "alarm",
  },
  {
    prefix: "F",
    label: "Incendio SIA (FA, FT, FH...)",
    description: "Alarma de fuego y detectores de humo",
    defaultSeverity: "alarm",
  },
  {
    prefix: "M",
    label: "Médico SIA (MA, ME)",
    description: "Alarma médica y emergencia",
    defaultSeverity: "alarm",
  },
  {
    prefix: "P",
    label: "Pánico SIA (PA, PH, PB...)",
    description: "Botón de pánico, hold-up",
    defaultSeverity: "alarm",
  },
  {
    prefix: "A",
    label: "Energía SIA (AT, AR)",
    description: "AT=corte de energía, AR=restauración eléctrica",
    defaultSeverity: "info",
  },
  {
    prefix: "T",
    label: "Tamper SIA (TA, TR)",
    description: "TA=manipulación física del panel, TR=restaurado",
    defaultSeverity: "info",
  },
  {
    prefix: "Y",
    label: "Comunicación SIA (YX, YS, YR)",
    description: "YX=fallo de ruta, YS=pérdida señal, YR=restauración",
    defaultSeverity: "info",
  },
  {
    prefix: "C",
    label: "Armado SIA (CL, CS)",
    description: "CL=panel armado, CS=inicio de programación",
    defaultSeverity: "ignore",
  },
  {
    prefix: "O",
    label: "Desarmado SIA (OP, OS)",
    description: "OP=panel desarmado, OS=acceso de servicio técnico",
    defaultSeverity: "ignore",
  },
  {
    prefix: "R",
    label: "Test / Restore SIA (RP, RA...)",
    description: "RP=test periódico automático y restauraciones generales",
    defaultSeverity: "ignore",
  },
];

// Combinadas para uso interno (compatible con reglas guardadas por prefijo)
const EVENT_CATEGORIES = [...EVENT_CATEGORIES_CID, ...EVENT_CATEGORIES_SIA];

const SEVERITY_OPTIONS = [
  { value: "alarm",   label: "Alarma",       desc: "Crea alerta + push", color: "text-rose-600 dark:text-rose-400" },
  { value: "warning", label: "Advertencia",  desc: "Crea alerta sin push", color: "text-amber-600 dark:text-amber-400" },
  { value: "info",    label: "Informativo",  desc: "Feed en vivo, sin alerta", color: "text-blue-600 dark:text-blue-400" },
  { value: "ignore",  label: "Ignorar",      desc: "Descarta silenciosamente", color: "text-slate-500 dark:text-slate-400" },
];

const SEVERITY_BADGE = {
  alarm:   "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
  warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  info:    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  ignore:  "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

const EMPTY_FORM = {
  name: "",
  device_type: "ipcam",
  ip: "",
  channel: "",
  organization_id: "",
  event_types: DEFAULT_EVENTS,
  location: { lat: "", lng: "" },
  alarm_protocol: "http_webhook",
  alarm_brand: "generic",
  group_name: "",
  notes: "",
  watchdog_minutes: 0,
  watchdog_notify: true,
  event_retention_days: 30,
  areas: {},
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmtAgo = (iso) => {
  if (!iso) return null;
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es }); }
  catch { return iso.slice(0, 16).replace("T", " "); }
};

const isOnline = (device) => {
  // Usar last_seen_at como indicador principal.
  // - Con watchdog configurado: usar ese tiempo como ventana de offline.
  // - Sin watchdog (0): ventana de 2 horas. Paneles sin keepalive (D2APS, Contact ID)
  //   solo mandan señal en eventos reales; 10 min era demasiado agresivo.
  if (!device.last_seen_at) return null;
  const diff = Date.now() - new Date(device.last_seen_at).getTime();
  const windowMin = device.watchdog_minutes > 0 ? device.watchdog_minutes : 120;
  return diff < windowMin * 60 * 1000;
};

function webhookUrl(token) {
  try {
    const base = /^https?:\/\//i.test(API_BASE)
      ? new URL(API_BASE).origin
      : window.location.origin;
    return `${base}/api/hikvision/alarm/${token}`;
  } catch {
    return `/api/hikvision/alarm/${token}`;
  }
}

function serverHost() {
  try {
    if (/^https?:\/\//i.test(API_BASE)) return new URL(API_BASE).hostname;
    return window.location.hostname;
  } catch {
    return window.location.hostname;
  }
}

// Devuelve las reglas actuales del device como objeto { prefix → severity }
function deviceRulesMap(device) {
  const defaults = {};
  EVENT_CATEGORIES.forEach(c => { defaults[c.prefix] = c.defaultSeverity; });
  const overrides = {};
  (device.event_rules || []).forEach(r => { overrides[r.event_code_prefix] = r.severity; });
  return { ...defaults, ...overrides };
}

// ── Componente principal ────────────────────────────────────────────────────
export default function Devices() {
  const { socket } = useSocket();
  const [activeTab, setActiveTab]     = useState("devices");
  const [devices, setDevices]         = useState([]);
  const [orgs, setOrgs]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [sysConfig, setSysConfig]     = useState(null);
  const [formOpen, setFormOpen]       = useState(false);
  const [editing, setEditing]         = useState(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(null);
  const [togglingStatus, setToggling] = useState(null);
  const [filterGroup, setFilterGroup] = useState("all");
  const [expandedId, setExpandedId]   = useState(null);

  // Reglas de eventos
  const [rulesDevice, setRulesDevice] = useState(null);
  const [rulesForm, setRulesForm]     = useState({});
  const [savingRules, setSavingRules] = useState(false);

  // Áreas: inputs para agregar nueva entrada en el form
  const [newAreaId, setNewAreaId]     = useState("");
  const [newAreaName, setNewAreaName] = useState("");

  // Tab Eventos: sub-vista y datos
  const [eventsSubView, setEventsSubView]     = useState("live");   // "live" | "history" | "archived" | "state"
  const [historyEvents, setHistoryEvents]     = useState([]);
  const [historyTotal, setHistoryTotal]       = useState(0);
  const [historyPage, setHistoryPage]         = useState(1);
  const [historyDevice, setHistoryDevice]     = useState("all");    // device_id o "all"
  const [historyLoading, setHistoryLoading]   = useState(false);
  const [archiving, setArchiving]             = useState(false);
  const [deletingArchived, setDeletingArch]   = useState(false);
  const [panelState, setPanelState]           = useState(null);     // {zones, counts_24h}
  const [stateDevice, setStateDevice]         = useState(null);
  const [stateLoading, setStateLoading]       = useState(false);

  // Feed en vivo
  const [liveEvents, setLiveEvents]   = useState([]);
  const liveRef = useRef(null);
  // Ref para acceder al historyDevice actual desde dentro de closures de socket
  const historyDeviceRef = useRef("all");
  useEffect(() => { historyDeviceRef.current = historyDevice; }, [historyDevice]);

  // Buscadores en vivo e historial
  const [liveSearch, setLiveSearch]       = useState("");
  const [historySearch, setHistorySearch] = useState("");
  // Carga inicial del feed (para que no quede vacío si no llegan eventos por socket en esta sesión)
  const liveInitialLoadedRef = useRef(false);

  // Tick cada 30s → fuerza re-render para recalcular "hace X minutos" y badges online/offline
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get("/devices");
      setDevices(data);
    } catch {
      if (!silent) toast.error("No se pudieron cargar los dispositivos");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadOrgs = useCallback(async () => {
    try { const { data } = await api.get("/organizations"); setOrgs(data); } catch {}
  }, []);

  const loadSysConfig = useCallback(async () => {
    try {
      const { data } = await api.get("/system/alarm-config");
      setSysConfig(data);
    } catch {
      setSysConfig({ adm_cid_port: 5000, adm_cid_enabled: true, http_webhook_enabled: true });
    }
  }, []);

  useEffect(() => { load(); loadOrgs(); loadSysConfig(); }, [load, loadOrgs, loadSysConfig]);

  // Re-fetch silencioso de dispositivos al volver al tab (actualiza last_seen_at y tiempos)
  const prevTabRef = useRef(null);
  useEffect(() => {
    if (activeTab === "devices" && prevTabRef.current !== null && prevTabRef.current !== "devices") {
      load({ silent: true });
    }
    prevTabRef.current = activeTab;
  }, [activeTab, load]);

  // Socket.IO: feed en vivo + refresh silencioso
  useEffect(() => {
    if (!socket) return;
    const onAlertNew = () => load({ silent: true });
    const onDeviceEvent = (evt) => {
      setLiveEvents(prev => [evt, ...prev].slice(0, 200));
      setDevices(prev => prev.map(d =>
        d.id === evt.device_id
          ? { ...d, last_seen_at: evt.timestamp, last_event_at: evt.timestamp, last_event_type: evt.event_code }
          : d
      ));
      // Insertar en historial en tiempo real si el dispositivo seleccionado coincide
      if (evt.device_id === historyDeviceRef.current) {
        const histEvt = { ...evt, id: `live-${evt.timestamp}-${evt.event_code}` };
        setHistoryEvents(prev => [histEvt, ...prev]);
        setHistoryTotal(prev => prev + 1);
      }
    };
    const onArmState = (evt) => {
      setDevices(prev => prev.map(d =>
        d.id === evt.device_id
          ? { ...d, arm_state: evt.arm_state, arm_state_at: evt.timestamp }
          : d
      ));
    };
    const onTcpStatus = (evt) => {
      setDevices(prev => prev.map(d =>
        d.id === evt.device_id
          ? { ...d, tcp_connected: evt.tcp_connected }
          : d
      ));
    };
    // Actualiza last_seen_at en tiempo real para que el badge online/offline reaccione
    const onLastSeen = (evt) => {
      setDevices(prev => prev.map(d =>
        d.id === evt.device_id
          ? { ...d, last_seen_at: evt.last_seen_at }
          : d
      ));
    };
    socket.on("alert:new", onAlertNew);
    socket.on("device:event_received", onDeviceEvent);
    socket.on("device:arm_state_changed", onArmState);
    socket.on("device:tcp_status", onTcpStatus);
    socket.on("device:last_seen", onLastSeen);
    return () => {
      socket.off("alert:new", onAlertNew);
      socket.off("device:event_received", onDeviceEvent);
      socket.off("device:arm_state_changed", onArmState);
      socket.off("device:tcp_status", onTcpStatus);
      socket.off("device:last_seen", onLastSeen);
    };
  }, [socket, load]);

  // ── Acciones form ────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, event_types: [...DEFAULT_EVENTS] });
    setFormOpen(true);
  };

  const openEdit = (device) => {
    setEditing(device);
    setForm({
      name: device.name || "",
      device_type: device.device_type || "ipcam",
      ip: device.ip || "",
      channel: device.channel || "",
      organization_id: device.organization_id || "",
      event_types: device.event_types || [...DEFAULT_EVENTS],
      location: { lat: device.location?.lat ?? "", lng: device.location?.lng ?? "" },
      alarm_protocol: device.alarm_protocol || "http_webhook",
      alarm_brand: device.alarm_brand || "generic",
      group_name: device.group_name || "",
      notes: device.notes || "",
      watchdog_minutes: device.watchdog_minutes ?? 0,
      watchdog_notify: device.watchdog_notify ?? true,
      event_retention_days: device.event_retention_days ?? 30,
      areas: device.areas || {},
    });
    setFormOpen(true);
  };

  const closeForm = () => { setFormOpen(false); setEditing(null); setForm(EMPTY_FORM); };

  const toggleEvent = (value) => {
    setForm(prev => ({
      ...prev,
      event_types: prev.event_types.includes(value)
        ? prev.event_types.filter(e => e !== value)
        : [...prev.event_types, value],
    }));
  };

  const save = async () => {
    if (!form.name.trim() || !form.organization_id) {
      toast.error("Nombre y organización son requeridos");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        device_type: form.device_type,
        ip: form.ip.trim() || null,
        channel: form.channel.trim() || null,
        organization_id: form.organization_id,
        event_types: form.event_types,
        alarm_protocol: form.alarm_protocol,
        alarm_brand: form.alarm_brand,
        group_name: form.group_name.trim() || null,
        notes: form.notes.trim() || null,
        location: (form.location.lat !== "" && form.location.lng !== "")
          ? { lat: parseFloat(form.location.lat), lng: parseFloat(form.location.lng) }
          : null,
        watchdog_minutes: Number(form.watchdog_minutes ?? 0),
        watchdog_notify: form.watchdog_notify ?? true,
        event_retention_days: Number(form.event_retention_days ?? 30),
        areas: form.areas || {},
      };
      if (editing) {
        await api.patch(`/devices/${editing.id}`, payload);
        toast.success("Dispositivo actualizado");
      } else {
        await api.post("/devices", payload);
        toast.success("Dispositivo registrado");
      }
      closeForm();
      load();
    } catch (e) {
      const detail = e.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? (detail[0]?.msg || "Error de validación — verificá que el backend esté actualizado")
        : (typeof detail === "string" ? detail : "Error al guardar");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (device) => {
    if (!window.confirm(`¿Eliminar "${device.name}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(device.id);
    try {
      await api.delete(`/devices/${device.id}`);
      toast.success("Dispositivo eliminado");
      load();
    } catch {
      toast.error("No se pudo eliminar");
    } finally {
      setDeleting(null);
    }
  };

  const toggleStatus = async (device) => {
    const newStatus = device.status === "active" ? "inactive" : "active";
    setToggling(device.id);
    try {
      await api.patch(`/devices/${device.id}`, { status: newStatus });
      setDevices(prev => prev.map(d => d.id === device.id ? { ...d, status: newStatus } : d));
      toast.success(newStatus === "active" ? "Dispositivo activado" : "Dispositivo desactivado");
    } catch {
      toast.error("Error al cambiar estado");
    } finally {
      setToggling(null);
    }
  };

  const copyText = async (text, label = "Texto") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const regenerateToken = async (device) => {
    if (!window.confirm(`¿Regenerar el token de "${device.name}"? La URL anterior dejará de funcionar.`)) return;
    try {
      await api.post(`/devices/${device.id}/regenerate-token`);
      toast.success("Token regenerado");
      load();
    } catch {
      toast.error("No se pudo regenerar el token");
    }
  };

  // ── Reglas de eventos ────────────────────────────────────────────────────
  const openRules = (device) => {
    setRulesDevice(device);
    setRulesForm(deviceRulesMap(device));
  };

  const saveRules = async () => {
    setSavingRules(true);
    try {
      const event_rules = Object.entries(rulesForm).map(([prefix, severity]) => ({
        event_code_prefix: prefix,
        severity,
      }));
      await api.patch(`/devices/${rulesDevice.id}`, { event_rules });
      setDevices(prev => prev.map(d =>
        d.id === rulesDevice.id ? { ...d, event_rules } : d
      ));
      toast.success("Reglas guardadas");
      setRulesDevice(null);
    } catch {
      toast.error("Error al guardar reglas");
    } finally {
      setSavingRules(false);
    }
  };

  // ── Historial de eventos ─────────────────────────────────────────────────
  const loadHistory = useCallback(async (deviceId, page = 1, archived = false) => {
    setHistoryLoading(true);
    try {
      const url = deviceId === "all"
        ? null  // "all" no tiene endpoint global por ahora
        : `/devices/${deviceId}/events?page=${page}&limit=50&archived=${archived}`;
      if (!url) { setHistoryEvents([]); setHistoryTotal(0); return; }
      const { data } = await api.get(url);
      setHistoryEvents(data.events || []);
      setHistoryTotal(data.total || 0);
      setHistoryPage(page);
    } catch { toast.error("Error al cargar historial"); }
    finally { setHistoryLoading(false); }
  }, []);

  const archiveAll = async (deviceId) => {
    if (!deviceId || deviceId === "all") return;
    setArchiving(true);
    try {
      const { data } = await api.post(`/devices/${deviceId}/events/archive-all`);
      toast.success(`${data.archived} eventos archivados`);
      loadHistory(deviceId, 1, false);
    } catch { toast.error("Error al archivar"); }
    finally { setArchiving(false); }
  };

  const deleteArchived = async (deviceId) => {
    if (!deviceId || deviceId === "all") return;
    setDeletingArch(true);
    try {
      const { data } = await api.delete(`/devices/${deviceId}/events/archived`);
      toast.success(`${data.deleted} eventos eliminados`);
      loadHistory(deviceId, 1, true);
    } catch { toast.error("Error al eliminar archivados"); }
    finally { setDeletingArch(false); }
  };

  const loadPanelState = async (deviceId) => {
    setStateLoading(true);
    try {
      const { data } = await api.get(`/devices/${deviceId}/state`);
      setPanelState(data);
      setStateDevice(deviceId);
    } catch { toast.error("Error al cargar estado del panel"); }
    finally { setStateLoading(false); }
  };

  // Carga los últimos eventos de todos los paneles al abrir el tab por primera vez
  const loadInitialLiveEvents = useCallback(async (devList) => {
    const alarmDevices = (devList || devices).filter(d =>
      d.alarm_protocol === "adm_cid" || d.alarm_protocol === "sia_dcs"
    );
    if (alarmDevices.length === 0) return;
    try {
      const results = await Promise.allSettled(
        alarmDevices.map(d => api.get(`/devices/${d.id}/events?page=1&limit=30`))
      );
      const evts = results
        .filter(r => r.status === "fulfilled")
        .flatMap(r => r.value.data.events || []);
      evts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setLiveEvents(prev => {
        const prevIds = new Set(prev.map(e => e.id));
        const newEvts = evts.filter(e => !prevIds.has(e.id));
        return [...prev, ...newEvts]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 200);
      });
    } catch {}
  }, [devices]);

  useEffect(() => {
    if (activeTab === "events" && !liveInitialLoadedRef.current && devices.length > 0) {
      liveInitialLoadedRef.current = true;
      loadInitialLiveEvents();
    }
  }, [activeTab, devices.length, loadInitialLiveEvents]);

  const host = serverHost();
  const admCidPort = sysConfig?.adm_cid_port ?? 5000;

  // ── Helpers de render ────────────────────────────────────────────────────
  const OnlineBadge = ({ device }) => {
    const online = isOnline(device);
    if (online === null) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
          Sin datos
        </span>
      );
    }
    return online ? (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        En línea
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-[10px] text-rose-500 dark:text-rose-400 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        Desconectado
      </span>
    );
  };

  const ArmBadge = ({ device }) => {
    if (!device.arm_state) return (
      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
        — sin dato
      </span>
    );
    if (device.arm_state === "armed") return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded-full">
        <Shield className="w-2.5 h-2.5" strokeWidth={2} /> Armado
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded-full">
        <ShieldOff className="w-2.5 h-2.5" strokeWidth={2} /> Desarmado
      </span>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="admin-devices">

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="overline mb-2 text-slate-500 dark:text-slate-400">Seguridad</p>
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Dispositivos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Cámaras, NVRs y paneles de alarma conectados al sistema
          </p>
        </div>
        <div className="flex gap-2">
          {activeTab === "devices" && (
            <>
              <Button onClick={openCreate} className="rounded-md bg-rose-600 hover:bg-rose-700 text-white">
                <Plus className="w-4 h-4 mr-2" strokeWidth={2} /> Nuevo dispositivo
              </Button>
              <Button
                variant="outline"
                onClick={() => load()}
                disabled={loading}
                className="rounded-md dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} strokeWidth={1.8} />
                Actualizar
              </Button>
            </>
          )}
          {activeTab === "events" && eventsSubView === "live" && liveEvents.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setLiveEvents([])}
              className="rounded-md dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800 text-xs"
            >
              Limpiar feed
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-slate-100 dark:bg-slate-800/50 rounded-lg p-1 w-fit">
        {[
          { id: "devices", Icon: Layers,   label: "Dispositivos" },
          { id: "events",  Icon: Activity, label: "Eventos", badge: liveEvents.length > 0 ? liveEvents.length : null },
          { id: "config",  Icon: Settings, label: "Configuración" },
        ].map(({ id, Icon, label, badge }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === id
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <Icon className="w-4 h-4" strokeWidth={1.8} />
            {label}
            {badge && (
              <span className="ml-1 text-[10px] bg-rose-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB: DISPOSITIVOS ────────────────────────────────────────────── */}
      {activeTab === "devices" && (
        <>
          {/* Info banner */}
          <div className="mb-5 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-800 dark:text-blue-300">
            <strong>Protocolos:</strong>{" "}
            <span className="font-semibold">HTTP Webhook</span> (ISAPI — configurar URL en cámara/NVR){" "}
            · <span className="font-semibold">ADM-CID</span> (Alarm Receiving Center — TCP puerto {admCidPort}).{" "}
            Ver pestaña <em>Configuración</em> para parámetros del panel.
          </div>

          {/* Group filter pills */}
          {!loading && devices.length > 0 && (() => {
            const namedGroups = [...new Set(devices.map(d => d.group_name).filter(Boolean))].sort();
            const hasUngrouped = devices.some(d => !d.group_name);
            if (namedGroups.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setFilterGroup("all")}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    filterGroup === "all"
                      ? "bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent"
                      : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-400"
                  }`}
                >
                  Todos ({devices.length})
                </button>
                {namedGroups.map(g => (
                  <button key={g} onClick={() => setFilterGroup(g === filterGroup ? "all" : g)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      filterGroup === g
                        ? "bg-rose-600 text-white border-transparent"
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-rose-300"
                    }`}
                  >
                    {g} ({devices.filter(d => d.group_name === g).length})
                  </button>
                ))}
                {hasUngrouped && (
                  <button onClick={() => setFilterGroup(filterGroup === "__none__" ? "all" : "__none__")}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      filterGroup === "__none__"
                        ? "bg-slate-600 text-white border-transparent"
                        : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-400"
                    }`}
                  >
                    Sin grupo ({devices.filter(d => !d.group_name).length})
                  </button>
                )}
              </div>
            );
          })()}

          {/* Loading / empty */}
          {loading && devices.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-slate-400 dark:text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando...
            </div>
          ) : devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
              <Camera className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">No hay dispositivos registrados</p>
              <Button onClick={openCreate} variant="outline" className="mt-4 dark:border-slate-700 dark:text-slate-300">
                <Plus className="w-4 h-4 mr-2" /> Agregar el primero
              </Button>
            </div>
          ) : (() => {
            const filtered = filterGroup === "all"
              ? devices
              : filterGroup === "__none__"
                ? devices.filter(d => !d.group_name)
                : devices.filter(d => d.group_name === filterGroup);

            const namedGroups = [...new Set(filtered.map(d => d.group_name).filter(Boolean))].sort();
            const ungrouped   = filtered.filter(d => !d.group_name);
            const showGroups  = filterGroup === "all" && namedGroups.length > 0;

            const DeviceRow = ({ device }) => {
              const meta     = DEVICE_TYPE_META[device.device_type] || DEVICE_TYPE_META.ipcam;
              const { Icon } = meta;
              const isActive = device.status !== "inactive";
              const isAdmCid = device.alarm_protocol === "adm_cid" || device.alarm_protocol === "sia_dcs";
              const expanded = expandedId === device.id;
              const url      = webhookUrl(device.token);

              return (
                <>
                  {/* Main row */}
                  <div
                    className={`flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${!isActive ? "opacity-60" : ""}`}
                    onClick={() => setExpandedId(expanded ? null : device.id)}
                  >
                    {/* Icono tipo */}
                    <div className={`p-2 rounded-lg shrink-0 ${meta.bg}`}>
                      <Icon className={`w-4 h-4 ${meta.color}`} strokeWidth={1.8} />
                    </div>

                    {/* Nombre + org + grupo */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900 dark:text-white text-sm truncate">{device.name}</p>
                        {device.group_name && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full shrink-0">
                            {device.group_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {DEVICE_TYPES.find(t => t.value === device.device_type)?.label}
                          {device.ip && ` · ${device.ip}`}
                        </span>
                        {device.organization_name && (
                          <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1 truncate">
                            <Building2 className="w-3 h-3 shrink-0" />
                            {device.organization_name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Protocol badge */}
                    <div className="hidden sm:flex shrink-0">
                      <Badge className={`text-[10px] border ${PROTOCOL_BADGE[device.alarm_protocol] || PROTOCOL_BADGE.http_webhook}`}>
                        {device.alarm_protocol === "sia_dcs" ? "SIA-DCS"
                          : device.alarm_protocol === "adm_cid" ? "ADM-CID"
                          : "Webhook"}
                      </Badge>
                    </div>

                    {/* Online + Arm badge */}
                    <div className="hidden md:flex flex-col items-center gap-0.5 shrink-0 w-28">
                      <OnlineBadge device={device} />
                      {isAdmCid && <ArmBadge device={device} />}
                    </div>

                    {/* Último evento */}
                    <div className="hidden lg:block shrink-0 w-36 text-right">
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {device.last_event_at ? fmtAgo(device.last_event_at) : "—"}
                      </p>
                      {device.last_event_type && (
                        <p className="text-[10px] text-slate-300 dark:text-slate-600 font-mono">{device.last_event_type}</p>
                      )}
                    </div>

                    {/* Toggle status */}
                    <button
                      onClick={e => { e.stopPropagation(); toggleStatus(device); }}
                      disabled={togglingStatus === device.id}
                      title={isActive ? "Desactivar" : "Activar"}
                      className={`shrink-0 p-1.5 rounded-lg transition-colors ${
                        isActive
                          ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          : "text-slate-400 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      {togglingStatus === device.id
                        ? <RefreshCw className="w-4 h-4 animate-spin" />
                        : isActive ? <Eye className="w-4 h-4" strokeWidth={1.8} /> : <EyeOff className="w-4 h-4" strokeWidth={1.8} />
                      }
                    </button>

                    {/* Acciones */}
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => openEdit(device)}
                        title="Editar"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" strokeWidth={1.8} />
                      </button>
                      {isAdmCid && (
                        <button
                          onClick={() => openRules(device)}
                          title="Reglas de eventos"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
                        >
                          <Bell className="w-3.5 h-3.5" strokeWidth={1.8} />
                        </button>
                      )}
                      <button
                        onClick={() => remove(device)}
                        disabled={deleting === device.id}
                        title="Eliminar"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                      >
                        {deleting === device.id
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                        }
                      </button>
                      <span className="text-slate-200 dark:text-slate-700 ml-1">
                        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expanded && (
                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800">
                      <div className="grid gap-3 md:grid-cols-2">
                        {/* Conexión */}
                        {isAdmCid ? (
                          <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-lg p-3 space-y-1">
                            <p className="text-[10px] font-semibold text-violet-500 dark:text-violet-400 uppercase tracking-wide">
                              Account Code ({device.alarm_protocol === "sia_dcs" ? "SIA-DCS" : "ADM-CID"})
                            </p>
                            <div className="flex items-center gap-2">
                              <code className="text-xl font-mono font-bold text-violet-800 dark:text-violet-300 tracking-widest flex-1">
                                {device.alarm_account_code || "—"}
                              </code>
                              {device.alarm_account_code && (
                                <button onClick={() => copyText(device.alarm_account_code, "Account Code")}
                                  className="p-1 rounded hover:bg-violet-200 dark:hover:bg-violet-800 text-violet-400 hover:text-violet-700 dark:hover:text-violet-200 transition-colors">
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <p className="text-[10px] text-violet-500 dark:text-violet-400">
                              Servidor: {host} · Puerto: {admCidPort}
                            </p>
                            {device.alarm_brand && device.alarm_brand !== "generic" && (
                              <p className="text-[10px] text-violet-400 dark:text-violet-500">
                                {ALARM_BRANDS.find(b => b.value === device.alarm_brand)?.label}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 space-y-1">
                            <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">URL Webhook</p>
                            <div className="flex items-center gap-1.5">
                              <code className="text-[10px] text-slate-600 dark:text-slate-300 truncate flex-1 font-mono">{url}</code>
                              <button onClick={() => copyText(url, "URL")} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 transition-colors" title="Copiar URL">
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => regenerateToken(device)} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors" title="Regenerar token">
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Info extra */}
                        <div className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
                          {device.channel && (
                            <div className="flex items-center gap-1.5">
                              <Camera className="w-3 h-3 shrink-0" /> {device.channel}
                            </div>
                          )}
                          {device.location && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {device.location.lat.toFixed(5)}, {device.location.lng.toFixed(5)}
                            </div>
                          )}
                          {/* Online info */}
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span>Última señal: {device.last_seen_at ? fmtAgo(device.last_seen_at) : "Nunca"}</span>
                          </div>
                          {/* Estado armado/desarmado — solo paneles ADM-CID / SIA-DCS */}
                          {isAdmCid && (
                            <div className="flex items-center gap-1.5">
                              {device.arm_state === "armed"
                                ? <Shield className="w-3 h-3 shrink-0 text-emerald-500" />
                                : <ShieldOff className="w-3 h-3 shrink-0 text-amber-500" />
                              }
                              <span>
                                Estado:{" "}
                                <strong className={
                                  device.arm_state === "armed" ? "text-emerald-600 dark:text-emerald-400" :
                                  device.arm_state === "disarmed" ? "text-amber-600 dark:text-amber-400" :
                                  "text-slate-400"
                                }>
                                  {device.arm_state === "armed" ? "Armado"
                                    : device.arm_state === "disarmed" ? "Desarmado"
                                    : "Desconocido"}
                                </strong>
                                {device.arm_state && device.arm_state_at && ` · ${fmtAgo(device.arm_state_at)}`}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <Zap className="w-3 h-3 shrink-0" />
                            <span>Último evento: {device.last_event_at ? fmtAgo(device.last_event_at) : "Nunca"}
                              {device.last_event_type && ` (${device.last_event_type})`}
                            </span>
                          </div>
                          {/* Event types (HTTP) */}
                          {!isAdmCid && (device.event_types || []).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {device.event_types.map(ev => (
                                <span key={ev} className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                                  {ev}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Reglas resumen (ADM-CID) — solo CID numérico para no saturar */}
                          {isAdmCid && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {EVENT_CATEGORIES_CID.map(cat => {
                                const rmap = deviceRulesMap(device);
                                const sev = rmap[cat.prefix] || cat.defaultSeverity;
                                return (
                                  <Badge key={cat.prefix} className={`text-[9px] border ${SEVERITY_BADGE[sev]}`}>
                                    E{cat.prefix}xx: {sev}
                                  </Badge>
                                );
                              })}
                              {EVENT_CATEGORIES_SIA.slice(0, 4).map(cat => {
                                const rmap = deviceRulesMap(device);
                                const sev = rmap[cat.prefix] || cat.defaultSeverity;
                                return (
                                  <Badge key={cat.prefix} className={`text-[9px] border ${SEVERITY_BADGE[sev]}`}>
                                    {cat.prefix}x: {sev}
                                  </Badge>
                                );
                              })}
                              <button
                                onClick={() => openRules(device)}
                                className="text-[10px] text-violet-500 dark:text-violet-400 hover:underline ml-1"
                              >
                                Configurar reglas →
                              </button>
                            </div>
                          )}
                          {device.notes && (
                            <p className="text-[10px] italic text-slate-400 dark:text-slate-500 mt-1">{device.notes}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            };

            return (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                {/* Table header */}
                <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                  <div className="w-8" />
                  <div className="flex-1">Dispositivo</div>
                  <div className="hidden sm:block w-20 text-center">Protocolo</div>
                  <div className="hidden md:block w-24 text-center">Conexión</div>
                  <div className="hidden lg:block w-36 text-right">Último evento</div>
                  <div className="w-6" />
                  <div className="w-24 text-center">Acciones</div>
                </div>

                {/* Rows with optional group headers */}
                {showGroups ? (
                  <>
                    {namedGroups.map(g => {
                      const gDevices = filtered.filter(d => d.group_name === g);
                      if (gDevices.length === 0) return null;
                      return (
                        <React.Fragment key={g}>
                          <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                            <Layers className="w-3 h-3 text-slate-400 dark:text-slate-500" strokeWidth={1.8} />
                            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{g}</span>
                            <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full px-1.5">{gDevices.length}</span>
                          </div>
                          {gDevices.map(d => <DeviceRow key={d.id} device={d} />)}
                        </React.Fragment>
                      );
                    })}
                    {ungrouped.length > 0 && (
                      <React.Fragment>
                        <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Sin grupo</span>
                          <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full px-1.5">{ungrouped.length}</span>
                        </div>
                        {ungrouped.map(d => <DeviceRow key={d.id} device={d} />)}
                      </React.Fragment>
                    )}
                  </>
                ) : (
                  filtered.map(d => <DeviceRow key={d.id} device={d} />)
                )}
              </div>
            );
          })()}
        </>
      )}

      {/* ── TAB: EVENTOS ──────────────────────────────────────────────────── */}
      {activeTab === "events" && (() => {
        const admCidDevices = devices.filter(d => d.alarm_protocol === "adm_cid" || d.alarm_protocol === "sia_dcs");
        const EventRow = ({ evt, onArchive }) => {
          const isCL = evt.event_code === "CL";
          const isOP = evt.event_code === "OP";
          return (
          <div className={`flex items-start gap-3 px-4 py-3 border-l-2 group ${
            isCL ? "bg-red-50 dark:bg-red-950/25 border-red-400" :
            isOP ? "bg-green-50 dark:bg-green-950/25 border-green-400" :
            "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40"
          }`}>
            <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
              isCL ? "bg-red-500" :
              isOP ? "bg-green-500" :
              evt.severity === "alarm"   ? "bg-rose-500" :
              evt.severity === "warning" ? "bg-amber-500" :
              evt.severity === "info"    ? "bg-blue-500" :
              "bg-slate-300 dark:bg-slate-600"
            }`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide shrink-0">{evt.device_name}</span>
                <Badge className={`text-[9px] border ${SEVERITY_BADGE[evt.severity] || SEVERITY_BADGE.ignore}`}>
                  {SEVERITY_OPTIONS.find(s => s.value === evt.severity)?.label || evt.severity}
                </Badge>
                {evt.event_code && <code className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{evt.event_code}</code>}
                {evt.is_restore && <span className="text-[9px] text-emerald-600 dark:text-emerald-400">↩ Restore</span>}
              </div>
              <p className="text-sm font-medium text-slate-900 dark:text-white mt-0.5">{evt.event_label}</p>
              {evt.zone && evt.zone !== "000" && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500">Zona {parseInt(evt.zone, 10) || evt.zone}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onArchive && (
                <button
                  onClick={() => onArchive(evt)}
                  title="Archivar evento"
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
              )}
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono whitespace-nowrap text-right">
                {evt.timestamp ? new Date(evt.timestamp).toLocaleString("es-PY", {
                  day: "2-digit", month: "2-digit",
                  hour: "2-digit", minute: "2-digit",
                }) : ""}
              </span>
            </div>
          </div>
        );
        };

        return (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            {/* Sub-nav */}
            <div className="flex items-center gap-1 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              {[
                { id: "live",     label: "En vivo",   badge: liveEvents.length > 0 ? liveEvents.length : null },
                { id: "history",  label: "Historial"  },
                { id: "archived", label: "Archivados" },
                { id: "state",    label: "Estado del panel" },
              ].map(({ id, label, badge }) => (
                <button
                  key={id}
                  onClick={() => {
                    setEventsSubView(id);
                    if ((id === "history" || id === "archived") && historyDevice !== "all") {
                      loadHistory(historyDevice, 1, id === "archived");
                    }
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors relative ${
                    eventsSubView === id
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  {label}
                  {badge && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ─ En vivo ─ */}
            {eventsSubView === "live" && (() => {
              const filteredLive = liveSearch
                ? liveEvents.filter(e =>
                    [e.device_name, e.event_label, e.event_code].some(v =>
                      v?.toLowerCase().includes(liveSearch.toLowerCase())
                    )
                  )
                : liveEvents;

              const handleArchiveLive = async (evt) => {
                if (!evt.id || evt.id.startsWith("live-")) {
                  setLiveEvents(prev => prev.filter(e => e !== evt));
                  return;
                }
                try {
                  await api.patch(`/devices/${evt.device_id}/events/${evt.id}/archive`);
                  setLiveEvents(prev => prev.filter(e => e.id !== evt.id));
                } catch {
                  setLiveEvents(prev => prev.filter(e => e !== evt));
                }
              };

              return (
                <div>
                  {/* Buscador */}
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/20">
                    <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Buscar por dispositivo, evento, código..."
                      value={liveSearch}
                      onChange={e => setLiveSearch(e.target.value)}
                      className="flex-1 text-xs bg-transparent outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                    />
                    {liveSearch && (
                      <button onClick={() => setLiveSearch("")} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    {liveEvents.length > 0 && (
                      <span className="text-[10px] text-slate-400 shrink-0">{liveEvents.length} eventos</span>
                    )}
                  </div>

                  {filteredLive.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
                      <Activity className="w-10 h-10 mb-3 opacity-20" />
                      <p className="text-sm">{liveSearch ? "Sin resultados" : "Sin eventos aún"}</p>
                      <p className="text-xs mt-1 text-slate-300 dark:text-slate-600">
                        {liveSearch ? "Probá con otra búsqueda" : "Aparecerán aquí cuando el panel envíe señales"}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Headers */}
                      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/30">
                        <span className="w-2 shrink-0" />
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide flex-1">Dispositivo / Evento</span>
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide shrink-0">Fecha y hora</span>
                      </div>
                      <div ref={liveRef} className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[60vh] overflow-y-auto">
                        {filteredLive.map((evt, i) => (
                          <EventRow key={evt.id || i} evt={evt} onArchive={handleArchiveLive} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* ─ Historial / Archivados ─ */}
            {(eventsSubView === "history" || eventsSubView === "archived") && (
              <div>
                {/* Selector de dispositivo + acciones */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex-wrap">
                  <Select
                    value={historyDevice}
                    onValueChange={v => {
                      setHistoryDevice(v);
                      if (v !== "all") loadHistory(v, 1, eventsSubView === "archived");
                      else { setHistoryEvents([]); setHistoryTotal(0); }
                    }}
                  >
                    <SelectTrigger className="h-8 w-52 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                      <SelectValue placeholder="Seleccioná un panel..." />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                      {admCidDevices.map(d => (
                        <SelectItem key={d.id} value={d.id} className="dark:text-slate-200 dark:focus:bg-slate-700 text-xs">
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {historyDevice !== "all" && eventsSubView === "history" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => archiveAll(historyDevice)}
                      disabled={archiving}
                      className="text-xs h-8 dark:border-slate-700 dark:text-slate-300"
                    >
                      {archiving ? <RefreshCw className="w-3 h-3 animate-spin mr-1.5" /> : null}
                      Archivar todo
                    </Button>
                  )}
                  {historyDevice !== "all" && eventsSubView === "archived" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteArchived(historyDevice)}
                      disabled={deletingArchived}
                      className="text-xs h-8 text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/30"
                    >
                      {deletingArchived ? <RefreshCw className="w-3 h-3 animate-spin mr-1.5" /> : null}
                      Eliminar archivados
                    </Button>
                  )}
                  {historyTotal > 0 && (
                    <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{historyTotal} eventos</span>
                  )}
                </div>

                {/* Buscador historial */}
                {historyDevice !== "all" && (
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/20">
                    <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Buscar en esta página..."
                      value={historySearch}
                      onChange={e => setHistorySearch(e.target.value)}
                      className="flex-1 text-xs bg-transparent outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                    />
                    {historySearch && (
                      <button onClick={() => setHistorySearch("")} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                {historyDevice === "all" ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
                    <p className="text-sm">Seleccioná un panel para ver su historial</p>
                  </div>
                ) : historyLoading ? (
                  <div className="flex justify-center py-12">
                    <RefreshCw className="w-6 h-6 animate-spin text-violet-500" />
                  </div>
                ) : historyEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 text-slate-400 dark:text-slate-500">
                    <p className="text-sm">{eventsSubView === "archived" ? "Sin eventos archivados" : "Sin eventos en historial"}</p>
                  </div>
                ) : (
                  <>
                    {/* Headers historial */}
                    <div className="flex items-center gap-3 px-4 py-1.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/30">
                      <span className="w-2 shrink-0" />
                      <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide flex-1">Dispositivo / Evento</span>
                      <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide shrink-0">Fecha y hora</span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[55vh] overflow-y-auto">
                      {(historySearch
                        ? historyEvents.filter(e =>
                            [e.device_name, e.event_label, e.event_code].some(v =>
                              v?.toLowerCase().includes(historySearch.toLowerCase())
                            )
                          )
                        : historyEvents
                      ).map((evt) => <EventRow key={evt.id} evt={evt} />)}
                    </div>
                    {/* Paginación */}
                    {historyTotal > 50 && (
                      <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800">
                        <button
                          disabled={historyPage <= 1}
                          onClick={() => loadHistory(historyDevice, historyPage - 1, eventsSubView === "archived")}
                          className="text-xs text-slate-500 dark:text-slate-400 disabled:opacity-30 hover:text-slate-900 dark:hover:text-white"
                        >
                          ← Anterior
                        </button>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          Pág {historyPage} / {Math.ceil(historyTotal / 50)}
                        </span>
                        <button
                          disabled={historyPage >= Math.ceil(historyTotal / 50)}
                          onClick={() => loadHistory(historyDevice, historyPage + 1, eventsSubView === "archived")}
                          className="text-xs text-slate-500 dark:text-slate-400 disabled:opacity-30 hover:text-slate-900 dark:hover:text-white"
                        >
                          Siguiente →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ─ Estado del panel (reconstruido) ─ */}
            {eventsSubView === "state" && (
              <div>
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex-wrap">
                  <Select
                    value={stateDevice || ""}
                    onValueChange={v => { setStateDevice(v); setPanelState(null); }}
                  >
                    <SelectTrigger className="h-8 w-52 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                      <SelectValue placeholder="Seleccioná un panel..." />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                      {admCidDevices.map(d => (
                        <SelectItem key={d.id} value={d.id} className="dark:text-slate-200 dark:focus:bg-slate-700 text-xs">
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {stateDevice && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadPanelState(stateDevice)}
                      disabled={stateLoading}
                      className="text-xs h-8 dark:border-slate-700 dark:text-slate-300"
                    >
                      {stateLoading
                        ? <RefreshCw className="w-3 h-3 animate-spin mr-1.5" />
                        : <RefreshCw className="w-3 h-3 mr-1.5" />
                      }
                      {panelState ? "Actualizar estado" : "Ver estado"}
                    </Button>
                  )}
                </div>

                {!stateDevice ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
                    <p className="text-sm">Seleccioná un panel para ver su estado</p>
                  </div>
                ) : stateLoading ? (
                  <div className="flex justify-center py-12">
                    <RefreshCw className="w-6 h-6 animate-spin text-violet-500" />
                  </div>
                ) : panelState ? (
                  <div className="p-4 space-y-4">
                    {/* Contadores 24h */}
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { key: "alarm",   label: "Alarmas",       cls: "text-rose-600 dark:text-rose-400" },
                        { key: "warning", label: "Advertencias",  cls: "text-amber-600 dark:text-amber-400" },
                        { key: "info",    label: "Informativos",  cls: "text-blue-600 dark:text-blue-400" },
                        { key: "ignore",  label: "Ignorados",     cls: "text-slate-400" },
                      ].map(({ key, label, cls }) => (
                        <div key={key} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-center">
                          <p className={`text-xl font-bold ${cls}`}>{panelState.counts_24h?.[key] || 0}</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{label} (24h)</p>
                        </div>
                      ))}
                    </div>

                    {/* Zonas */}
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
                        Último evento por zona
                        <span className="ml-2 normal-case font-normal">· Estado reconstruido desde historial</span>
                      </p>
                      {panelState.zones.length === 0 ? (
                        <p className="text-xs text-slate-400 dark:text-slate-500 py-4 text-center">Sin datos de zonas aún</p>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                          {panelState.zones.map((z) => (
                            <div key={z.zone} className="flex items-center gap-3 px-3 py-2.5">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${
                                z.severity === "alarm"   ? "bg-rose-500" :
                                z.severity === "warning" ? "bg-amber-500" :
                                z.severity === "info"    ? "bg-blue-400" :
                                "bg-slate-300 dark:bg-slate-600"
                              }`} />
                              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 w-16 shrink-0">
                                Zona {z.zone === "---" ? "—" : parseInt(z.zone, 10) || z.zone}
                              </span>
                              <span className="text-xs text-slate-600 dark:text-slate-300 flex-1">{z.event_label}</span>
                              <code className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{z.event_code}</code>
                              {z.is_restore && <span className="text-[9px] text-emerald-600 dark:text-emerald-400">↩</span>}
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                                {z.timestamp ? new Date(z.timestamp).toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" }) : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Muestra el último evento recibido por cada zona. No es un query en tiempo real al panel — es el historial guardado.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
                    <p className="text-sm">Hacé clic en "Ver estado" para cargar</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── TAB: CONFIGURACIÓN ───────────────────────────────────────────── */}
      {activeTab === "config" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-lg bg-violet-50 dark:bg-violet-950/30">
              <Network className="w-5 h-5 text-violet-600 dark:text-violet-400" strokeWidth={1.8} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white text-sm">ADM-CID — Alarm Receiving Center</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">El panel de alarma se conecta al servidor vía TCP</p>
            </div>
            <Badge className="ml-auto bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-[10px]">
              Activo
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2 mb-5">
            {[
              { label: "Servidor", value: host, copyable: true },
              { label: "Puerto", value: admCidPort ? String(admCidPort) : "5000", copyable: true },
              { label: "Protocol Type", value: "ADM-CID", copyable: false },
              { label: "Transmission Mode", value: "TCP", copyable: false },
            ].map(({ label, value, copyable }) => (
              <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">{label}</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-slate-800 dark:text-slate-200 truncate flex-1">{value}</code>
                  {copyable && (
                    <button onClick={() => copyText(value, label)} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 transition-colors">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Instrucciones por marca */}
          {[
            {
              marca: "Hikvision AX Pro",
              pasos: [
                "Iniciar sesión en la interfaz web del AX Pro",
                "Ir a Configuración → Comunicación → Centro de Recepción de Alarmas",
                'Agregar un nuevo servidor: Protocol = "ADM-CID", Host/IP = servidor, Port = ' + admCidPort,
                `Account Code = el código de 4 dígitos asignado al panel en este sistema`,
                "Guardar y probar la conexión",
              ],
            },
            {
              marca: "Ajax Systems",
              pasos: [
                "Abrir Ajax App → Hub → Configuración → Monitoreo",
                `Agregar CMS: Protocol SIA DC-09 o Contact ID, IP = ${host}, Puerto = ${admCidPort}`,
                "Account ID = código del panel asignado en este sistema",
                "Activar las categorías de eventos a transmitir",
              ],
            },
          ].map(({ marca, pasos }) => (
            <details key={marca} className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-lg mb-3">
              <summary className="px-4 py-3 text-xs font-semibold text-violet-700 dark:text-violet-300 cursor-pointer flex items-center gap-2 select-none">
                <Shield className="w-3.5 h-3.5" strokeWidth={1.8} />
                Configuración {marca}
              </summary>
              <ol className="px-4 pb-4 text-xs text-violet-700 dark:text-violet-300 space-y-1.5 list-decimal list-inside">
                {pasos.map((p, i) => <li key={i}>{p}</li>)}
              </ol>
            </details>
          ))}
        </div>
      )}

      {/* ── FORM DIALOG ──────────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={open => { if (!open) closeForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="dark:text-white">
              {editing ? "Editar dispositivo" : "Nuevo dispositivo"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Nombre */}
            <div className="space-y-1.5">
              <Label className="dark:text-slate-300">Nombre *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="ej: Panel Piso 2 · NVR Entrada"
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
              />
            </div>

            {/* Tipo + Organización */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="dark:text-slate-300">Tipo *</Label>
                <Select value={form.device_type} onValueChange={v => setForm(p => ({ ...p, device_type: v }))}>
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {DEVICE_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value} className="dark:text-slate-200 dark:focus:bg-slate-700">
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="dark:text-slate-300">Organización *</Label>
                <Select value={form.organization_id} onValueChange={v => setForm(p => ({ ...p, organization_id: v }))}>
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {orgs.map(o => (
                      <SelectItem key={o.id} value={o.id} className="dark:text-slate-200 dark:focus:bg-slate-700">
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Protocolo */}
            <div className="space-y-1.5">
              <Label className="dark:text-slate-300">Protocolo de alarma</Label>
              <Select value={form.alarm_protocol} onValueChange={v => setForm(p => ({ ...p, alarm_protocol: v }))}>
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  {ALARM_PROTOCOLS.map(p => (
                    <SelectItem key={p.value} value={p.value} className="dark:text-slate-200 dark:focus:bg-slate-700">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Marca + Watchdog + Retención (solo ADM-CID / SIA-DCS) */}
            {(form.alarm_protocol === "adm_cid" || form.alarm_protocol === "sia_dcs") && (
              <>
                <div className="space-y-1.5">
                  <Label className="dark:text-slate-300">Marca del panel</Label>
                  <Select value={form.alarm_brand} onValueChange={v => setForm(p => ({ ...p, alarm_brand: v }))}>
                    <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                      {ALARM_BRANDS.map(b => (
                        <SelectItem key={b.value} value={b.value} className="dark:text-slate-200 dark:focus:bg-slate-700">
                          {b.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="dark:text-slate-300">Watchdog — sin señal en</Label>
                    <Select
                      value={String(form.watchdog_minutes ?? 0)}
                      onValueChange={v => setForm(p => ({ ...p, watchdog_minutes: Number(v) }))}
                    >
                      <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                        {WATCHDOG_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={String(o.value)} className="dark:text-slate-200 dark:focus:bg-slate-700">
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Toggle: solo marcar offline vs crear alerta */}
                    {(form.watchdog_minutes ?? 0) > 0 && (
                      <label className="flex items-center gap-2 cursor-pointer mt-1">
                        <input
                          type="checkbox"
                          checked={form.watchdog_notify ?? true}
                          onChange={e => setForm(p => ({ ...p, watchdog_notify: e.target.checked }))}
                          className="accent-rose-600 w-3.5 h-3.5"
                        />
                        <span className="text-xs text-slate-500 dark:text-slate-400">Crear alerta cuando sin señal</span>
                      </label>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="dark:text-slate-300">Retención de historial</Label>
                    <Select
                      value={String(form.event_retention_days ?? 30)}
                      onValueChange={v => setForm(p => ({ ...p, event_retention_days: Number(v) }))}
                    >
                      <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                        {RETENTION_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={String(o.value)} className="dark:text-slate-200 dark:focus:bg-slate-700">
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {/* IP + Canal (no para panel_alarma) */}
            {form.device_type !== "panel_alarma" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="dark:text-slate-300">IP (referencia)</Label>
                  <Input
                    value={form.ip}
                    onChange={e => setForm(p => ({ ...p, ip: e.target.value }))}
                    placeholder="192.168.1.100"
                    className="dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="dark:text-slate-300">Canal / Descripción</Label>
                  <Input
                    value={form.channel}
                    onChange={e => setForm(p => ({ ...p, channel: e.target.value }))}
                    placeholder="Canal 1 - Entrada"
                    className="dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>
              </div>
            )}

            {/* Ubicación */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="dark:text-slate-300">Latitud</Label>
                <Input
                  type="number" step="any"
                  value={form.location.lat}
                  onChange={e => setForm(p => ({ ...p, location: { ...p.location, lat: e.target.value } }))}
                  placeholder="-25.2867"
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="dark:text-slate-300">Longitud</Label>
                <Input
                  type="number" step="any"
                  value={form.location.lng}
                  onChange={e => setForm(p => ({ ...p, location: { ...p.location, lng: e.target.value } }))}
                  placeholder="-57.6470"
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            {/* Eventos HTTP Webhook */}
            {form.alarm_protocol === "http_webhook" && (
              <div className="space-y-1.5">
                <Label className="dark:text-slate-300">Tipos de evento (Webhook)</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {EVENT_TYPES.map(et => (
                    <label key={et.value} className="flex items-center gap-2 cursor-pointer p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <input
                        type="checkbox"
                        checked={form.event_types.includes(et.value)}
                        onChange={() => toggleEvent(et.value)}
                        className="rounded"
                      />
                      <span className="text-xs text-slate-700 dark:text-slate-300">{et.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Grupo */}
            <div className="space-y-1.5">
              <Label className="dark:text-slate-300">Grupo (opcional)</Label>
              <Input
                value={form.group_name}
                onChange={e => setForm(p => ({ ...p, group_name: e.target.value }))}
                placeholder="ej: Edificio A, Sucursal Norte, Piso 3"
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
              />
            </div>

            {/* Notas */}
            <div className="space-y-1.5">
              <Label className="dark:text-slate-300">Notas</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Notas internas (no visible para clientes)"
                rows={2}
                className="dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
              />
            </div>

            {/* Nombres de áreas (solo para paneles de alarma) */}
            {(form.alarm_protocol === "adm_cid" || form.alarm_protocol === "sia_dcs") && (
              <div className="space-y-2">
                <div>
                  <Label className="dark:text-slate-300">Nombres de áreas / particiones</Label>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    Asigná nombres a cada área del panel. Ej: "501" → "Oficina", "502" → "Depósito".
                    Si no configurás un área, se muestra el nombre que envía el panel.
                  </p>
                </div>
                {/* Lista de áreas configuradas */}
                {Object.entries(form.areas || {}).length > 0 && (
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    {Object.entries(form.areas || {}).map(([id, name], i, arr) => (
                      <div
                        key={id}
                        className={`flex items-center gap-2 px-3 py-2 ${i < arr.length - 1 ? "border-b border-slate-100 dark:border-slate-800" : ""}`}
                      >
                        <code className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 w-16 text-center shrink-0">{id}</code>
                        <span className="text-xs text-slate-400 dark:text-slate-500">→</span>
                        <span className="text-sm text-slate-800 dark:text-slate-200 flex-1">{name}</span>
                        <button
                          type="button"
                          onClick={() => setForm(p => {
                            const next = { ...(p.areas || {}) };
                            delete next[id];
                            return { ...p, areas: next };
                          })}
                          className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Agregar nueva área */}
                <div className="flex items-center gap-2">
                  <Input
                    value={newAreaId}
                    onChange={e => setNewAreaId(e.target.value.replace(/\D/g, ""))}
                    placeholder="ID (ej: 501)"
                    className="w-24 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
                  />
                  <span className="text-slate-400 dark:text-slate-500 text-sm shrink-0">→</span>
                  <Input
                    value={newAreaName}
                    onChange={e => setNewAreaName(e.target.value)}
                    placeholder="Nombre (ej: Oficina principal)"
                    className="flex-1 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
                    onKeyDown={e => {
                      if (e.key === "Enter" && newAreaId && newAreaName.trim()) {
                        e.preventDefault();
                        setForm(p => ({ ...p, areas: { ...(p.areas || {}), [newAreaId]: newAreaName.trim() } }));
                        setNewAreaId(""); setNewAreaName("");
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!newAreaId || !newAreaName.trim()}
                    onClick={() => {
                      setForm(p => ({ ...p, areas: { ...(p.areas || {}), [newAreaId]: newAreaName.trim() } }));
                      setNewAreaId(""); setNewAreaName("");
                    }}
                    className="text-xs h-9 shrink-0 dark:border-slate-700 dark:text-slate-300"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
                  </Button>
                </div>
              </div>
            )}

            {/* Botones */}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={closeForm} className="flex-1 dark:border-slate-700 dark:text-slate-300">
                Cancelar
              </Button>
              <Button onClick={save} disabled={saving} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                {editing ? "Guardar cambios" : "Registrar dispositivo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── REGLAS DE EVENTOS DIALOG ─────────────────────────────────────── */}
      <Dialog open={!!rulesDevice} onOpenChange={open => { if (!open) setRulesDevice(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto dark:bg-slate-900 dark:border-slate-800">
          <DialogHeader>
            <DialogTitle className="dark:text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-violet-500" strokeWidth={1.8} />
              Reglas de eventos — {rulesDevice?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Define qué hacer con cada categoría de eventos Contact ID / SIA DC-09 recibidos desde este panel.
              Los prefijos más específicos tienen prioridad.
            </p>

            {/* Contact ID numérico */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">
                Contact ID (códigos numéricos)
              </p>
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <div className="grid grid-cols-[1fr_160px] text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  <span>Categoría</span>
                  <span className="text-center">Acción</span>
                </div>
                {EVENT_CATEGORIES_CID.map((cat, i) => (
                  <div
                    key={cat.prefix}
                    className={`grid grid-cols-[1fr_160px] items-center px-3 py-2.5 gap-3 ${
                      i < EVENT_CATEGORIES_CID.length - 1 ? "border-b border-slate-100 dark:border-slate-800" : ""
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{cat.label}</p>
                      {cat.description && (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{cat.description}</p>
                      )}
                    </div>
                    <Select
                      value={rulesForm[cat.prefix] || cat.defaultSeverity}
                      onValueChange={v => setRulesForm(p => ({ ...p, [cat.prefix]: v }))}
                    >
                      <SelectTrigger className="h-8 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                        {SEVERITY_OPTIONS.map(s => (
                          <SelectItem key={s.value} value={s.value} className="dark:text-slate-200 dark:focus:bg-slate-700">
                            <span className={s.color}>{s.label}</span>
                            <span className="text-slate-400 dark:text-slate-500 text-[10px] ml-2">{s.desc}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* SIA DC-09 alfabético */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">
                SIA DC-09 (códigos alphabéticos — Hikvision AX Pro, Ajax…)
              </p>
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <div className="grid grid-cols-[1fr_160px] text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  <span>Categoría</span>
                  <span className="text-center">Acción</span>
                </div>
                {EVENT_CATEGORIES_SIA.map((cat, i) => (
                  <div
                    key={cat.prefix}
                    className={`grid grid-cols-[1fr_160px] items-center px-3 py-2.5 gap-3 ${
                      i < EVENT_CATEGORIES_SIA.length - 1 ? "border-b border-slate-100 dark:border-slate-800" : ""
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{cat.label}</p>
                      {cat.description && (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{cat.description}</p>
                      )}
                    </div>
                    <Select
                      value={rulesForm[cat.prefix] || cat.defaultSeverity}
                      onValueChange={v => setRulesForm(p => ({ ...p, [cat.prefix]: v }))}
                    >
                      <SelectTrigger className="h-8 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                        {SEVERITY_OPTIONS.map(s => (
                          <SelectItem key={s.value} value={s.value} className="dark:text-slate-200 dark:focus:bg-slate-700">
                            <span className={s.color}>{s.label}</span>
                            <span className="text-slate-400 dark:text-slate-500 text-[10px] ml-2">{s.desc}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* Resumen visual */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Vista previa</p>
              <div className="flex flex-wrap gap-1.5">
                {EVENT_CATEGORIES_CID.map(cat => {
                  const sev = rulesForm[cat.prefix] || cat.defaultSeverity;
                  return (
                    <Badge key={cat.prefix} className={`text-[9px] border ${SEVERITY_BADGE[sev]}`}>
                      E{cat.prefix}xx → {sev}
                    </Badge>
                  );
                })}
                {EVENT_CATEGORIES_SIA.map(cat => {
                  const sev = rulesForm[cat.prefix] || cat.defaultSeverity;
                  return (
                    <Badge key={cat.prefix} className={`text-[9px] border ${SEVERITY_BADGE[sev]}`}>
                      {cat.prefix}x → {sev}
                    </Badge>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 flex items-start gap-1">
                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                Ej: AT (corte energía) = categoría A → "Informativo". BA (intrusión) = categoría B → "Alarma".
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setRulesDevice(null)} className="flex-1 dark:border-slate-700 dark:text-slate-300">
                Cancelar
              </Button>
              <Button onClick={saveRules} disabled={savingRules} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white">
                {savingRules ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Bell className="w-4 h-4 mr-2" strokeWidth={1.8} />}
                Guardar reglas
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

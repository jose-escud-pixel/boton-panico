import React, { useEffect, useState, useCallback } from "react";
import api from "../../lib/api";
import { useSocket } from "../../context/SocketContext";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "../../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../../components/ui/select";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import {
  MapPin, Image as ImageIcon, Volume2, Clock,
  Siren, Flame, HeartPulse, Wrench, AlertTriangle, Archive, Trash2, Copy, PhoneCall,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../context/AuthContext";
import { useOrg } from "../../context/OrgContext";
import ChipFilter from "../../components/ChipFilter";
import { downloadAlertsCsv } from "../../lib/exportAlertsCsv";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const STATUS_STYLE = {
  pending: "bg-rose-50 text-rose-700 border-rose-200",
  in_process: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
const STATUS_LABEL = {
  pending: "PENDIENTE",
  in_process: "EN PROCESO",
  completed: "COMPLETADA",
};

const TYPE_CFG = {
  panic:   { label: "PÁNICO",     Icon: Siren,      bg: "bg-rose-50 text-rose-700 border-rose-200" },
  fire:    { label: "INCENDIO",   Icon: Flame,      bg: "bg-orange-50 text-orange-700 border-orange-200" },
  medical: { label: "ASISTENCIA", Icon: HeartPulse, bg: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  on_way:  { label: "UTILIDADES", Icon: Wrench,     bg: "bg-sky-50 text-sky-700 border-sky-200" },
  here:    { label: "ESTOY AQUÍ", Icon: MapPin,     bg: "bg-violet-50 text-violet-700 border-violet-200" },
  silent:  { label: "SILENCIOSA", Icon: Siren,      bg: "bg-rose-50 text-rose-700 border-rose-200" },
  normal:  { label: "NORMAL",     Icon: AlertTriangle, bg: "bg-amber-50 text-amber-700 border-amber-200" },
};

function FlyTo({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 15);
  }, [center, map]);
  return null;
}

export default function Alerts() {
  const { user } = useAuth();
  const { activeOrgId, isAll } = useOrg();
  const [alerts, setAlerts] = useState([]);
  const [chips, setChips] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const { socket } = useSocket();

  const copyText = useCallback(async (value, label = "Copiado") => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      toast.success(label);
    } catch {
      toast.error("No se pudo copiar");
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Extrae valores de chips para query y filtrado cliente
      const statusChip = chips.find((c) => c.key === "status");
      const typeChip = chips.find((c) => c.key === "type");
      const userChips = chips.filter((c) => c.key === "user" || c.key === "text");
      const orgChips = chips.filter((c) => c.key === "org");

      const params = new URLSearchParams();
      if (statusChip) params.append("status", statusChip.value);
      if (typeChip) params.append("type", typeChip.value);
      if (showArchived) params.append("archived", "true");
      // super_admin con org específica → filtra; "all" → no filtra
      if (user?.role === "super_admin" && activeOrgId && !isAll) {
        params.append("organization_id", activeOrgId);
      }
      const { data } = await api.get(`/alerts?${params.toString()}`);
      let filtered = data;
      if (userChips.length > 0) {
        filtered = filtered.filter((a) =>
          userChips.every((c) => {
            const q = c.value.toLowerCase();
            return (
              (a.user_name && a.user_name.toLowerCase().includes(q)) ||
              (a.user_email && a.user_email.toLowerCase().includes(q))
            );
          })
        );
      }
      if (orgChips.length > 0) {
        filtered = filtered.filter((a) =>
          orgChips.every((c) => {
            const q = c.value.toLowerCase();
            return a.organization_name && a.organization_name.toLowerCase().includes(q);
          })
        );
      }
      setAlerts(filtered);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [chips, showArchived, activeOrgId, isAll, user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return;
    const newHandler = () => {
      // El audio global lo maneja AlertAudioContext
      load();
    };
    const updateHandler = () => load();
    const archivedHandler = () => load();
    socket.on("alert:new", newHandler);
    socket.on("alert:updated", updateHandler);
    socket.on("alerts:archived", archivedHandler);
    return () => {
      socket.off("alert:new", newHandler);
      socket.off("alert:updated", updateHandler);
      socket.off("alerts:archived", archivedHandler);
    };
  }, [socket, load]);

  const exportVisibleToCsv = () => {
    if (!alerts.length) {
      toast.error("No hay alertas para exportar");
      return;
    }
    const stamp = format(new Date(), "yyyy-MM-dd_HHmm");
    downloadAlertsCsv(alerts, `nacurutu-alertas_${stamp}.csv`);
    toast.success(`CSV descargado (${alerts.length} filas)`);
  };

  const archiveCompleted = async () => {
    setArchiving(true);
    try {
      const { data } = await api.post("/alerts/archive?only_completed=true");
      toast.success(`${data.archived_count} alerta(s) archivada(s)`);
      setConfirmArchive(false);
      load();
    } catch {
      toast.error("No se pudieron archivar");
    } finally {
      setArchiving(false);
    }
  };

  const changeStatus = async (status) => {
    if (!selected) return;
    try {
      const { data } = await api.patch(`/alerts/${selected.id}/status`, { status });
      setSelected(data);
      // Feedback inmediato local para que la sirena se corte sin esperar socket/poll.
      window.dispatchEvent(
        new CustomEvent("nacurutu:alert-status-changed", {
          detail: { id: selected.id, status },
        })
      );
      toast.success(`Estado actualizado a ${STATUS_LABEL[status]}`);
      load();
    } catch {
      toast.error("No se pudo actualizar");
    }
  };

  const center =
    selected?.location?.coordinates && selected.location.coordinates.length === 2
      ? [selected.location.coordinates[1], selected.location.coordinates[0]]
      : null;

  // En el mapa principal mostramos solo pendientes para evitar ruido histórico.
  const mapMarkers = alerts.filter(
    (a) => a.status === "pending" && a.location?.coordinates && a.location.coordinates.length === 2
  );

  const firstMarker = mapMarkers[0];
  const defaultCenter = firstMarker
    ? [firstMarker.location.coordinates[1], firstMarker.location.coordinates[0]]
    : [-25.2637, -57.5759];

  const lightTile = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="admin-alerts">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="overline mb-2 text-slate-500 dark:text-slate-400">Gestión</p>
          <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            {showArchived ? "Historial de alertas" : "Alertas"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {(user?.role === "super_admin" || user?.role === "admin") && (
            <Button
              variant="outline"
              onClick={exportVisibleToCsv}
              className="rounded-md dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
              data-testid="export-alerts-csv"
            >
              <FileDown className="w-4 h-4 mr-2" strokeWidth={1.8} />
              Exportar CSV
            </Button>
          )}
          <Button
            variant={showArchived ? "default" : "outline"}
            onClick={() => setShowArchived((v) => !v)}
            className="rounded-md"
            data-testid="toggle-archived-button"
          >
            <Archive className="w-4 h-4 mr-2" strokeWidth={1.8} />
            {showArchived ? "Ver activas" : "Ver archivadas"}
          </Button>
          {!showArchived && (user?.role === "super_admin" || user?.role === "admin") && (
            <Button
              variant="outline"
              onClick={() => setConfirmArchive(true)}
              className="rounded-md border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300"
              data-testid="archive-completed-button"
            >
              <Trash2 className="w-4 h-4 mr-2" strokeWidth={1.8} />
              Archivar completadas
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4">
        <ChipFilter
          chips={chips}
          onChange={setChips}
          suggestions={{
            status: ["pending", "in_process", "completed"],
            type: ["panic", "fire", "medical", "on_way", "here"],
          }}
        />
      </div>

      {/* Map */}
      <div className="bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-600 rounded-xl overflow-hidden mb-6 shadow-sm" data-testid="alerts-map">
        <div style={{ height: "288px" }}>
          <MapContainer
            key={`main-map-${defaultCenter[0]}-${defaultCenter[1]}`}
            center={defaultCenter}
            zoom={mapMarkers.length ? 12 : 5}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
          >
            <TileLayer url={lightTile} attribution="&copy; OpenStreetMap &copy; CARTO" />
            {center && <FlyTo center={center} />}
            {mapMarkers.map((a) => {
              const pos = [a.location.coordinates[1], a.location.coordinates[0]];
              return (
                <Marker key={a.id} position={pos} eventHandlers={{ click: () => setSelected(a) }}>
                  <Popup>
                    <div className="text-xs">
                      <div className="font-bold">{a.user_name}</div>
                      <div className="text-slate-500">{TYPE_CFG[a.type]?.label || a.type}</div>
                      <div className="text-slate-400 mt-1">
                        {format(new Date(a.timestamp), "PPp", { locale: es })}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 dark:border-slate-700 hover:bg-transparent">
                <TableHead className="overline text-slate-500 dark:text-slate-400">Usuario</TableHead>
                <TableHead className="overline text-slate-500 dark:text-slate-400">Organización</TableHead>
                <TableHead className="overline text-slate-500 dark:text-slate-400">Tipo</TableHead>
                <TableHead className="overline text-slate-500 dark:text-slate-400">Estado</TableHead>
                <TableHead className="overline text-slate-500 dark:text-slate-400">Hora</TableHead>
                <TableHead className="overline text-slate-500 dark:text-slate-400">Teléfono</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={6} className="text-slate-400 dark:text-slate-500 py-6">Cargando...</TableCell></TableRow>
              )}
              {!loading && alerts.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-slate-400 dark:text-slate-500 py-8 text-center">Sin alertas</TableCell></TableRow>
              )}
              {alerts.map((a) => {
                const cfg = TYPE_CFG[a.type] || { label: a.type?.toUpperCase() || "?", bg: "" };
                return (
                  <TableRow
                    key={a.id}
                    className="border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80 cursor-pointer"
                    onClick={() => setSelected(a)}
                    data-testid="alert-row"
                  >
                    <TableCell>
                      <div className="font-heading font-semibold text-slate-900 dark:text-white">{a.user_name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{a.user_email}</div>
                    </TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-200 text-sm">{a.organization_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`rounded ${cfg.bg}`}>
                        {cfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`rounded ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400 text-xs font-mono-tactical">
                      {formatDistanceToNow(new Date(a.timestamp), { addSuffix: true, locale: es })}
                    </TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-200 text-sm font-mono-tactical">
                      {a.user_phone ? (
                        <div className="flex items-center gap-1.5">
                          <a
                            href={`tel:${String(a.user_phone).replace(/\s+/g, "")}`}
                            className="hover:underline text-slate-700"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {a.user_phone}
                          </a>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyText(a.user_phone, "Teléfono copiado");
                            }}
                            className="text-slate-400 hover:text-slate-700"
                            title="Copiar teléfono"
                          >
                            <Copy className="w-3.5 h-3.5" strokeWidth={2} />
                          </button>
                        </div>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Detail Dialog — fix: contenedor con altura FIJA en px para el mapa */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent
          className="bg-white border-2 border-slate-300 max-w-2xl rounded-lg overflow-hidden shadow-lg"
          data-testid="alert-detail-dialog"
        >
          {selected && (() => {
            const cfg = TYPE_CFG[selected.type] || { label: selected.type, Icon: AlertTriangle, bg: "" };
            const Icon = cfg.Icon;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-heading tracking-tight flex items-center gap-2 text-slate-900">
                    <Icon className="w-5 h-5 text-rose-600" strokeWidth={1.8} />
                    Alerta de {selected.user_name}
                    <Badge variant="outline" className={`rounded ${cfg.bg}`}>
                      {cfg.label}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-slate-500 font-mono-tactical text-xs">
                    {format(new Date(selected.timestamp), "PPPp", { locale: es })}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                  {selected.user_phone && (
                    <div>
                      <p className="overline mb-1">Teléfono</p>
                      <div className="flex items-center gap-2">
                        <a
                          href={`tel:${String(selected.user_phone).replace(/\s+/g, "")}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-sm font-mono-tactical shadow-sm"
                        >
                          <PhoneCall className="w-3.5 h-3.5" strokeWidth={2} />
                          {selected.user_phone}
                        </a>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-md border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          onClick={() => copyText(selected.user_phone, "Teléfono copiado")}
                        >
                          <Copy className="w-3.5 h-3.5 mr-1" strokeWidth={2} />
                          Copiar
                        </Button>
                      </div>
                    </div>
                  )}

                  {selected.message && (
                    <div>
                      <p className="overline mb-1">Mensaje</p>
                      <p className="text-slate-800 bg-slate-50 border border-slate-200 rounded p-3">
                        {selected.message}
                      </p>
                    </div>
                  )}

                  {selected.location?.coordinates && (
                    <div>
                      <p className="overline mb-2 flex items-center gap-1">
                        <MapPin className="w-3 h-3" strokeWidth={1.8} /> Ubicación
                      </p>
                      <div
                        className="rounded-md overflow-hidden border-2 border-slate-300 ring-1 ring-slate-200 shadow-sm relative"
                        style={{ height: "200px" }}
                      >
                        <MapContainer
                          key={`detail-map-${selected.id}`}
                          center={[selected.location.coordinates[1], selected.location.coordinates[0]]}
                          zoom={15}
                          style={{ height: "100%", width: "100%" }}
                        >
                          <TileLayer url={lightTile} attribution="&copy; CARTO" />
                          <Marker position={[selected.location.coordinates[1], selected.location.coordinates[0]]} />
                        </MapContainer>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 font-mono-tactical">
                        {selected.location.coordinates[1].toFixed(5)}, {selected.location.coordinates[0].toFixed(5)}
                      </p>
                      <div className="mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-md border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"
                          onClick={() =>
                            copyText(
                              `https://www.google.com/maps?q=${selected.location.coordinates[1]},${selected.location.coordinates[0]}`,
                              "Enlace de Google Maps copiado"
                            )
                          }
                        >
                          <Copy className="w-3.5 h-3.5 mr-1" strokeWidth={2} />
                          Copiar enlace Maps
                        </Button>
                      </div>
                    </div>
                  )}

                  {selected.image_url && (
                    <div>
                      <p className="overline mb-1 flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" strokeWidth={1.8} /> Imagen
                      </p>
                      <img
                        src={selected.image_url}
                        alt="Evidencia"
                        className="max-h-56 rounded-md border border-slate-200"
                      />
                    </div>
                  )}

                  {selected.audio_url && (
                    <div>
                      <p className="overline mb-1 flex items-center gap-1">
                        <Volume2 className="w-3 h-3" strokeWidth={1.8} /> Audio
                      </p>
                      <audio controls src={selected.audio_url} className="w-full" />
                    </div>
                  )}

                  <div>
                    <p className="overline mb-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" strokeWidth={1.8} /> Historial
                    </p>
                    <ul className="space-y-2">
                      {(selected.history || []).map((h, i) => (
                        <li key={i} className="text-xs border-l-2 border-slate-200 pl-3">
                          <div className="flex items-center gap-2">
                            <Badge className={`rounded text-[0.6rem] ${STATUS_STYLE[h.status]}`}>
                              {STATUS_LABEL[h.status]}
                            </Badge>
                            <span className="text-slate-700">{h.changed_by_name || "—"}</span>
                          </div>
                          <div className="text-slate-400 font-mono-tactical mt-0.5">
                            {format(new Date(h.changed_at), "PPp", { locale: es })}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 flex flex-wrap gap-2">
                  <p className="overline w-full">Cambiar estado</p>
                  <Button
                    size="sm"
                    onClick={() => changeStatus("pending")}
                    className="bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded"
                    data-testid="status-pending-button"
                  >
                    Pendiente
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => changeStatus("in_process")}
                    className="bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 rounded"
                    data-testid="status-in-process-button"
                  >
                    En proceso
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => changeStatus("completed")}
                    className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded"
                    data-testid="status-completed-button"
                  >
                    Completada
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Confirmación archivar */}
      <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <DialogContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 max-w-md rounded-lg" data-testid="confirm-archive-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Archive className="w-5 h-5 text-rose-600" strokeWidth={1.8} />
              Archivar alertas completadas
            </DialogTitle>
            <DialogDescription className="text-slate-600 dark:text-slate-400">
              Esta acción moverá todas las alertas en estado <b>Completada</b> al historial.
              No se borran — podés verlas luego con "Ver archivadas".
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end pt-3">
            <Button variant="outline" onClick={() => setConfirmArchive(false)} disabled={archiving}>
              Cancelar
            </Button>
            <Button
              onClick={archiveCompleted}
              disabled={archiving}
              className="bg-rose-600 hover:bg-rose-500 text-white"
              data-testid="confirm-archive-button"
            >
              {archiving ? "Archivando..." : "Archivar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

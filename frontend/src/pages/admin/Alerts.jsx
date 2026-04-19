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
  Eye, MapPin, Image as ImageIcon, Volume2, Clock,
  Siren, Flame, HeartPulse, Navigation, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

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
  on_way:  { label: "EN CAMINO",  Icon: Navigation, bg: "bg-sky-50 text-sky-700 border-sky-200" },
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
  const [alerts, setAlerts] = useState([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterUser, setFilterUser] = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.append("status", filterStatus);
      if (filterType !== "all") params.append("type", filterType);
      const { data } = await api.get(`/alerts?${params.toString()}`);
      let filtered = data;
      if (filterUser.trim()) {
        const q = filterUser.toLowerCase();
        filtered = filtered.filter(
          (a) =>
            (a.user_name && a.user_name.toLowerCase().includes(q)) ||
            (a.user_email && a.user_email.toLowerCase().includes(q))
        );
      }
      setAlerts(filtered);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType, filterUser]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!socket) return;
    const newHandler = () => {
      // El audio global lo maneja AlertAudioContext
      load();
    };
    const updateHandler = () => load();
    socket.on("alert:new", newHandler);
    socket.on("alert:updated", updateHandler);
    return () => {
      socket.off("alert:new", newHandler);
      socket.off("alert:updated", updateHandler);
    };
  }, [socket, load]);

  const changeStatus = async (status) => {
    if (!selected) return;
    try {
      const { data } = await api.patch(`/alerts/${selected.id}/status`, { status });
      setSelected(data);
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

  const mapMarkers = alerts.filter(
    (a) => a.location?.coordinates && a.location.coordinates.length === 2
  );

  const firstMarker = mapMarkers[0];
  const defaultCenter = firstMarker
    ? [firstMarker.location.coordinates[1], firstMarker.location.coordinates[0]]
    : [-25.2637, -57.5759];

  const lightTile = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="admin-alerts">
      <div className="mb-6">
        <p className="overline mb-2">Gestión</p>
        <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight text-slate-900">Alertas</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div>
          <Label className="overline block mb-1.5">Estado</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="bg-white border-slate-200 rounded-md" data-testid="filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="in_process">En proceso</SelectItem>
              <SelectItem value="completed">Completadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="overline block mb-1.5">Tipo</Label>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="bg-white border-slate-200 rounded-md" data-testid="filter-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="panic">Pánico</SelectItem>
              <SelectItem value="fire">Incendio</SelectItem>
              <SelectItem value="medical">Asistencia</SelectItem>
              <SelectItem value="on_way">En camino</SelectItem>
              <SelectItem value="here">Estoy aquí</SelectItem>
              <SelectItem value="silent">Silenciosa (legacy)</SelectItem>
              <SelectItem value="normal">Normal (legacy)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="overline block mb-1.5">Buscar usuario</Label>
          <Input
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            placeholder="nombre o email"
            className="bg-white border-slate-200 rounded-md"
            data-testid="filter-user"
          />
        </div>
      </div>

      {/* Map */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-6" data-testid="alerts-map">
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
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 hover:bg-transparent">
                <TableHead className="overline text-slate-500">Usuario</TableHead>
                <TableHead className="overline text-slate-500">Organización</TableHead>
                <TableHead className="overline text-slate-500">Tipo</TableHead>
                <TableHead className="overline text-slate-500">Estado</TableHead>
                <TableHead className="overline text-slate-500">Hora</TableHead>
                <TableHead className="overline text-slate-500">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={6} className="text-slate-400 py-6">Cargando...</TableCell></TableRow>
              )}
              {!loading && alerts.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-slate-400 py-8 text-center">Sin alertas</TableCell></TableRow>
              )}
              {alerts.map((a) => {
                const cfg = TYPE_CFG[a.type] || { label: a.type?.toUpperCase() || "?", bg: "" };
                return (
                  <TableRow
                    key={a.id}
                    className="border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setSelected(a)}
                    data-testid="alert-row"
                  >
                    <TableCell>
                      <div className="font-heading font-semibold text-slate-900">{a.user_name}</div>
                      <div className="text-xs text-slate-500">{a.user_email}</div>
                    </TableCell>
                    <TableCell className="text-slate-700 text-sm">{a.organization_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`rounded ${cfg.bg}`}>
                        {cfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`rounded ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-slate-500 text-xs font-mono-tactical">
                      {formatDistanceToNow(new Date(a.timestamp), { addSuffix: true, locale: es })}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-500 hover:text-slate-900"
                        onClick={(e) => { e.stopPropagation(); setSelected(a); }}
                        data-testid="view-alert-button"
                      >
                        <Eye className="w-4 h-4" strokeWidth={1.8} />
                      </Button>
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
          className="bg-white border-slate-200 max-w-2xl rounded-lg overflow-hidden"
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
                        className="rounded-md overflow-hidden border border-slate-200 relative"
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
    </div>
  );
}

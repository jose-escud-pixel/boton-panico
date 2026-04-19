import React, { useEffect, useState, useCallback } from "react";
import api from "../../lib/api";
import { useSocket } from "../../context/SocketContext";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { Eye, MapPin, Image as ImageIcon, Volume2, Clock } from "lucide-react";
import { toast } from "sonner";

// Fix leaflet default icon path
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const STATUS_STYLE = {
  pending: "bg-rose-950 text-rose-400 border-rose-900",
  in_process: "bg-amber-950 text-amber-400 border-amber-900",
  completed: "bg-emerald-950 text-emerald-400 border-emerald-900",
};
const STATUS_LABEL = {
  pending: "PENDIENTE",
  in_process: "EN PROCESO",
  completed: "COMPLETADA",
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

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    const newHandler = () => load();
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
    } catch (e) {
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
    : [-25.2637, -57.5759]; // Asunción default

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="admin-alerts">
      <div className="mb-6">
        <p className="overline mb-2">Gestión</p>
        <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight">Alertas</h1>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div>
          <Label className="overline block mb-1.5">Estado</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-sm" data-testid="filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
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
            <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-sm" data-testid="filter-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="silent">Silenciosa</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="overline block mb-1.5">Buscar usuario</Label>
          <Input
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            placeholder="nombre o email"
            className="bg-zinc-900 border-zinc-800 rounded-sm"
            data-testid="filter-user"
          />
        </div>
      </div>

      {/* Map */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-md overflow-hidden mb-6" data-testid="alerts-map">
        <div className="h-72 w-full">
          <MapContainer
            center={defaultCenter}
            zoom={mapMarkers.length ? 12 : 5}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution="&copy; OpenStreetMap &copy; CARTO"
            />
            {center && <FlyTo center={center} />}
            {mapMarkers.map((a) => {
              const pos = [a.location.coordinates[1], a.location.coordinates[0]];
              return (
                <Marker key={a.id} position={pos} eventHandlers={{ click: () => setSelected(a) }}>
                  <Popup>
                    <div className="text-xs">
                      <div className="font-bold">{a.user_name}</div>
                      <div className="text-zinc-400">{a.type === "silent" ? "Silenciosa" : "Normal"}</div>
                      <div className="text-zinc-500 mt-1">
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
      <div className="bg-zinc-900 border border-zinc-800 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="overline text-zinc-400">Usuario</TableHead>
                <TableHead className="overline text-zinc-400">Organización</TableHead>
                <TableHead className="overline text-zinc-400">Tipo</TableHead>
                <TableHead className="overline text-zinc-400">Estado</TableHead>
                <TableHead className="overline text-zinc-400">Hora</TableHead>
                <TableHead className="overline text-zinc-400">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={6} className="text-zinc-500 py-6">Cargando...</TableCell></TableRow>
              )}
              {!loading && alerts.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-zinc-500 py-8 text-center">Sin alertas</TableCell></TableRow>
              )}
              {alerts.map((a) => (
                <TableRow
                  key={a.id}
                  className="border-zinc-800 hover:bg-zinc-800/40 cursor-pointer"
                  onClick={() => setSelected(a)}
                  data-testid="alert-row"
                >
                  <TableCell>
                    <div className="font-heading font-semibold">{a.user_name}</div>
                    <div className="text-xs text-zinc-500">{a.user_email}</div>
                  </TableCell>
                  <TableCell className="text-zinc-300 text-sm">{a.organization_name}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`rounded-sm ${
                        a.type === "silent"
                          ? "border-rose-900 text-rose-400"
                          : "border-amber-900 text-amber-400"
                      }`}
                    >
                      {a.type === "silent" ? "SILENCIOSA" : "NORMAL"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`rounded-sm ${STATUS_STYLE[a.status]}`}>
                      {STATUS_LABEL[a.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-400 text-xs font-mono-tactical">
                    {formatDistanceToNow(new Date(a.timestamp), { addSuffix: true, locale: es })}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-zinc-400 hover:text-white"
                      onClick={(e) => { e.stopPropagation(); setSelected(a); }}
                      data-testid="view-alert-button"
                    >
                      <Eye className="w-4 h-4" strokeWidth={1.5} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 max-w-2xl rounded-md" data-testid="alert-detail-dialog">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading tracking-tight flex items-center gap-2">
                  Alerta de {selected.user_name}
                  <Badge
                    variant="outline"
                    className={`rounded-sm ${
                      selected.type === "silent"
                        ? "border-rose-900 text-rose-400"
                        : "border-amber-900 text-amber-400"
                    }`}
                  >
                    {selected.type === "silent" ? "SILENCIOSA" : "NORMAL"}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-zinc-500 font-mono-tactical text-xs">
                  {format(new Date(selected.timestamp), "PPPp", { locale: es })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                {selected.message && (
                  <div>
                    <p className="overline mb-1">Mensaje</p>
                    <p className="text-zinc-200">{selected.message}</p>
                  </div>
                )}

                {selected.location?.coordinates && (
                  <div>
                    <p className="overline mb-2 flex items-center gap-1">
                      <MapPin className="w-3 h-3" strokeWidth={1.5} /> Ubicación
                    </p>
                    <div className="h-48 rounded-sm overflow-hidden border border-zinc-800">
                      <MapContainer
                        center={[selected.location.coordinates[1], selected.location.coordinates[0]]}
                        zoom={15}
                        style={{ height: "100%", width: "100%" }}
                      >
                        <TileLayer
                          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                          attribution="&copy; CARTO"
                        />
                        <Marker position={[selected.location.coordinates[1], selected.location.coordinates[0]]} />
                      </MapContainer>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1 font-mono-tactical">
                      {selected.location.coordinates[1].toFixed(5)}, {selected.location.coordinates[0].toFixed(5)}
                    </p>
                  </div>
                )}

                {selected.image_url && (
                  <div>
                    <p className="overline mb-1 flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" strokeWidth={1.5} /> Imagen
                    </p>
                    <img
                      src={selected.image_url}
                      alt="Evidencia"
                      className="max-h-56 rounded-sm border border-zinc-800"
                    />
                  </div>
                )}

                {selected.audio_url && (
                  <div>
                    <p className="overline mb-1 flex items-center gap-1">
                      <Volume2 className="w-3 h-3" strokeWidth={1.5} /> Audio
                    </p>
                    <audio controls src={selected.audio_url} className="w-full" />
                  </div>
                )}

                <div>
                  <p className="overline mb-2 flex items-center gap-1">
                    <Clock className="w-3 h-3" strokeWidth={1.5} /> Historial
                  </p>
                  <ul className="space-y-2">
                    {(selected.history || []).map((h, i) => (
                      <li key={i} className="text-xs border-l-2 border-zinc-800 pl-3">
                        <div className="flex items-center gap-2">
                          <Badge className={`rounded-sm text-[0.6rem] ${STATUS_STYLE[h.status]}`}>
                            {STATUS_LABEL[h.status]}
                          </Badge>
                          <span className="text-zinc-400">{h.changed_by_name || "—"}</span>
                        </div>
                        <div className="text-zinc-600 font-mono-tactical mt-0.5">
                          {format(new Date(h.changed_at), "PPp", { locale: es })}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-800 flex flex-wrap gap-2">
                <p className="overline w-full">Cambiar estado</p>
                <Button
                  size="sm"
                  onClick={() => changeStatus("pending")}
                  className="bg-rose-950 text-rose-400 border border-rose-900 hover:bg-rose-900 rounded-sm"
                  data-testid="status-pending-button"
                >
                  Pendiente
                </Button>
                <Button
                  size="sm"
                  onClick={() => changeStatus("in_process")}
                  className="bg-amber-950 text-amber-400 border border-amber-900 hover:bg-amber-900 rounded-sm"
                  data-testid="status-in-process-button"
                >
                  En proceso
                </Button>
                <Button
                  size="sm"
                  onClick={() => changeStatus("completed")}
                  className="bg-emerald-950 text-emerald-400 border border-emerald-900 hover:bg-emerald-900 rounded-sm"
                  data-testid="status-completed-button"
                >
                  Completada
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

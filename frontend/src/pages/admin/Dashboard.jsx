import React, { useEffect, useState, useCallback, useRef } from "react";
import api from "../../lib/api";
import { useSocket } from "../../context/SocketContext";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Siren, Clock, CheckCircle2, Activity, AlertTriangle, Volume2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

const STATUS_COLOR = {
  pending: "#e11d48",
  in_process: "#f59e0b",
  completed: "#10b981",
};

const STATUS_LABEL = {
  pending: "PENDIENTE",
  in_process: "EN PROCESO",
  completed: "COMPLETADA",
};

// Short beep sound (base64 encoded)
const BEEP_DATA = "data:audio/wav;base64,UklGRpQGAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YXAGAAA=";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const { socket } = useSocket();
  const audioRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      const [statsRes, alertsRes] = await Promise.all([
        api.get("/dashboard/stats"),
        api.get("/alerts?limit=10"),
      ]);
      setStats(statsRes.data);
      setRecentAlerts(alertsRes.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!socket) return;
    const handler = (alert) => {
      setRecentAlerts((prev) => [alert, ...prev].slice(0, 10));
      loadData();
      // Play beep
      try {
        const audio = new Audio(BEEP_DATA);
        audio.volume = 0.6;
        audio.play().catch(() => {});
      } catch {}
      toast.error(
        `Nueva alerta ${alert.type === "silent" ? "silenciosa" : "normal"} de ${alert.user_name}`,
        {
          description: alert.organization_name,
          duration: 6000,
        }
      );
    };
    socket.on("alert:new", handler);
    return () => socket.off("alert:new", handler);
  }, [socket, loadData]);

  if (!stats) {
    return (
      <div className="p-8 text-zinc-500">Cargando...</div>
    );
  }

  const typeData = [
    { name: "Silenciosa", value: stats.by_type.silent, color: "#e11d48" },
    { name: "Normal", value: stats.by_type.normal, color: "#f59e0b" },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="admin-dashboard">
      <audio ref={audioRef} src={BEEP_DATA} preload="auto" />

      {/* Header */}
      <div className="mb-8">
        <p className="overline mb-2">Panel principal</p>
        <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight">
          Vista General
        </h1>
        <p className="text-zinc-500 text-sm mt-1">Monitoreo en tiempo real de alertas de emergencia</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
        <KpiCard label="Hoy" value={stats.today} icon={Siren} accent="rose" testid="kpi-today" />
        <KpiCard label="Semana" value={stats.week} icon={Activity} accent="amber" testid="kpi-week" />
        <KpiCard label="Mes" value={stats.month} icon={Clock} accent="blue" testid="kpi-month" />
        <KpiCard label="Total" value={stats.total} icon={CheckCircle2} accent="emerald" testid="kpi-total" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily chart */}
        <Card className="lg:col-span-2 bg-zinc-900 border-zinc-800 rounded-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm overline flex items-center gap-2">
              <span>Últimos 7 días</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.daily}>
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="date" stroke="#71717a" fontSize={11} />
                  <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#18181b",
                      border: "1px solid #27272a",
                      borderRadius: 4,
                      color: "#fff",
                    }}
                  />
                  <Bar dataKey="count" fill="#e11d48" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Type pie */}
        <Card className="bg-zinc-900 border-zinc-800 rounded-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm overline">Por tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typeData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {typeData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#18181b",
                      border: "1px solid #27272a",
                      borderRadius: 4,
                      color: "#fff",
                    }}
                  />
                  <Legend
                    iconType="square"
                    wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Status summary */}
        <Card className="bg-zinc-900 border-zinc-800 rounded-md lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm overline">Por estado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(stats.by_status).map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between border-b border-zinc-800/50 pb-2 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: STATUS_COLOR[k] }}
                  />
                  <span className="text-sm text-zinc-300">{STATUS_LABEL[k]}</span>
                </div>
                <span className="font-heading font-bold text-lg">{v}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent alerts feed */}
        <Card className="bg-zinc-900 border-zinc-800 rounded-md lg:col-span-2">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm overline flex items-center gap-2">
              <Volume2 className="w-3 h-3" strokeWidth={1.5} />
              <span>Feed en vivo</span>
            </CardTitle>
            <Badge className="bg-rose-950 text-rose-400 border-rose-900 hover:bg-rose-900">
              {recentAlerts.length} recientes
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-y-auto custom-scrollbar space-y-2" data-testid="recent-alerts-feed">
              {recentAlerts.length === 0 && (
                <div className="text-zinc-600 text-sm py-8 text-center flex flex-col items-center gap-2">
                  <AlertTriangle className="w-8 h-8" strokeWidth={1.5} />
                  <span>Sin alertas recientes</span>
                </div>
              )}
              {recentAlerts.map((a) => (
                <div
                  key={a.id}
                  className="animate-slide-in p-3 border-l-4 bg-zinc-950/50 rounded-r-sm"
                  style={{ borderLeftColor: STATUS_COLOR[a.status] }}
                  data-testid="alert-feed-item"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-heading font-semibold text-sm truncate">{a.user_name}</span>
                        <Badge
                          variant="outline"
                          className={`text-[0.6rem] h-4 px-1.5 rounded-sm ${
                            a.type === "silent"
                              ? "border-rose-900 text-rose-400"
                              : "border-amber-900 text-amber-400"
                          }`}
                        >
                          {a.type === "silent" ? "SILENCIOSA" : "NORMAL"}
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5 truncate">
                        {a.organization_name}
                        {a.message ? ` · ${a.message}` : ""}
                      </p>
                    </div>
                    <span className="text-[0.65rem] text-zinc-600 whitespace-nowrap font-mono-tactical">
                      {formatDistanceToNow(new Date(a.timestamp), { addSuffix: true, locale: es })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, accent, testid }) {
  const accentMap = {
    rose: "text-rose-500 border-rose-900/40",
    amber: "text-amber-500 border-amber-900/40",
    blue: "text-blue-400 border-blue-900/40",
    emerald: "text-emerald-500 border-emerald-900/40",
  };
  return (
    <div
      className="bg-zinc-900 border border-zinc-800 rounded-md p-4 md:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      data-testid={testid}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="overline text-[0.65rem]">{label}</span>
        <Icon className={`w-4 h-4 ${accentMap[accent]}`} strokeWidth={1.5} />
      </div>
      <div className="font-heading text-3xl md:text-4xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

import React, { useEffect, useState, useCallback } from "react";
import api from "../../lib/api";
import { useSocket } from "../../context/SocketContext";
import { speakAlertType } from "../../lib/alertVoice";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Siren, Clock, CheckCircle2, Activity, AlertTriangle, Volume2,
  Flame, HeartPulse, Navigation, MapPin,
} from "lucide-react";
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

const TYPE_CFG = {
  panic:   { label: "PÁNICO",     color: "#e11d48", Icon: Siren,      bg: "bg-rose-50 text-rose-700 border-rose-200" },
  fire:    { label: "INCENDIO",   color: "#ea580c", Icon: Flame,      bg: "bg-orange-50 text-orange-700 border-orange-200" },
  medical: { label: "ASISTENCIA", color: "#10b981", Icon: HeartPulse, bg: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  on_way:  { label: "EN CAMINO",  color: "#0284c7", Icon: Navigation, bg: "bg-sky-50 text-sky-700 border-sky-200" },
  here:    { label: "ESTOY AQUÍ", color: "#7c3aed", Icon: MapPin,     bg: "bg-violet-50 text-violet-700 border-violet-200" },
  silent:  { label: "SILENCIOSA", color: "#e11d48", Icon: Siren,      bg: "bg-rose-50 text-rose-700 border-rose-200" },
  normal:  { label: "NORMAL",     color: "#f59e0b", Icon: AlertTriangle, bg: "bg-amber-50 text-amber-700 border-amber-200" },
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const { socket } = useSocket();

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

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!socket) return;
    const handler = (alert) => {
      setRecentAlerts((prev) => [alert, ...prev].slice(0, 10));
      loadData();
      speakAlertType(alert.type);
      const cfg = TYPE_CFG[alert.type] || { label: alert.type?.toUpperCase() };
      toast.error(`Nueva alerta: ${cfg.label} — ${alert.user_name}`, {
        description: alert.organization_name,
        duration: 6000,
      });
    };
    socket.on("alert:new", handler);
    return () => socket.off("alert:new", handler);
  }, [socket, loadData]);

  if (!stats) {
    return <div className="p-8 text-slate-500">Cargando...</div>;
  }

  // Construye datos para el pie chart usando type_counts (nuevo) o by_type (legacy)
  const typeCounts = stats.type_counts || {};
  const typeData = Object.keys(TYPE_CFG)
    .filter((k) => typeCounts[k] > 0)
    .map((k) => ({ name: TYPE_CFG[k].label, value: typeCounts[k], color: TYPE_CFG[k].color }));

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="admin-dashboard">
      <div className="mb-8">
        <p className="overline mb-2">Panel principal</p>
        <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
          Vista General
        </h1>
        <p className="text-slate-500 text-sm mt-1">Monitoreo en tiempo real de alertas de emergencia</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
        <KpiCard label="Hoy" value={stats.today} icon={Siren} accent="rose" testid="kpi-today" />
        <KpiCard label="Semana" value={stats.week} icon={Activity} accent="amber" testid="kpi-week" />
        <KpiCard label="Mes" value={stats.month} icon={Clock} accent="blue" testid="kpi-month" />
        <KpiCard label="Total" value={stats.total} icon={CheckCircle2} accent="emerald" testid="kpi-total" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 bg-white border-slate-200 rounded-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm overline">Últimos 7 días</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.daily}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      color: "#0f172a",
                    }}
                  />
                  <Bar dataKey="count" fill="#e11d48" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 rounded-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm overline">Por tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={typeData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
                    {typeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      color: "#0f172a",
                    }}
                  />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 11, color: "#475569" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 rounded-lg lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm overline">Por estado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(stats.by_status).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[k] }} />
                  <span className="text-sm text-slate-700">{STATUS_LABEL[k]}</span>
                </div>
                <span className="font-heading font-bold text-lg text-slate-900">{v}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200 rounded-lg lg:col-span-2">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm overline flex items-center gap-2">
              <Volume2 className="w-3 h-3" strokeWidth={1.8} />
              <span>Feed en vivo</span>
            </CardTitle>
            <Badge className="bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100">
              {recentAlerts.length} recientes
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-y-auto custom-scrollbar space-y-2" data-testid="recent-alerts-feed">
              {recentAlerts.length === 0 && (
                <div className="text-slate-400 text-sm py-8 text-center flex flex-col items-center gap-2">
                  <AlertTriangle className="w-8 h-8" strokeWidth={1.5} />
                  <span>Sin alertas recientes</span>
                </div>
              )}
              {recentAlerts.map((a) => {
                const cfg = TYPE_CFG[a.type] || { label: a.type?.toUpperCase(), color: "#64748b" };
                return (
                  <div
                    key={a.id}
                    className="animate-slide-in p-3 border-l-4 bg-slate-50 rounded-r-md"
                    style={{ borderLeftColor: STATUS_COLOR[a.status] }}
                    data-testid="alert-feed-item"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-heading font-semibold text-sm truncate text-slate-900">
                            {a.user_name}
                          </span>
                          <Badge variant="outline" className={`text-[0.6rem] h-4 px-1.5 rounded ${cfg.bg}`}>
                            {cfg.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {a.organization_name}
                          {a.message ? ` · ${a.message}` : ""}
                        </p>
                      </div>
                      <span className="text-[0.65rem] text-slate-400 whitespace-nowrap font-mono-tactical">
                        {formatDistanceToNow(new Date(a.timestamp), { addSuffix: true, locale: es })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, accent, testid }) {
  const accentMap = {
    rose: "text-rose-600 bg-rose-50",
    amber: "text-amber-600 bg-amber-50",
    blue: "text-sky-600 bg-sky-50",
    emerald: "text-emerald-600 bg-emerald-50",
  };
  return (
    <div
      className="bg-white border border-slate-200 rounded-lg p-4 md:p-5 shadow-sm"
      data-testid={testid}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="overline text-[0.65rem]">{label}</span>
        <div className={`p-1.5 rounded-md ${accentMap[accent]}`}>
          <Icon className="w-4 h-4" strokeWidth={1.8} />
        </div>
      </div>
      <div className="font-heading text-3xl md:text-4xl font-bold tracking-tight text-slate-900">{value}</div>
    </div>
  );
}

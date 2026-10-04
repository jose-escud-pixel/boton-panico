import React, { useEffect, useRef, useState, useCallback } from "react";
import { API_BASE } from "../../lib/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Play, Pause, Trash2, Download, Radio } from "lucide-react";

const QUICK_FILTERS = [
  { label: "Todo", value: "" },
  { label: "Alarm TCP", value: "Alarm TCP" },
  { label: "Watchdog", value: "Watchdog" },
  { label: "Hikvision", value: "Hikvision" },
  { label: "FCM / Push", value: "FCM" },
  { label: "Errores", value: "ERROR" },
];

/**
 * Panel de solo lectura que conecta por Server-Sent Events al log en vivo del
 * backend (GET /api/system/logs/stream). No persiste nada — es un "tail -f"
 * en el navegador, pensado para ajustar reglas de eventos de alarmas mientras
 * llega tráfico real (equivalente a `tail -f backend.err.log | grep "..."`).
 */
export default function LiveLogPanel() {
  const [source, setSource] = useState("err");
  const [quickFilter, setQuickFilter] = useState("");
  const [filterInput, setFilterInput] = useState("");
  const [customFilter, setCustomFilter] = useState("");
  const [lines, setLines] = useState([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const esRef = useRef(null);
  const bottomRef = useRef(null);
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const effectiveFilter = customFilter || quickFilter;

  const connect = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setLines([]);
    setConnected(false);
    if (typeof window === "undefined" || typeof window.EventSource === "undefined") return;
    const token = localStorage.getItem("access_token") || "";
    const params = new URLSearchParams({ source, lines: "300" });
    if (effectiveFilter) params.set("q", effectiveFilter);
    if (token) params.set("access_token", token);
    const url = `${API_BASE}/system/logs/stream?${params.toString()}`;
    const es = new window.EventSource(url, { withCredentials: true });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (evt) => {
      if (pausedRef.current) return;
      setLines((prev) => {
        const next = [...prev, evt.data];
        return next.length > 1000 ? next.slice(next.length - 1000) : next;
      });
    };
    esRef.current = es;
  }, [source, effectiveFilter]);

  useEffect(() => {
    connect();
    return () => { esRef.current?.close(); esRef.current = null; };
  }, [connect]);

  useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lines, paused]);

  const applyQuick = (value) => {
    setQuickFilter(value);
    setCustomFilter("");
    setFilterInput("");
  };

  const commitCustomFilter = () => setCustomFilter(filterInput.trim());

  const clear = () => setLines([]);

  const downloadTxt = () => {
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nacurutu-logs-${source}-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
          <Radio className={`w-5 h-5 ${connected ? "text-emerald-500" : "text-slate-400"}`} strokeWidth={1.8} />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white text-sm">Logs en vivo del backend</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Solo lectura, no se guarda nada. Sirve para ajustar reglas de eventos mientras llega
            tráfico real — equivalente a <code className="font-mono">tail -f backend.err.log | grep "Alarm TCP"</code>.
          </p>
        </div>
        <span className={`ml-auto text-[10px] font-mono px-2 py-1 rounded-full border shrink-0 ${connected ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800" : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:border-slate-700"}`}>
          {connected ? "● conectado" : "○ desconectado"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {QUICK_FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => applyQuick(f.value)}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              quickFilter === f.value && !customFilter
                ? "bg-rose-600 text-white border-rose-600"
                : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {f.label}
          </button>
        ))}
        <Input
          value={filterInput}
          onChange={(e) => setFilterInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitCustomFilter(); }}
          onBlur={commitCustomFilter}
          placeholder="Filtro personalizado… (Enter)"
          className="h-7 text-xs w-48 dark:bg-slate-800 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="h-7 text-xs rounded-md border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white px-2"
        >
          <option value="err">stderr (backend.err.log)</option>
          <option value="out">stdout (backend.log)</option>
        </select>
        <Button size="sm" variant="outline" onClick={() => setPaused((p) => !p)} className="h-7 text-[11px] dark:border-slate-700 dark:text-slate-300">
          {paused ? <><Play className="w-3 h-3 mr-1" />Reanudar</> : <><Pause className="w-3 h-3 mr-1" />Pausar</>}
        </Button>
        <Button size="sm" variant="outline" onClick={clear} className="h-7 text-[11px] dark:border-slate-700 dark:text-slate-300">
          <Trash2 className="w-3 h-3 mr-1" /> Limpiar
        </Button>
        <Button size="sm" variant="outline" onClick={downloadTxt} disabled={lines.length === 0} className="h-7 text-[11px] dark:border-slate-700 dark:text-slate-300">
          <Download className="w-3 h-3 mr-1" /> Exportar
        </Button>
      </div>

      <div className="bg-slate-950 rounded-lg p-3 h-[420px] overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-300">
        {lines.length === 0 && (
          <p className="text-slate-500 italic">
            Esperando líneas nuevas del log{effectiveFilter ? ` que contengan "${effectiveFilter}"` : ""}…
          </p>
        )}
        {lines.map((l, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap break-all ${
              /error|exception|traceback/i.test(l) ? "text-rose-400" : /warn/i.test(l) ? "text-amber-400" : ""
            }`}
          >
            {l}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

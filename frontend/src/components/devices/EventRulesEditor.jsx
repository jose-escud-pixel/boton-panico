import React, { useState, useEffect } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { Plus, Trash2, Shield, ShieldOff, Info, Radio, X } from "lucide-react";
import {
  EVENT_CATEGORIES_CID, EVENT_CATEGORIES_SIA, KNOWN_EVENT_PREFIXES,
  SEVERITY_OPTIONS, SEVERITY_BADGE,
} from "../../lib/eventCategories";
import LiveLogPanel from "./LiveLogPanel";

/**
 * Editor de reglas de eventos (Contact ID / SIA DC-09), reutilizado tanto para
 * las reglas de una MARCA (plantilla, AlarmBrandProfile.event_rules) como para
 * las reglas de UN DISPOSITIVO puntual (override, Device.event_rules).
 *
 * `rules`: array de { event_code_prefix, severity, description, is_arm, is_disarm }
 * `onChange(nextRules)`: se llama con el array completo actualizado.
 *
 * El "armado"/"desarmado" se configura en UNA sola sección (no en cada fila
 * de categoría) porque solo aplica a un código puntual por panel — mostrarlo
 * repetido en las ~15 filas de categorías ocupa lugar sin necesidad.
 */
export default function EventRulesEditor({ rules, onChange, compact = false }) {
  const list = rules || [];
  const map = {};
  list.forEach((r) => { map[r.event_code_prefix] = r; });

  const armRule = list.find((r) => r.is_arm);
  const disarmRule = list.find((r) => r.is_disarm);

  const [armDraft, setArmDraft] = useState(armRule?.event_code_prefix || "");
  const [disarmDraft, setDisarmDraft] = useState(disarmRule?.event_code_prefix || "");
  const [showLive, setShowLive] = useState(false);

  // Si las reglas cambian desde afuera (ej. "Cargar de la marca"), resincronizar los inputs.
  useEffect(() => {
    setArmDraft(armRule?.event_code_prefix || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armRule?.event_code_prefix]);
  useEffect(() => {
    setDisarmDraft(disarmRule?.event_code_prefix || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disarmRule?.event_code_prefix]);

  const upsertCategory = (prefix, defaultSeverity, patch) => {
    const current = map[prefix] || { event_code_prefix: prefix, severity: defaultSeverity, is_arm: false, is_disarm: false };
    const next = { ...current, ...patch };
    onChange([...list.filter((r) => r.event_code_prefix !== prefix), next]);
  };

  /** Mueve el flag is_arm/is_disarm al código exacto tipeado (creando la regla
   * si todavía no existe), sacándoselo a cualquier otra regla que lo tuviera. */
  const commitFlagCode = (flag, rawCode) => {
    const code = (rawCode || "").trim().toUpperCase();
    let next = list.map((r) => (r[flag] ? { ...r, [flag]: false } : r));
    if (code) {
      const otherFlag = flag === "is_arm" ? "is_disarm" : "is_arm";
      const idx = next.findIndex((r) => r.event_code_prefix === code);
      if (idx >= 0) {
        next[idx] = { ...next[idx], [flag]: true, [otherFlag]: false };
      } else {
        next = [...next, {
          event_code_prefix: code,
          severity: "info",
          description: flag === "is_arm" ? "Código de armado" : "Código de desarmado",
          is_arm: false,
          is_disarm: false,
          [flag]: true,
        }];
      }
    }
    onChange(next);
  };

  const commitArm = () => commitFlagCode("is_arm", armDraft);
  const commitDisarm = () => commitFlagCode("is_disarm", disarmDraft);

  const setFlagSeverity = (flag, code, severity) => {
    if (!code) return;
    upsertCategory(code, severity, { severity });
  };

  const customRows = list
    .map((r, idx) => ({ ...r, _idx: idx }))
    .filter((r) => !KNOWN_EVENT_PREFIXES.has(r.event_code_prefix));

  const updateCustom = (idx, patch) => {
    onChange(list.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const removeCustom = (idx) => onChange(list.filter((_, i) => i !== idx));
  const addCustom = () => onChange([...list, { event_code_prefix: "", severity: "alarm", description: "", is_arm: false, is_disarm: false }]);

  const CategoryTable = ({ title, cats }) => (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">{title}</p>
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        {cats.map((cat, i) => {
          const rule = map[cat.prefix] || { severity: cat.defaultSeverity };
          return (
            <div
              key={cat.prefix}
              className={`flex flex-col md:flex-row md:items-center gap-2 px-3 py-2.5 ${i < cats.length - 1 ? "border-b border-slate-100 dark:border-slate-800" : ""}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  {cat.label}
                  {rule.is_arm && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700">
                      <Shield className="w-2.5 h-2.5" /> armado
                    </span>
                  )}
                  {rule.is_disarm && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700">
                      <ShieldOff className="w-2.5 h-2.5" /> desarmado
                    </span>
                  )}
                </p>
                {!compact && cat.description && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{cat.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Select
                  value={rule.severity || cat.defaultSeverity}
                  onValueChange={(v) => upsertCategory(cat.prefix, cat.defaultSeverity, { severity: v })}
                >
                  <SelectTrigger className="h-8 w-[150px] text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                    {SEVERITY_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="dark:text-slate-200 dark:focus:bg-slate-700">
                        <span className={s.color}>{s.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Armado / Desarmado — sección única, en vez de una casilla en cada fila de arriba */}
      <div className="border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/20 rounded-lg p-3">
        <p className="text-[10px] font-semibold text-violet-500 dark:text-violet-400 uppercase tracking-wide mb-2">
          Armado / Desarmado
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2.5">
          Elegí el código exacto que tu panel manda cuando arma y cuando desarma. No hace falta
          tocar nada más — el resto de las categorías de arriba solo definen severidad.
        </p>
        <div className="grid sm:grid-cols-2 gap-2.5">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-600 shrink-0" strokeWidth={1.8} />
            <Input
              value={armDraft}
              onChange={(e) => setArmDraft(e.target.value.toUpperCase())}
              onBlur={commitArm}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitArm(); } }}
              placeholder="Código de armado (ej: CL)"
              className="h-8 text-xs font-mono dark:bg-slate-800 dark:border-slate-700 dark:text-white"
            />
            {armRule && (
              <button
                type="button"
                title="Quitar"
                onClick={() => { setArmDraft(""); commitFlagCode("is_arm", ""); }}
                className="text-slate-400 hover:text-rose-500 p-1 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldOff className="w-3.5 h-3.5 text-amber-600 shrink-0" strokeWidth={1.8} />
            <Input
              value={disarmDraft}
              onChange={(e) => setDisarmDraft(e.target.value.toUpperCase())}
              onBlur={commitDisarm}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitDisarm(); } }}
              placeholder="Código de desarmado (ej: OP)"
              className="h-8 text-xs font-mono dark:bg-slate-800 dark:border-slate-700 dark:text-white"
            />
            {disarmRule && (
              <button
                type="button"
                title="Quitar"
                onClick={() => { setDisarmDraft(""); commitFlagCode("is_disarm", ""); }}
                className="text-slate-400 hover:text-rose-500 p-1 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <CategoryTable title="Contact ID (códigos numéricos)" cats={EVENT_CATEGORIES_CID} />
      <CategoryTable title="SIA DC-09 (códigos alfabéticos — Hikvision AX Pro, Ajax…)" cats={EVENT_CATEGORIES_SIA} />

      {/* Reglas específicas por código exacto (además de las categorías de arriba) */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            Códigos específicos (opcional)
          </p>
          <Button type="button" variant="outline" size="sm" onClick={addCustom} className="h-7 text-[11px] dark:border-slate-700 dark:text-slate-300">
            <Plus className="w-3 h-3 mr-1" /> Agregar código
          </Button>
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1 mb-1.5">
          <Info className="w-3 h-3 shrink-0 mt-0.5" />
          Escribí el código tal cual llega, sin el prefijo E/R de Contact ID (ej: si el log muestra
          "E130", escribí "130"; para SIA escribilo literal, ej: "BA"). Cuanto más largo el código,
          más prioridad tiene sobre la categoría general. Usá "Ver logs en vivo" abajo para copiar
          el código real que manda tu panel mientras lo probás.
        </p>
        {customRows.length === 0 ? null : (
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            {customRows.map((r) => (
              <div key={r._idx} className="flex flex-col md:flex-row md:items-center gap-2 px-3 py-2 border-b last:border-b-0 border-slate-100 dark:border-slate-800">
                <Input
                  value={r.event_code_prefix}
                  onChange={(e) => updateCustom(r._idx, { event_code_prefix: e.target.value.toUpperCase() })}
                  placeholder="ej: 130 o BA"
                  className="h-8 w-28 text-xs font-mono dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                />
                <Input
                  value={r.description || ""}
                  onChange={(e) => updateCustom(r._idx, { description: e.target.value })}
                  placeholder="Descripción (opcional)"
                  className="h-8 flex-1 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <Select value={r.severity} onValueChange={(v) => updateCustom(r._idx, { severity: v })}>
                    <SelectTrigger className="h-8 w-[130px] text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                      {SEVERITY_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value} className="dark:text-slate-200 dark:focus:bg-slate-700">
                          <span className={s.color}>{s.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {r.is_arm && (
                    <span title="Marcado como código de armado (se edita arriba, en 'Armado / Desarmado')" className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700">
                      <Shield className="w-2.5 h-2.5" />
                    </span>
                  )}
                  {r.is_disarm && (
                    <span title="Marcado como código de desarmado (se edita arriba, en 'Armado / Desarmado')" className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700">
                      <ShieldOff className="w-2.5 h-2.5" />
                    </span>
                  )}
                  <button type="button" onClick={() => removeCustom(r._idx)} className="text-rose-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vista previa */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
        <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">Vista previa</p>
        <div className="flex flex-wrap gap-1.5">
          {[...EVENT_CATEGORIES_CID, ...EVENT_CATEGORIES_SIA].map((cat) => {
            const rule = map[cat.prefix] || { severity: cat.defaultSeverity };
            return (
              <span key={cat.prefix} className={`text-[9px] border rounded px-1.5 py-0.5 ${SEVERITY_BADGE[rule.severity]}`}>
                {cat.prefix}{cat.prefix.length === 1 ? "x" : ""} → {rule.severity}
                {rule.is_arm ? " · armado" : ""}{rule.is_disarm ? " · desarmado" : ""}
              </span>
            );
          })}
        </div>
      </div>

      {/* Logs en vivo — para ver el código real que manda el panel mientras se ajustan reglas */}
      <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
        <button
          type="button"
          onClick={() => setShowLive((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
        >
          <Radio className="w-3.5 h-3.5" strokeWidth={1.8} />
          {showLive ? "Ocultar logs en vivo" : "Ver logs en vivo mientras configuro"}
        </button>
        {showLive && (
          <div className="mt-2">
            <LiveLogPanel />
          </div>
        )}
      </div>
    </div>
  );
}

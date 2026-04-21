import React, { useState, useRef, useEffect } from "react";
import { X, Search, Info } from "lucide-react";

/**
 * Input de filtros estilo "chip" para listas del admin.
 *
 * Sintaxis soportada:
 *   status:pending      → filtra por estado
 *   type:panic          → filtra por tipo
 *   user:jose           → busca texto en nombre/email
 *   org:ñacurutu        → busca texto en organización
 *   texto libre         → busca en user/email
 *
 * Múltiples chips combinan con AND.
 * Props:
 *   - chips: array de { key, value, label }
 *   - onChange: (newChips) => void
 *   - placeholder?: string
 *   - suggestions?: { status: [...], type: [...] } para autocompletar
 */
export default function ChipFilter({ chips, onChange, placeholder, suggestions = {} }) {
  const [input, setInput] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef(null);

  const parseToken = (token) => {
    const trimmed = token.trim();
    if (!trimmed) return null;
    const m = trimmed.match(/^(\w+):(.+)$/);
    if (m) {
      const key = m[1].toLowerCase();
      const value = m[2].trim();
      return { key, value, label: `${key}:${value}` };
    }
    return { key: "text", value: trimmed, label: trimmed };
  };

  const addChip = (raw) => {
    const parsed = parseToken(raw);
    if (!parsed) return;
    // Evitar duplicados exactos
    if (chips.some((c) => c.label === parsed.label)) return;
    // Si ya existe chip con la misma clave (excepto text), reemplazar
    let next = chips;
    if (parsed.key !== "text") {
      next = chips.filter((c) => c.key !== parsed.key);
    }
    onChange([...next, parsed]);
    setInput("");
  };

  const removeChip = (idx) => {
    const next = chips.filter((_, i) => i !== idx);
    onChange(next);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      addChip(input);
    } else if (e.key === "Backspace" && !input && chips.length > 0) {
      removeChip(chips.length - 1);
    }
  };

  useEffect(() => {
    // Autofocus al renderizar
    inputRef.current?.focus();
    // Ignorado si no se quiere robar focus — pero es frecuente que el usuario quiera empezar a tipear
  }, []);

  const chipStyle = (key) => {
    switch (key) {
      case "status": return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700";
      case "type":   return "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-700";
      case "user":   return "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700";
      case "org":    return "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/40 dark:text-violet-200 dark:border-violet-700";
      default:       return "bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600";
    }
  };

  return (
    <div className="relative">
      <div
        className="flex items-center flex-wrap gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 min-h-[2.6rem] focus-within:ring-2 focus-within:ring-rose-500/50 focus-within:border-rose-400"
        onClick={() => inputRef.current?.focus()}
        data-testid="chip-filter"
      >
        <Search className="w-4 h-4 text-slate-400 flex-shrink-0" strokeWidth={2} />
        {chips.map((c, idx) => (
          <span
            key={idx}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono border ${chipStyle(c.key)}`}
            data-testid="chip"
          >
            {c.label}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeChip(idx); }}
              className="hover:text-rose-600"
              aria-label="Eliminar"
              data-testid="chip-remove"
            >
              <X className="w-3 h-3" strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={chips.length === 0 ? (placeholder || "Buscar: status:pending, type:panic, user:juan, org:ñacurutu...") : ""}
          className="flex-1 min-w-[10rem] bg-transparent outline-none text-sm placeholder:text-slate-400 text-slate-900 dark:text-slate-100"
          data-testid="chip-filter-input"
        />
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
          aria-label="Ayuda"
          data-testid="chip-filter-help-button"
        >
          <Info className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
      {showHelp && (
        <div className="absolute top-full left-0 right-0 mt-1 z-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg p-3 text-xs text-slate-700 dark:text-slate-200">
          <div className="font-semibold mb-1">Sintaxis</div>
          <ul className="space-y-1 font-mono text-[0.7rem]">
            <li><span className="text-blue-700 dark:text-blue-300">status:</span>pending | in_process | completed</li>
            <li><span className="text-rose-700 dark:text-rose-300">type:</span>panic | fire | medical | on_way | here | silent</li>
            <li><span className="text-emerald-700 dark:text-emerald-300">user:</span>nombre o email</li>
            <li><span className="text-violet-700 dark:text-violet-300">org:</span>nombre de organización</li>
            <li><span className="text-slate-600 dark:text-slate-300">Texto libre</span> → busca en usuario/email</li>
          </ul>
          <div className="text-[0.65rem] text-slate-500 mt-2">Presioná Enter para crear cada chip. Backspace borra el último.</div>
          {suggestions.status && (
            <div className="mt-2 flex flex-wrap gap-1">
              {suggestions.status.map((s) => (
                <button key={s} onClick={() => { addChip(`status:${s}`); setShowHelp(false); }} className="text-[0.65rem] bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200 px-1.5 py-0.5 rounded">
                  status:{s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

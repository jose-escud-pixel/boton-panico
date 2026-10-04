// Categorías de eventos Contact ID / SIA DC-09 — usadas tanto en el editor de
// reglas por dispositivo como en el editor de reglas por marca (plantillas).
// Mantener sincronizado con backend/server.py (_DEFAULT_CID_SEVERITY,
// _DEFAULT_SIA_SEVERITY, _CID_LABELS_SEED, _SIA_LABELS_SEED).

export const EVENT_CATEGORIES_CID = [
  { prefix: "1", label: "Alarmas (E1xx)", description: "Incendio, intrusión, pánico, médico, robo", defaultSeverity: "alarm" },
  { prefix: "2", label: "Bypass / Supervisión (E2xx)", description: "Zonas desactivadas, supervisión de señal", defaultSeverity: "warning" },
  { prefix: "3", label: "Problemas / Trouble (E3xx)", description: "Batería baja, fallo AC, tamper, desconexión TCP/IP (E381)", defaultSeverity: "info" },
  { prefix: "4", label: "Apertura / Cierre (E4xx)", description: "Armado, desarmado, acceso de usuarios", defaultSeverity: "ignore" },
  { prefix: "5", label: "Robo / Duress (E5xx)", description: "Coacción y eventos de robo", defaultSeverity: "warning" },
  { prefix: "6", label: "Test / Mantenimiento (E6xx)", description: "Prueba periódica, reset de sistema", defaultSeverity: "ignore" },
];

export const EVENT_CATEGORIES_SIA = [
  { prefix: "B", label: "Intrusión SIA (BA, BV, BD...)", description: "Zona disparada (BA=intrusión, BV=verificación, BD=apertura zona)", defaultSeverity: "alarm" },
  { prefix: "F", label: "Incendio SIA (FA, FT, FH...)", description: "Alarma de fuego y detectores de humo", defaultSeverity: "alarm" },
  { prefix: "M", label: "Médico SIA (MA, ME)", description: "Alarma médica y emergencia", defaultSeverity: "alarm" },
  { prefix: "P", label: "Pánico SIA (PA, PH, PB...)", description: "Botón de pánico, hold-up", defaultSeverity: "alarm" },
  { prefix: "H", label: "Emergencia SIA (HU, HA)", description: "Emergencia y hold-up", defaultSeverity: "alarm" },
  { prefix: "S", label: "Alarma social SIA (SA)", description: "Alarma social", defaultSeverity: "alarm" },
  { prefix: "G", label: "Alarma general SIA (GA)", description: "Alarma general del panel", defaultSeverity: "alarm" },
  { prefix: "W", label: "Agua / inundación SIA (WA)", description: "Sensor de agua", defaultSeverity: "alarm" },
  { prefix: "Z", label: "Zona SIA (ZA)", description: "Alarma de zona", defaultSeverity: "alarm" },
  { prefix: "A", label: "Energía SIA (AT, AR)", description: "AT=corte de energía, AR=restauración eléctrica", defaultSeverity: "info" },
  { prefix: "T", label: "Tamper SIA (TA, TR)", description: "TA=manipulación física del panel, TR=restaurado", defaultSeverity: "info" },
  { prefix: "Y", label: "Comunicación SIA (YX, YS, YR)", description: "YX=fallo de ruta, YS=pérdida señal, YR=restauración", defaultSeverity: "info" },
  { prefix: "CL", label: "Cierre / Armado (CL)", description: "Código SIA típico de 'armado' en varios paneles — no todos lo usan literal, verificá abajo en \"Armado / Desarmado\" cuál manda el tuyo", defaultSeverity: "info" },
  { prefix: "OP", label: "Apertura / Desarmado (OP)", description: "Código SIA típico de 'desarmado' en varios paneles — no todos lo usan literal, verificá abajo en \"Armado / Desarmado\" cuál manda el tuyo", defaultSeverity: "info" },
  { prefix: "C", label: "Programación SIA (CS...)", description: "CS=inicio de programación", defaultSeverity: "ignore" },
  { prefix: "O", label: "Programación SIA (OS...)", description: "OS=acceso de servicio técnico", defaultSeverity: "ignore" },
  { prefix: "R", label: "Test / Restore SIA (RP, RA...)", description: "RP=test periódico automático y restauraciones generales", defaultSeverity: "ignore" },
];

export const EVENT_CATEGORIES = [...EVENT_CATEGORIES_CID, ...EVENT_CATEGORIES_SIA];

export const KNOWN_EVENT_PREFIXES = new Set(EVENT_CATEGORIES.map((c) => c.prefix));

export const SEVERITY_OPTIONS = [
  { value: "alarm", label: "Alarma", desc: "Crea alerta + push", color: "text-rose-600 dark:text-rose-400" },
  { value: "warning", label: "Advertencia", desc: "Crea alerta sin push", color: "text-amber-600 dark:text-amber-400" },
  { value: "info", label: "Informativo", desc: "Feed en vivo, sin alerta", color: "text-blue-600 dark:text-blue-400" },
  { value: "ignore", label: "Ignorar", desc: "Descarta silenciosamente", color: "text-slate-500 dark:text-slate-400" },
];

export const SEVERITY_BADGE = {
  alarm: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
  warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  info: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  ignore: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

/** Devuelve un mapa { prefix → regla } a partir de un array de EventRule. */
export function rulesToMap(rules) {
  const m = {};
  (rules || []).forEach((r) => { m[r.event_code_prefix] = r; });
  return m;
}

import React, { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import {
  Zap, Mic, MicOff, KeyRound, AlertCircle, Smartphone, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { isNative } from "../lib/nativePush";
import {
  getVoiceKeyword, setVoiceKeyword,
  startMicListener, stopMicListener, isMicListenerRunning,
} from "../lib/voicePanic";
import ChangePasswordDialog from "./ChangePasswordDialog";

export default function ClientSettingsDialog({ open, onOpenChange }) {
  const [keyword, setKeyword]     = useState("icaro");
  const [kwDraft, setKwDraft]     = useState("icaro");
  const [editingKw, setEditingKw] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [micLoading, setMicLoading] = useState(false);
  const [pwdOpen, setPwdOpen]     = useState(false);

  // Al abrir: cargar estado actual
  useEffect(() => {
    if (!open) return;
    const kw = getVoiceKeyword();
    setKeyword(kw);
    setKwDraft(kw);
    setEditingKw(false);

    if (isNative()) {
      isMicListenerRunning().then(setMicActive);
    }
  }, [open]);

  // ── Keyword ──────────────────────────────────────────────────────────────────

  const saveKeyword = useCallback(() => {
    const clean = kwDraft.trim().toLowerCase();
    if (!clean) return;
    setVoiceKeyword(clean);
    setKeyword(clean);
    setEditingKw(false);
    toast.success(`Palabra clave guardada: "${clean}"`);
  }, [kwDraft]);

  // ── Toggle mic ────────────────────────────────────────────────────────────────

  const toggleMic = useCallback(async () => {
    if (micLoading || !isNative()) return;
    setMicLoading(true);
    try {
      if (micActive) {
        await stopMicListener();
        setMicActive(false);
        toast.success("Escucha de voz desactivada");
      } else {
        const ok = await startMicListener(keyword);
        if (ok) {
          setMicActive(true);
          toast.success(`Escucha activa — decí "${keyword}" para enviar pánico`);
        } else {
          toast.error("No se pudo activar la escucha de voz");
        }
      }
    } finally {
      setMicLoading(false);
    }
  }, [micActive, micLoading, keyword]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-white border-slate-200 rounded-lg max-w-md max-h-[90vh] overflow-y-auto"
        data-testid="client-settings-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <Zap className="w-5 h-5 text-rose-600" strokeWidth={1.8} />
            Configuración
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* ══ ESCUCHA DE VOZ ══════════════════════════════════════════════ */}
          <div className="border border-slate-200 rounded-lg p-4">

            {/* Header con toggle */}
            <div className="flex items-start gap-3 mb-4">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 border ${
                micActive
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-slate-50 border-slate-200"
              }`}>
                {micActive
                  ? <Mic className="w-5 h-5 text-emerald-600" strokeWidth={1.8} />
                  : <MicOff className="w-5 h-5 text-slate-400" strokeWidth={1.8} />
                }
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    Escucha de voz
                    {micActive && (
                      <span className="text-[0.65rem] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold animate-pulse">
                        ACTIVA
                      </span>
                    )}
                  </div>

                  {/* Toggle switch */}
                  <button
                    onClick={toggleMic}
                    disabled={!isNative() || micLoading}
                    aria-label={micActive ? "Desactivar escucha de voz" : "Activar escucha de voz"}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-rose-300 ${
                      micActive ? "bg-emerald-500" : "bg-slate-300"
                    } ${(!isNative() || micLoading) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    {micLoading ? (
                      <Loader2 className="absolute left-1 w-4 h-4 text-white animate-spin" strokeWidth={2} />
                    ) : (
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                        micActive ? "translate-x-6" : "translate-x-1"
                      }`} />
                    )}
                  </button>
                </div>

                <div className="text-xs text-slate-500 mt-1">
                  {micActive
                    ? <>Escuchando... decí <span className="font-semibold text-slate-700">"{keyword}"</span> para enviar pánico</>
                    : "Activá para que el teléfono detecte tu palabra clave"
                  }
                </div>
              </div>
            </div>

            {/* Aviso si no es app nativa */}
            {!isNative() && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3 mb-4">
                <Smartphone className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={1.8} />
                <span>Esta función requiere la app Android instalada en el celular.</span>
              </div>
            )}

            {/* Palabra clave */}
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-1.5">Tu palabra secreta</div>
              {editingKw ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={kwDraft}
                    onChange={e => setKwDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") saveKeyword();
                      if (e.key === "Escape") setEditingKw(false);
                    }}
                    className="flex-1 text-sm border border-slate-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                    placeholder="ej: socorro, auxilio, alerta..."
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={saveKeyword}
                    className="bg-rose-600 hover:bg-rose-500 text-white text-xs px-3"
                  >
                    Guardar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingKw(false)}
                    className="text-xs px-3"
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm font-mono font-semibold text-rose-700">
                    "{keyword}"
                  </div>
                  <button
                    onClick={() => { setKwDraft(keyword); setEditingKw(true); }}
                    className="text-xs text-slate-500 hover:text-slate-700 underline flex-shrink-0"
                  >
                    Cambiar
                  </button>
                </div>
              )}
              <p className="text-[0.65rem] text-slate-400 mt-1.5">
                Elegí una palabra que no uses en conversaciones normales.
              </p>
            </div>

            {/* Nota de privacidad */}
            <div className="flex items-start gap-2 mt-4 text-[0.65rem] text-slate-400">
              <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" strokeWidth={1.8} />
              <span>
                El micrófono escucha en ciclos cortos solo mientras esta opción esté activa.
                Al desactivarla el micrófono se libera completamente.
                Requiere conexión a internet para el reconocimiento de voz.
              </span>
            </div>
          </div>

          {/* ══ CAMBIAR CONTRASEÑA ══════════════════════════════════════════ */}
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <KeyRound className="w-5 h-5 text-slate-700" strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900">Cambiar contraseña</div>
                <div className="text-xs text-slate-500 mt-1">
                  Actualizá la contraseña de tu cuenta. Necesitás conocer la actual.
                </div>
              </div>
            </div>
            <Button
              onClick={() => setPwdOpen(true)}
              variant="outline"
              className="w-full border-slate-300 text-slate-700 hover:bg-slate-50 rounded-md"
              data-testid="open-change-password-client"
            >
              <KeyRound className="w-4 h-4 mr-2" strokeWidth={1.8} />
              Cambiar mi contraseña
            </Button>
          </div>
        </div>

        <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
      </DialogContent>
    </Dialog>
  );
}

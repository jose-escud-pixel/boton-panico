import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Zap, Power, AlertCircle, CheckCircle2, Smartphone, KeyRound } from "lucide-react";
import { toast } from "sonner";
import {
  isPowerButtonSupported,
  getPowerButtonPref,
  enablePowerButton,
  disablePowerButton,
} from "../lib/powerButtonPanic";
import ChangePasswordDialog from "./ChangePasswordDialog";

export default function ClientSettingsDialog({ open, onOpenChange }) {
  const [powerEnabled, setPowerEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const supported = isPowerButtonSupported();

  useEffect(() => {
    if (open) setPowerEnabled(getPowerButtonPref());
  }, [open]);

  const togglePower = async () => {
    if (!supported) {
      toast.error("Esta función solo funciona en la app Android instalada.");
      return;
    }
    setBusy(true);
    const res = powerEnabled ? await disablePowerButton() : await enablePowerButton();
    setBusy(false);
    if (res.ok) {
      setPowerEnabled(!powerEnabled);
      toast.success(
        !powerEnabled
          ? "Pánico por botón de encendido ACTIVADO"
          : "Pánico por botón de encendido DESACTIVADO"
      );
    } else {
      toast.error(
        res.reason === "unsupported"
          ? "Solo disponible en la app Android"
          : `Error: ${res.error || res.reason}`
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-slate-200 rounded-lg max-w-md" data-testid="client-settings-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <Zap className="w-5 h-5 text-rose-600" strokeWidth={1.8} />
            Configuración
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Power Button Panic */}
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center flex-shrink-0">
                <Power className="w-5 h-5 text-rose-600" strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900">
                  Pánico por botón de encendido
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Presiona 4 veces el botón de encendido del celular en 4 segundos para disparar
                  una alerta de pánico automáticamente, incluso con la pantalla bloqueada y el
                  celular en el bolsillo.
                </div>
              </div>
            </div>

            {!supported && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3 mb-3">
                <Smartphone className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={1.8} />
                <span>
                  Esta función solo funciona desde la app Android. Instalala desde el botón "Descargar App Android" en la pantalla de login.
                </span>
              </div>
            )}

            {supported && powerEnabled && (
              <div className="flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-3 mb-3">
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={1.8} />
                <span>
                  Vigilancia activa. Verás una notificación permanente "ÑACURUTU vigilando" en tu celular — es normal, no la cierres.
                </span>
              </div>
            )}

            {supported && !powerEnabled && (
              <div className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md p-3 mb-3">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={1.8} />
                <span>
                  Al activar, la app mostrará una notificación permanente y usará batería adicional.
                </span>
              </div>
            )}

            <Button
              onClick={togglePower}
              disabled={!supported || busy}
              className={`w-full ${
                powerEnabled
                  ? "bg-slate-600 hover:bg-slate-500"
                  : "bg-rose-600 hover:bg-rose-500"
              } text-white rounded-md`}
              data-testid="toggle-power-button-panic"
            >
              {busy ? "Procesando..." : powerEnabled ? "Desactivar" : "Activar"}
            </Button>
          </div>

          {/* Cambiar contraseña */}
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                <KeyRound className="w-5 h-5 text-slate-700" strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900">
                  Cambiar contraseña
                </div>
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

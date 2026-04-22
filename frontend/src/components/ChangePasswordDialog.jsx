import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { KeyRound, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "../lib/api";

/**
 * Diálogo universal de cambio de contraseña para el usuario autenticado.
 * Funciona para cualquier rol: super_admin, admin, client.
 *
 * POST /api/auth/change-password
 *   body: { current_password, new_password }
 *   responde 200 {ok:true} o 4xx {detail:"..."}
 */
export default function ChangePasswordDialog({ open, onOpenChange }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const reset = () => {
    setCurrent(""); setNext(""); setConfirm("");
    setShow1(false); setShow2(false); setErr("");
  };

  const handleClose = (v) => {
    if (!v) reset();
    onOpenChange?.(v);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    if (next.length < 6) { setErr("La nueva contraseña debe tener al menos 6 caracteres"); return; }
    if (next !== confirm) { setErr("Las contraseñas no coinciden"); return; }
    if (next === current) { setErr("La nueva contraseña debe ser distinta de la actual"); return; }
    setLoading(true);
    try {
      await api.post("/auth/change-password", {
        current_password: current,
        new_password: next,
      });
      toast.success("Contraseña actualizada con éxito");
      reset();
      onOpenChange?.(false);
    } catch (ex) {
      setErr(formatApiError(ex.response?.data?.detail) || ex.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 rounded-lg max-w-md"
        data-testid="change-password-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
            <KeyRound className="w-5 h-5 text-rose-600" strokeWidth={1.8} />
            Cambiar contraseña
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2" autoComplete="off">
          <div className="space-y-1.5">
            <Label htmlFor="cp-current" className="text-xs text-slate-600 dark:text-slate-300">
              Contraseña actual
            </Label>
            <Input
              id="cp-current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoComplete="current-password"
              data-testid="cp-current-input"
              className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-next" className="text-xs text-slate-600 dark:text-slate-300">
              Nueva contraseña (mín. 6 caracteres)
            </Label>
            <div className="relative">
              <Input
                id="cp-next"
                type={show1 ? "text" : "password"}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                data-testid="cp-next-input"
                className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white pr-10"
              />
              <button
                type="button"
                onClick={() => setShow1((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"
                tabIndex={-1}
                data-testid="cp-toggle-next"
              >
                {show1 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-confirm" className="text-xs text-slate-600 dark:text-slate-300">
              Repetí la nueva contraseña
            </Label>
            <div className="relative">
              <Input
                id="cp-confirm"
                type={show2 ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                data-testid="cp-confirm-input"
                className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white pr-10"
              />
              <button
                type="button"
                onClick={() => setShow2((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"
                tabIndex={-1}
                data-testid="cp-toggle-confirm"
              >
                {show2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {err && (
            <div
              className="text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900 rounded-md p-2"
              data-testid="cp-error"
            >
              {err}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-rose-600 hover:bg-rose-500 text-white"
            data-testid="cp-submit"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Actualizando...
              </>
            ) : (
              "Actualizar contraseña"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

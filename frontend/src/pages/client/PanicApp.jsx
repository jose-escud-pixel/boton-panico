import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import api, { formatApiError } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
import { OwlLogo } from "../../components/OwlLogo";
import {
  Mic,
  MicOff,
  Image as ImageIcon,
  X,
  LogOut,
  ShieldCheck,
  Loader2,
  Clock,
  CheckCircle2,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

export default function PanicApp() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [org, setOrg] = useState(null);
  const [sending, setSending] = useState(false);
  const [normalOpen, setNormalOpen] = useState(false);
  const [shake, setShake] = useState(false);
  const [flash, setFlash] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Normal alert form state
  const [message, setMessage] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [audioDataUrl, setAudioDataUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const loadOrg = useCallback(async () => {
    try {
      const { data } = await api.get("/organizations");
      const mine = data.find((o) => o.id === user?.organization_id) || data[0];
      setOrg(mine);
    } catch {}
  }, [user]);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get("/alerts?limit=20");
      setHistory(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadOrg();
    loadHistory();
  }, [loadOrg, loadHistory]);

  const getLocation = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            type: "Point",
            coordinates: [pos.coords.longitude, pos.coords.latitude],
          }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 6000 }
      );
    });

  const triggerVisualFeedback = () => {
    setShake(true);
    setFlash(true);
    setTimeout(() => setShake(false), 500);
    setTimeout(() => setFlash(false), 200);
    if (navigator.vibrate) navigator.vibrate([100, 50, 200]);
  };

  const sendSilent = async () => {
    if (sending) return;
    setSending(true);
    triggerVisualFeedback();
    try {
      const location = await getLocation();
      await api.post("/alerts", { type: "silent", location });
      toast.success("Alerta silenciosa enviada", {
        description: "Ayuda en camino. Mantén la calma.",
      });
      loadHistory();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setSending(false);
    }
  };

  const onPickImage = (file) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Imagen demasiado grande (máx 3MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setImageDataUrl(ev.target.result);
    reader.readAsDataURL(file);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = (ev) => setAudioDataUrl(ev.target.result);
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast.error("No se pudo acceder al micrófono");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const sendNormal = async () => {
    if (sending) return;
    setSending(true);
    try {
      const location = await getLocation();
      await api.post("/alerts", {
        type: "normal",
        message: message || null,
        image_url: imageDataUrl || null,
        audio_url: audioDataUrl || null,
        location,
      });
      toast.success("Alerta enviada exitosamente", {
        description: "Tu información llegó al centro de mando.",
      });
      setNormalOpen(false);
      setMessage("");
      setImageDataUrl("");
      setAudioDataUrl("");
      loadHistory();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setSending(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div
      className={`min-h-screen bg-zinc-950 text-white flex flex-col ${shake ? "shake" : ""}`}
      data-testid="client-panic-app"
    >
      {flash && <div className="fixed inset-0 bg-white/10 z-50 pointer-events-none" />}

      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-zinc-900">
        <div className="flex items-center gap-3">
          {org?.logo_url ? (
            <img src={org.logo_url} alt="logo" className="w-10 h-10 rounded-sm object-cover border border-zinc-800" />
          ) : (
            <OwlLogo size={40} />
          )}
          <div>
            <h1 className="font-heading font-bold text-sm tracking-tight leading-tight">
              {org?.name || "ÑACURUTU SEGURIDAD"}
            </h1>
            <p className="overline text-[0.6rem] mt-0.5">{user?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHistoryOpen(true)}
            className="text-zinc-400 hover:text-white"
            data-testid="open-history-button"
          >
            <History className="w-5 h-5" strokeWidth={1.5} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-zinc-400 hover:text-white"
            data-testid="client-logout-button"
          >
            <LogOut className="w-5 h-5" strokeWidth={1.5} />
          </Button>
        </div>
      </header>

      {/* Main panic area */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 relative">
        {/* Ripple rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-64 h-64">
            <div className="absolute inset-0 rounded-full bg-rose-600/20 ripple-ring" />
            <div className="absolute inset-0 rounded-full bg-rose-600/20 ripple-ring ripple-ring-delay-1" />
            <div className="absolute inset-0 rounded-full bg-rose-600/20 ripple-ring ripple-ring-delay-2" />
          </div>
        </div>

        <p className="overline mb-6 text-zinc-500">Presiona para enviar alerta</p>

        <button
          onClick={sendSilent}
          disabled={sending}
          className="relative z-10 w-56 h-56 md:w-64 md:h-64 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-95 transition-transform duration-100 flex flex-col items-center justify-center border-4 border-rose-500 shadow-[0_0_64px_rgba(225,29,72,0.5)] focus:outline-none focus:ring-4 focus:ring-rose-500/40"
          data-testid="panic-button-silent"
        >
          {sending ? (
            <Loader2 className="w-12 h-12 animate-spin" />
          ) : (
            <>
              <span className="font-display text-4xl md:text-5xl uppercase tracking-wider leading-none">
                SOS
              </span>
              <span className="text-xs mt-2 uppercase tracking-[0.3em] text-rose-100">
                Silenciosa
              </span>
            </>
          )}
        </button>

        <p className="text-xs text-zinc-500 mt-6 text-center max-w-xs">
          Tu ubicación se envía automáticamente. Mantén la calma.
        </p>

        <Button
          onClick={() => setNormalOpen(true)}
          variant="outline"
          className="mt-8 border-amber-900 text-amber-400 hover:bg-amber-950 hover:text-amber-300 rounded-sm"
          data-testid="open-normal-alert-button"
        >
          <ShieldCheck className="w-4 h-4 mr-2" strokeWidth={1.5} />
          Enviar alerta con detalles
        </Button>
      </main>

      <footer className="p-4 border-t border-zinc-900 text-center">
        <p className="text-[0.65rem] text-zinc-600 font-mono-tactical">
          ÑACURUTU · Vigilancia 24/7
        </p>
      </footer>

      {/* Normal alert dialog */}
      <Dialog open={normalOpen} onOpenChange={setNormalOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-md max-w-md" data-testid="normal-alert-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">Enviar alerta detallada</DialogTitle>
            <DialogDescription className="text-zinc-500 text-xs">
              Agrega contexto para ayudar al equipo de respuesta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="overline block mb-1.5">Mensaje</label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe la situación..."
                className="bg-zinc-900 border-zinc-800 rounded-sm min-h-[100px]"
                data-testid="normal-alert-message"
              />
            </div>

            <div>
              <label className="overline block mb-1.5">Imagen (opcional)</label>
              {imageDataUrl && (
                <div className="relative mb-2">
                  <img src={imageDataUrl} alt="preview" className="max-h-40 rounded-sm border border-zinc-800" />
                  <button
                    onClick={() => setImageDataUrl("")}
                    className="absolute top-1 right-1 bg-zinc-900/90 rounded-sm p-1 text-zinc-300 hover:text-white"
                    type="button"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <label className="cursor-pointer">
                <div className="flex items-center justify-center gap-2 py-2 px-3 bg-zinc-900 border border-zinc-800 rounded-sm hover:bg-zinc-800 text-sm">
                  <ImageIcon className="w-4 h-4" strokeWidth={1.5} />
                  <span>{imageDataUrl ? "Cambiar imagen" : "Subir imagen"}</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onPickImage(e.target.files?.[0])}
                  data-testid="normal-alert-image-input"
                />
              </label>
            </div>

            <div>
              <label className="overline block mb-1.5">Audio (opcional)</label>
              {audioDataUrl && !recording && (
                <audio src={audioDataUrl} controls className="w-full mb-2" />
              )}
              {!recording ? (
                <Button
                  type="button"
                  onClick={startRecording}
                  variant="outline"
                  className="w-full border-zinc-800 bg-zinc-900 hover:bg-zinc-800 rounded-sm"
                  data-testid="normal-alert-record-button"
                >
                  <Mic className="w-4 h-4 mr-2" strokeWidth={1.5} />
                  {audioDataUrl ? "Regrabar audio" : "Grabar audio"}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={stopRecording}
                  className="w-full bg-rose-600 hover:bg-rose-500 rounded-sm animate-pulse"
                  data-testid="normal-alert-stop-button"
                >
                  <MicOff className="w-4 h-4 mr-2" strokeWidth={1.5} />
                  Detener grabación
                </Button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setNormalOpen(false)} className="rounded-sm">
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={sendNormal}
              disabled={sending}
              className="bg-rose-600 hover:bg-rose-500 rounded-sm"
              data-testid="normal-alert-send-button"
            >
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Enviar alerta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-md max-w-md" data-testid="client-history-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">Mi historial</DialogTitle>
            <DialogDescription className="text-zinc-500 text-xs">
              Últimas alertas enviadas
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar space-y-2">
            {history.length === 0 && (
              <div className="text-zinc-600 text-sm py-6 text-center">
                Aún no has enviado alertas
              </div>
            )}
            {history.map((a) => {
              const StatusIcon =
                a.status === "completed"
                  ? CheckCircle2
                  : a.status === "in_process"
                  ? Clock
                  : Loader2;
              const color =
                a.status === "completed"
                  ? "text-emerald-400"
                  : a.status === "in_process"
                  ? "text-amber-400"
                  : "text-rose-400";
              return (
                <div
                  key={a.id}
                  className="p-3 border border-zinc-800 bg-zinc-900 rounded-sm"
                  data-testid="client-history-item"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-heading font-semibold text-sm uppercase">
                      {a.type === "silent" ? "Silenciosa" : "Normal"}
                    </span>
                    <div className={`flex items-center gap-1 ${color}`}>
                      <StatusIcon className="w-3 h-3" strokeWidth={1.5} />
                      <span className="text-[0.65rem] uppercase tracking-wide">
                        {a.status === "in_process" ? "En proceso" : a.status === "completed" ? "Completada" : "Pendiente"}
                      </span>
                    </div>
                  </div>
                  {a.message && <p className="text-xs text-zinc-400 mb-1">{a.message}</p>}
                  <p className="text-[0.65rem] text-zinc-600 font-mono-tactical">
                    {formatDistanceToNow(new Date(a.timestamp), { addSuffix: true, locale: es })}
                  </p>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

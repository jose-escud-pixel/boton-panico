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
  Loader2,
  History,
  Flame,
  HeartPulse,
  Navigation,
  MapPin,
  Siren,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

const ALERT_TYPES = {
  panic:   { label: "PÁNICO",       Icon: Siren,       tone: "panic",  voice: "Pánico" },
  fire:    { label: "INCENDIO",     Icon: Flame,       tone: "fire",   voice: "Fuego" },
  medical: { label: "ASISTENCIA",   Icon: HeartPulse,  tone: "medical", voice: "Asistencia" },
  on_way:  { label: "EN CAMINO",    Icon: Navigation,  tone: "onway",  voice: "En camino" },
  here:    { label: "ESTOY AQUÍ",   Icon: MapPin,      tone: "here",   voice: "Estoy aquí" },
};

const TONE_CLASSES = {
  fire:    { icon: "text-orange-600",  label: "text-slate-700" },
  medical: { icon: "text-emerald-600", label: "text-slate-700" },
  onway:   { icon: "text-sky-600",     label: "text-slate-700" },
  here:    { icon: "text-violet-600",  label: "text-slate-700" },
};

export default function PanicApp() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [org, setOrg] = useState(null);
  const [sending, setSending] = useState(false);
  const [detailsType, setDetailsType] = useState(null); // which type's detail modal is open
  const [shake, setShake] = useState(false);
  const [flash, setFlash] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);

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
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Tu navegador no soporta geolocalización"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            type: "Point",
            coordinates: [pos.coords.longitude, pos.coords.latitude],
          }),
        (err) => reject(new Error("Debes permitir el acceso a tu ubicación para enviar una alerta")),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    });

  const triggerVisualFeedback = () => {
    setShake(true);
    setFlash(true);
    setTimeout(() => setShake(false), 500);
    setTimeout(() => setFlash(false), 200);
    if (navigator.vibrate) navigator.vibrate([100, 50, 200]);
  };

  /** Envío rápido (un solo tap) — sólo ubicación + tipo */
  const sendQuick = async (type) => {
    if (sending) return;
    setSending(true);
    triggerVisualFeedback();
    try {
      const location = await getLocation();
      await api.post("/alerts", { type, location });
      toast.success(`Alerta de ${ALERT_TYPES[type].voice.toLowerCase()} enviada`, {
        description: "Tu ubicación fue transmitida al centro de mando.",
      });
      loadHistory();
    } catch (e) {
      toast.error(e.response ? formatApiError(e.response?.data?.detail) : e.message);
    } finally {
      setSending(false);
    }
  };

  const openDetails = (type) => {
    setDetailsType(type);
    setMessage("");
    setImageDataUrl("");
    setAudioDataUrl("");
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

  const sendWithDetails = async () => {
    if (!detailsType || sending) return;
    setSending(true);
    try {
      const location = await getLocation();
      await api.post("/alerts", {
        type: detailsType,
        message: message || null,
        image_url: imageDataUrl || null,
        audio_url: audioDataUrl || null,
        location,
      });
      toast.success("Alerta enviada con detalles");
      setDetailsType(null);
      loadHistory();
    } catch (e) {
      toast.error(e.response ? formatApiError(e.response?.data?.detail) : e.message);
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
      className={`min-h-screen client-bg text-slate-900 flex flex-col ${shake ? "shake" : ""}`}
      data-testid="client-panic-app"
    >
      {flash && <div className="fixed inset-0 bg-white/40 z-50 pointer-events-none" />}

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white/60 backdrop-blur border-b border-slate-200">
        <div className="flex items-center gap-3 min-w-0">
          {org?.logo_url ? (
            <img
              src={org.logo_url}
              alt="logo"
              className="w-11 h-11 rounded-md object-cover border border-slate-200"
            />
          ) : (
            <OwlLogo size={44} />
          )}
          <div className="min-w-0">
            <h1 className="font-heading font-bold text-sm tracking-tight leading-tight truncate">
              {org?.name || "ÑACURUTU SEGURIDAD"}
            </h1>
            <p className="text-[0.7rem] text-slate-500 truncate">{user?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHistoryOpen(true)}
            className="text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            data-testid="open-history-button"
          >
            <History className="w-5 h-5" strokeWidth={1.8} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            data-testid="client-logout-button"
          >
            <LogOut className="w-5 h-5" strokeWidth={1.8} />
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col px-4 pt-6 pb-6 max-w-md w-full mx-auto">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-heading text-xl font-bold tracking-tight text-slate-900">
            Mis alarmas
          </h2>
          <span className="overline text-[0.6rem]">Un toque envía</span>
        </div>
        <div className="h-px bg-slate-300 mb-5" />

        {/* BIG PANIC BUTTON */}
        <div className="relative mb-5">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-full h-full">
              <div className="absolute inset-0 rounded-2xl bg-rose-500/20 ripple-ring" />
              <div className="absolute inset-0 rounded-2xl bg-rose-500/20 ripple-ring ripple-ring-delay-1" />
            </div>
          </div>
          <button
            onClick={() => sendQuick("panic")}
            onContextMenu={(e) => { e.preventDefault(); openDetails("panic"); }}
            disabled={sending}
            className="relative w-full h-40 rounded-2xl alert-tile alert-tile-panic flex items-center justify-center gap-4 focus:outline-none focus:ring-4 focus:ring-rose-400"
            data-testid="panic-button-panic"
          >
            {sending ? (
              <Loader2 className="w-12 h-12 animate-spin" />
            ) : (
              <>
                <div className="bg-white/95 text-rose-600 rounded-xl px-3 py-2 font-display text-3xl leading-none">
                  SOS
                </div>
                <span className="font-heading text-4xl font-bold tracking-wide">PÁNICO</span>
              </>
            )}
          </button>
        </div>

        {/* GRID 2x2 de alarmas */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {["fire", "medical", "on_way", "here"].map((k) => {
            const { label, Icon, tone } = ALERT_TYPES[k];
            const cls = TONE_CLASSES[tone];
            return (
              <button
                key={k}
                onClick={() => sendQuick(k)}
                onContextMenu={(e) => { e.preventDefault(); openDetails(k); }}
                disabled={sending}
                className="alert-tile rounded-2xl h-32 flex flex-col items-center justify-center gap-2 disabled:opacity-60"
                data-testid={`alert-btn-${k}`}
              >
                <Icon className={`w-10 h-10 ${cls.icon}`} strokeWidth={1.8} />
                <span className={`font-heading text-sm font-semibold tracking-wide ${cls.label}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-slate-500 text-center mb-3">
          Tu ubicación se envía automáticamente. Tap = envío rápido · Mantener = agregar foto/audio
        </p>

        {/* Botón agregar detalles (alternativa accesible) */}
        <button
          onClick={() => openDetails("panic")}
          className="flex items-center justify-center gap-2 text-sm text-slate-600 hover:text-slate-900 bg-white/60 border border-slate-200 rounded-lg py-2 transition-colors"
          data-testid="open-normal-alert-button"
        >
          <Plus className="w-4 h-4" strokeWidth={1.8} />
          Enviar alerta con foto, audio o mensaje
        </button>
      </main>

      <footer className="px-4 py-3 border-t border-slate-200 bg-white/60 text-center">
        <p className="text-[0.65rem] text-slate-500 font-mono-tactical">
          ÑACURUTU · Vigilancia 24/7
        </p>
      </footer>

      {/* Details dialog */}
      <Dialog open={!!detailsType} onOpenChange={(o) => !o && setDetailsType(null)}>
        <DialogContent className="bg-white border-slate-200 rounded-lg max-w-md" data-testid="normal-alert-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight flex items-center gap-2">
              {detailsType && (() => {
                const cfg = ALERT_TYPES[detailsType];
                const Icon = cfg.Icon;
                return (
                  <>
                    <Icon className="w-5 h-5 text-rose-600" strokeWidth={1.8} />
                    Detalles — {cfg.label}
                  </>
                );
              })()}
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              La ubicación se envía automáticamente. Todo lo demás es opcional.
            </DialogDescription>
          </DialogHeader>

          {/* Selector de tipo dentro del modal */}
          <div>
            <label className="overline block mb-2">Tipo de alerta</label>
            <div className="grid grid-cols-5 gap-1.5">
              {Object.entries(ALERT_TYPES).map(([k, cfg]) => {
                const Icon = cfg.Icon;
                const active = detailsType === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDetailsType(k)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-md border transition-colors ${
                      active
                        ? "bg-rose-50 border-rose-300 text-rose-700"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                    data-testid={`dialog-type-${k}`}
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.8} />
                    <span className="text-[0.55rem] font-bold tracking-wider uppercase">
                      {cfg.label.length > 7 ? cfg.label.slice(0, 6) : cfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="overline block mb-1.5">Mensaje (opcional)</label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe la situación..."
                className="bg-white border-slate-200 rounded-md min-h-[80px]"
                data-testid="normal-alert-message"
              />
            </div>

            <div>
              <label className="overline block mb-1.5">Imagen (opcional)</label>
              {imageDataUrl && (
                <div className="relative mb-2">
                  <img src={imageDataUrl} alt="preview" className="max-h-40 rounded-md border border-slate-200" />
                  <button
                    onClick={() => setImageDataUrl("")}
                    className="absolute top-1 right-1 bg-white/95 rounded-md p-1 text-slate-700 hover:text-slate-900 border border-slate-200"
                    type="button"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <label className="cursor-pointer">
                <div className="flex items-center justify-center gap-2 py-2 px-3 bg-white border border-slate-200 rounded-md hover:bg-slate-50 text-sm text-slate-700">
                  <ImageIcon className="w-4 h-4" strokeWidth={1.8} />
                  <span>{imageDataUrl ? "Cambiar imagen" : "Subir imagen"}</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
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
                  className="w-full border-slate-200 bg-white hover:bg-slate-50 rounded-md text-slate-700"
                  data-testid="normal-alert-record-button"
                >
                  <Mic className="w-4 h-4 mr-2" strokeWidth={1.8} />
                  {audioDataUrl ? "Regrabar audio" : "Grabar audio"}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={stopRecording}
                  className="w-full bg-rose-600 hover:bg-rose-500 text-white rounded-md animate-pulse"
                  data-testid="normal-alert-stop-button"
                >
                  <MicOff className="w-4 h-4 mr-2" strokeWidth={1.8} />
                  Detener grabación
                </Button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDetailsType(null)} className="rounded-md">
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={sendWithDetails}
              disabled={sending}
              className="bg-rose-600 hover:bg-rose-500 text-white rounded-md"
              data-testid="normal-alert-send-button"
            >
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Enviar alerta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="bg-white border-slate-200 rounded-lg max-w-md" data-testid="client-history-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">Mi historial</DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              Últimas alertas que enviaste
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar space-y-2">
            {history.length === 0 && (
              <div className="text-slate-500 text-sm py-6 text-center">
                Aún no has enviado alertas
              </div>
            )}
            {history.map((a) => {
              const StatusIcon =
                a.status === "completed" ? CheckCircle2 :
                a.status === "in_process" ? Clock : AlertCircle;
              const color =
                a.status === "completed" ? "text-emerald-600" :
                a.status === "in_process" ? "text-amber-600" : "text-rose-600";
              const typeCfg = ALERT_TYPES[a.type] || { label: a.type?.toUpperCase() || "ALERTA" };
              return (
                <div
                  key={a.id}
                  className="p-3 border border-slate-200 bg-white rounded-md"
                  data-testid="client-history-item"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-heading font-semibold text-sm uppercase text-slate-800">
                      {typeCfg.label}
                    </span>
                    <div className={`flex items-center gap-1 ${color}`}>
                      <StatusIcon className="w-3 h-3" strokeWidth={1.8} />
                      <span className="text-[0.65rem] uppercase tracking-wide">
                        {a.status === "in_process" ? "En proceso" : a.status === "completed" ? "Completada" : "Pendiente"}
                      </span>
                    </div>
                  </div>
                  {a.message && <p className="text-xs text-slate-600 mb-1">{a.message}</p>}
                  <p className="text-[0.65rem] text-slate-500 font-mono-tactical">
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

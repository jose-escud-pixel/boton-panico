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
} from "../../components/ui/dialog";
import { OwlLogo } from "../../components/OwlLogo";
import {
  Mic, MicOff, Image as ImageIcon, X, LogOut, Loader2,
  History, Flame, HeartPulse, Navigation, MapPin, Siren,
  CheckCircle2, Clock, AlertCircle, Send, Ban,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { getNativeLocation, isNative } from "../../lib/nativePush";
import UpdateBanner from "../../components/UpdateBanner";

const ALERT_TYPES = {
  panic:   { label: "PÁNICO",     Icon: Siren,      accent: "rose",     voice: "Pánico" },
  fire:    { label: "INCENDIO",   Icon: Flame,      accent: "orange",   voice: "Fuego" },
  medical: { label: "ASISTENCIA", Icon: HeartPulse, accent: "emerald",  voice: "Asistencia" },
  on_way:  { label: "EN CAMINO",  Icon: Navigation, accent: "sky",      voice: "En camino" },
  here:    { label: "ESTOY AQUÍ", Icon: MapPin,     accent: "violet",   voice: "Estoy aquí" },
};

const ACCENT_CLASSES = {
  rose:    { icon: "text-rose-600",    ring: "ring-rose-500",    btn: "bg-rose-600 hover:bg-rose-500" },
  orange:  { icon: "text-orange-600",  ring: "ring-orange-500",  btn: "bg-orange-600 hover:bg-orange-500" },
  emerald: { icon: "text-emerald-600", ring: "ring-emerald-500", btn: "bg-emerald-600 hover:bg-emerald-500" },
  sky:     { icon: "text-sky-600",     ring: "ring-sky-500",     btn: "bg-sky-600 hover:bg-sky-500" },
  violet:  { icon: "text-violet-600",  ring: "ring-violet-500",  btn: "bg-violet-600 hover:bg-violet-500" },
};

const COUNTDOWN_SECONDS = 5;

export default function PanicApp() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [org, setOrg] = useState(null);
  const [sending, setSending] = useState(false);
  const [activeType, setActiveType] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [paused, setPaused] = useState(false);
  const [shake, setShake] = useState(false);
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
    // Solicitar permiso de ubicación proactivamente en nativo (Android)
    // para que el sistema muestre el diálogo al abrir la app,
    // NO cuando el usuario presiona pánico (que es tarde).
    if (isNative()) {
      (async () => {
        try {
          const { Geolocation } = await import("@capacitor/geolocation");
          const perm = await Geolocation.checkPermissions();
          if (perm.location !== "granted") {
            await Geolocation.requestPermissions();
          }
        } catch (e) {
          console.warn("No se pudo solicitar permiso de ubicación:", e);
        }
      })();
    }
  }, [loadOrg, loadHistory]);

  const getLocation = async () => {
    try {
      const loc = await getNativeLocation();
      return {
        type: "Point",
        coordinates: [loc.longitude, loc.latitude],
      };
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("denegado")) {
        throw new Error("Debes permitir el acceso a tu ubicación para enviar una alerta");
      }
      throw new Error(msg || "No se pudo obtener tu ubicación. Verificá que el GPS esté activo.");
    }
  };

  const openDialog = (type) => {
    setActiveType(type);
    setMessage("");
    setImageDataUrl("");
    setAudioDataUrl("");
    setPaused(false);
    setCountdown(type === "panic" ? COUNTDOWN_SECONDS : 0);
    if (navigator.vibrate) navigator.vibrate(50);
  };

  const closeDialog = () => {
    if (recording) stopRecording();
    setActiveType(null);
    setCountdown(0);
    setPaused(false);
    setMessage("");
    setImageDataUrl("");
    setAudioDataUrl("");
  };

  const sendAlert = useCallback(async () => {
    if (!activeType || sending) return;
    setSending(true);
    setShake(true);
    setTimeout(() => setShake(false), 500);
    if (navigator.vibrate) navigator.vibrate([100, 50, 200]);
    try {
      const location = await getLocation();
      await api.post("/alerts", {
        type: activeType,
        message: message || null,
        image_url: imageDataUrl || null,
        audio_url: audioDataUrl || null,
        location,
      });
      toast.success(`Alerta de ${ALERT_TYPES[activeType].voice.toLowerCase()} enviada`, {
        description: "Ayuda en camino. Mantén la calma.",
      });
      closeDialog();
      loadHistory();
    } catch (e) {
      toast.error(e.response ? formatApiError(e.response?.data?.detail) : e.message);
    } finally {
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType, sending, message, imageDataUrl, audioDataUrl]);

  // Countdown SÓLO para pánico. Pausa automática al pausar (paused=true).
  useEffect(() => {
    if (!activeType || activeType !== "panic") return;
    if (paused || sending) return;
    if (countdown <= 0) {
      sendAlert();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, activeType, paused, sending, sendAlert]);

  const pauseCountdown = () => {
    if (activeType === "panic" && !paused) setPaused(true);
  };

  const onPickImage = (file) => {
    pauseCountdown();
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
    pauseCountdown();
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

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const activeCfg = activeType ? ALERT_TYPES[activeType] : null;
  const accent = activeCfg ? ACCENT_CLASSES[activeCfg.accent] : null;
  const ActiveIcon = activeCfg?.Icon;
  const isPanic = activeType === "panic";

  return (
    <div
      className={`min-h-screen client-bg text-slate-900 flex flex-col ${shake ? "shake" : ""}`}
      data-testid="client-panic-app"
    >
      <UpdateBanner />
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white/60 backdrop-blur border-b border-slate-200">
        <div className="flex items-center gap-3 min-w-0">
          {org?.logo_url ? (
            <img src={org.logo_url} alt="logo" className="w-11 h-11 rounded-md object-cover border border-slate-200" />
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
          <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}
                  className="text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  data-testid="open-history-button">
            <History className="w-5 h-5" strokeWidth={1.8} />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout}
                  className="text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  data-testid="client-logout-button">
            <LogOut className="w-5 h-5" strokeWidth={1.8} />
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col px-4 pt-6 pb-6 max-w-md w-full mx-auto">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-heading text-xl font-bold tracking-tight text-slate-900">Mis alarmas</h2>
          <span className="overline text-[0.6rem]">Tap para enviar</span>
        </div>
        <div className="h-px bg-slate-300 mb-5" />

        {/* BIG PÁNICO */}
        <div className="relative mb-5">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-full h-full">
              <div className="absolute inset-0 rounded-2xl bg-rose-500/20 ripple-ring" />
              <div className="absolute inset-0 rounded-2xl bg-rose-500/20 ripple-ring ripple-ring-delay-1" />
            </div>
          </div>
          <button
            onClick={() => openDialog("panic")}
            disabled={sending}
            className="relative w-full h-40 rounded-2xl alert-tile alert-tile-panic flex items-center justify-center gap-4 focus:outline-none focus:ring-4 focus:ring-rose-400"
            data-testid="panic-button-panic"
          >
            <div className="bg-white/95 text-rose-600 rounded-xl px-3 py-2 font-display text-3xl leading-none">SOS</div>
            <span className="font-heading text-4xl font-bold tracking-wide">PÁNICO</span>
          </button>
        </div>

        {/* Grid 2x2 */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {["fire", "medical", "on_way", "here"].map((k) => {
            const { label, Icon, accent: a } = ALERT_TYPES[k];
            const ac = ACCENT_CLASSES[a];
            return (
              <button
                key={k}
                onClick={() => openDialog(k)}
                disabled={sending}
                className="alert-tile rounded-2xl h-32 flex flex-col items-center justify-center gap-2 disabled:opacity-60"
                data-testid={`alert-btn-${k}`}
              >
                <Icon className={`w-10 h-10 ${ac.icon}`} strokeWidth={1.8} />
                <span className="font-heading text-sm font-semibold tracking-wide text-slate-700">{label}</span>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-slate-500 text-center">
          Toda alerta envía tu ubicación automáticamente. Puedes agregar foto, audio y mensaje.
        </p>
      </main>

      <footer className="px-4 py-3 border-t border-slate-200 bg-white/60 text-center">
        <p className="text-[0.65rem] text-slate-500 font-mono-tactical">ÑACURUTU · Vigilancia 24/7</p>
      </footer>

      {/* ================================ */}
      {/* UNIFIED ALERT DIALOG */}
      {/* ================================ */}
      <Dialog open={!!activeType} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent
          className="bg-white border-slate-200 rounded-lg max-w-md"
          data-testid="alert-send-dialog"
          onPointerDown={() => { if (isPanic && !paused) { /* no pausar tap casual */ } }}
        >
          {activeCfg && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading tracking-tight flex items-center gap-2 text-slate-900">
                  <ActiveIcon className={`w-5 h-5 ${accent.icon}`} strokeWidth={1.8} />
                  Enviar alerta: {activeCfg.label}
                </DialogTitle>
              </DialogHeader>

              {/* COUNTDOWN (sólo pánico) */}
              {isPanic && (
                <div
                  className={`rounded-lg border p-4 flex items-center gap-4 ${
                    paused ? "bg-slate-50 border-slate-200" : "bg-rose-50 border-rose-200"
                  }`}
                  data-testid="panic-countdown-box"
                >
                  {paused ? (
                    <>
                      <Clock className="w-7 h-7 text-slate-500 shrink-0" strokeWidth={1.8} />
                      <div className="flex-1">
                        <p className="font-heading font-semibold text-slate-900">Contador en pausa</p>
                        <p className="text-xs text-slate-600">Pulsa ENVIAR cuando estés listo</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 rounded-full bg-rose-600 text-white font-display text-3xl flex items-center justify-center shrink-0">
                        {countdown}
                      </div>
                      <div className="flex-1">
                        <p className="font-heading font-semibold text-rose-900">Enviando pánico en {countdown}s</p>
                        <p className="text-xs text-rose-700">Cancela o agrega detalles si aún hay tiempo</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* BODY — mensaje + foto + audio */}
              <div className="space-y-3">
                <div>
                  <label className="overline block mb-1.5">Mensaje (opcional)</label>
                  <Textarea
                    value={message}
                    onChange={(e) => { pauseCountdown(); setMessage(e.target.value); }}
                    placeholder="Describe la situación..."
                    className="bg-white border-slate-200 rounded-md min-h-[70px]"
                    data-testid="dialog-message"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* FOTO */}
                  <label className="cursor-pointer">
                    <div className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-sm border transition-colors ${
                      imageDataUrl
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}>
                      <ImageIcon className="w-4 h-4" strokeWidth={1.8} />
                      <span className="font-semibold">{imageDataUrl ? "Foto lista" : "Agregar foto"}</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => onPickImage(e.target.files?.[0])}
                      data-testid="dialog-image-input"
                    />
                  </label>

                  {/* AUDIO */}
                  {!recording ? (
                    <button
                      type="button"
                      onClick={startRecording}
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-sm border transition-colors ${
                        audioDataUrl
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                      data-testid="dialog-record-button"
                    >
                      <Mic className="w-4 h-4" strokeWidth={1.8} />
                      <span className="font-semibold">{audioDataUrl ? "Audio listo" : "Grabar audio"}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-sm bg-rose-600 text-white animate-pulse"
                      data-testid="dialog-stop-button"
                    >
                      <MicOff className="w-4 h-4" strokeWidth={1.8} />
                      <span className="font-semibold">Detener</span>
                    </button>
                  )}
                </div>

                {/* Previews */}
                {imageDataUrl && (
                  <div className="relative">
                    <img src={imageDataUrl} alt="preview" className="max-h-32 rounded-md border border-slate-200" />
                    <button
                      onClick={() => setImageDataUrl("")}
                      className="absolute top-1 right-1 bg-white/95 rounded-md p-1 text-slate-700 border border-slate-200"
                      type="button"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {audioDataUrl && !recording && (
                  <audio src={audioDataUrl} controls className="w-full" />
                )}
              </div>

              {/* FOOTER — 2 botones grandes */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button
                  type="button"
                  onClick={closeDialog}
                  variant="outline"
                  className="h-12 border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-base"
                  data-testid="dialog-cancel-button"
                >
                  <Ban className="w-5 h-5 mr-2" strokeWidth={1.8} />
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={sendAlert}
                  disabled={sending}
                  className={`h-12 ${accent.btn} text-white rounded-lg text-base font-bold`}
                  data-testid="dialog-send-button"
                >
                  {sending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Send className="w-5 h-5 mr-2" strokeWidth={2} />}
                  Enviar
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* History */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="bg-white border-slate-200 rounded-lg max-w-md" data-testid="client-history-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-tight">Mi historial</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar space-y-2">
            {history.length === 0 && (
              <div className="text-slate-500 text-sm py-6 text-center">Aún no has enviado alertas</div>
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
                <div key={a.id} className="p-3 border border-slate-200 bg-white rounded-md" data-testid="client-history-item">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-heading font-semibold text-sm uppercase text-slate-800">{typeCfg.label}</span>
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

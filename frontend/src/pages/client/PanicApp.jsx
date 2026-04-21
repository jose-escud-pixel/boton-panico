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
  History, Flame, HeartPulse, Wrench, MapPin, Siren,
  CheckCircle2, Clock, AlertCircle, Send, Ban, Settings, Sun, Moon,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { getNativeLocation, isNative } from "../../lib/nativePush";
import { applyPowerButtonPref } from "../../lib/powerButtonPanic";
import { readDeviceInfo, bindDeviceToBackend } from "../../lib/deviceBind";
import { useTheme } from "../../context/ThemeContext";
import ClientSettingsDialog from "../../components/ClientSettingsDialog";
import UpdateBanner from "../../components/UpdateBanner";
import VersionBadge from "../../components/VersionBadge";
import SponsorContacts from "../../components/SponsorContacts";

const ALERT_TYPES = {
  panic:   { label: "SOS",        Icon: Siren,      accent: "rose",     voice: "Pánico" },
  fire:    { label: "INCENDIO",   Icon: Flame,      accent: "orange",   voice: "Fuego" },
  medical: { label: "ASISTENCIA", Icon: HeartPulse, accent: "emerald",  voice: "Asistencia" },
  on_way:  { label: "UTILIDADES", Icon: Wrench,     accent: "sky",      voice: "Utilidades" },
  here:    { label: "ESTOY AQUÍ", Icon: MapPin,     accent: "violet",   voice: "Estoy aquí" },
};

const ACCENT_CLASSES = {
  rose:    { icon: "text-rose-500",    ring: "ring-rose-500",    btn: "bg-rose-600 hover:bg-rose-500" },
  orange:  { icon: "text-orange-500",  ring: "ring-orange-500",  btn: "bg-orange-600 hover:bg-orange-500" },
  emerald: { icon: "text-emerald-500", ring: "ring-emerald-500", btn: "bg-emerald-600 hover:bg-emerald-500" },
  sky:     { icon: "text-sky-500",     ring: "ring-sky-500",     btn: "bg-sky-600 hover:bg-sky-500" },
  violet:  { icon: "text-violet-500",  ring: "ring-violet-500",  btn: "bg-violet-600 hover:bg-violet-500" },
};

// Gradientes por tipo (para cards)
const TILE_GRADIENTS = {
  orange:  { light: "from-orange-50 to-orange-100",    dark: "from-orange-900/40 to-rose-900/30" },
  emerald: { light: "from-emerald-50 to-teal-100",      dark: "from-emerald-900/40 to-cyan-900/30" },
  sky:     { light: "from-sky-50 to-indigo-100",        dark: "from-sky-900/40 to-indigo-900/30" },
  violet:  { light: "from-violet-50 to-purple-100",     dark: "from-violet-900/40 to-fuchsia-900/30" },
};

const COUNTDOWN_SECONDS = 5;

export default function PanicApp() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [org, setOrg] = useState(null);
  const [sending, setSending] = useState(false);
  const [activeType, setActiveType] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [paused, setPaused] = useState(false);
  const [shake, setShake] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
      // Si el usuario tenía activado el "power button panic", lo re-arrancamos
      // (el servicio se mata en reboots del teléfono).
      applyPowerButtonPref();

      // Device binding: primera vez que abre la app tras login se captura
      // info del teléfono y se vincula al usuario. Si el servidor detecta
      // que la cuenta ya está ligada a otro device → 423 Locked y cerramos sesión.
      (async () => {
        const info = await readDeviceInfo();
        if (!info) return;
        const api = (await import("../../lib/api")).default;
        const res = await bindDeviceToBackend(api);
        if (!res.ok && res.status === 423) {
          toast.error(res.detail || "Esta cuenta está vinculada a otro dispositivo.");
          setTimeout(() => {
            logout();
            navigate("/login");
          }, 1500);
        }
      })();
    }
  }, [loadOrg, loadHistory, logout, navigate]);

  // Deep link listener: cuando el servicio nativo dispara 5 presiones del
  // power button, abre la app con URL `nacurutu://panic?source=power_button`.
  // Al detectarla, disparamos pánico automáticamente.
  useEffect(() => {
    if (!isNative()) return;
    let listenerHandle = null;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        listenerHandle = await App.addListener("appUrlOpen", (event) => {
          if (event?.url && event.url.startsWith("nacurutu://panic")) {
            // Dispara pánico SIN countdown (emergencia real)
            triggerPowerButtonPanic();
          }
        });
      } catch (e) {
        console.warn("No se pudo registrar listener de deep link:", e);
      }
    })();
    return () => {
      try { listenerHandle?.remove?.(); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Dispara pánico INMEDIATO sin countdown ni dialog (llamado desde deep link
  // cuando el usuario presionó 5 veces el botón de encendido).
  const triggerPowerButtonPanic = useCallback(async () => {
    if (sending) return;
    setSending(true);
    setShake(true);
    setTimeout(() => setShake(false), 500);
    if (navigator.vibrate) navigator.vibrate([200, 100, 400]);
    try {
      const location = await getLocation();
      await api.post("/alerts", {
        type: "panic",
        message: "Pánico automático (botón de encendido x4)",
        image_url: null,
        audio_url: null,
        location,
      });
      toast.success("Pánico enviado por botón de encendido", {
        description: "Ayuda en camino. Mantén la calma.",
      });
      loadHistory();
    } catch (e) {
      toast.error(e.response ? formatApiError(e.response?.data?.detail) : e.message);
    } finally {
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sending]);

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
      className={`min-h-screen flex flex-col transition-colors duration-300 ${
        isDark
          ? "bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100"
          : "bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900"
      } ${shake ? "shake" : ""}`}
      data-testid="client-panic-app"
    >
      <UpdateBanner />

      {/* ========== HEADER ========== */}
      <header
        className={`sticky top-0 z-20 backdrop-blur-xl border-b ${
          isDark ? "bg-slate-900/60 border-slate-800" : "bg-white/70 border-slate-200"
        }`}
      >
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {org?.logo_url ? (
              <img
                src={org.logo_url}
                alt="logo"
                className={`w-11 h-11 rounded-xl object-cover border shadow-sm ${
                  isDark ? "border-slate-700" : "border-slate-200"
                }`}
              />
            ) : (
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-sm ${
                isDark ? "bg-slate-800 border border-slate-700" : "bg-white border border-slate-200"
              }`}>
                <OwlLogo size={36} />
              </div>
            )}
            <div className="min-w-0">
              <h1 className={`font-heading font-bold text-sm tracking-tight leading-tight truncate ${
                isDark ? "text-white" : "text-slate-900"
              }`}>
                {org?.name || "ÑACURUTU SEGURIDAD"}
              </h1>
              <p className={`text-xs truncate ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {user?.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <span className="text-lg mr-1" aria-label="Paraguay" title="Paraguay">🇵🇾</span>
            <button
              onClick={toggleTheme}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                isDark
                  ? "bg-slate-800 hover:bg-slate-700 text-yellow-300"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
              data-testid="toggle-theme-button"
              aria-label="Cambiar tema"
            >
              {isDark ? <Sun className="w-4 h-4" strokeWidth={2} /> : <Moon className="w-4 h-4" strokeWidth={2} />}
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                isDark
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
              data-testid="open-settings-button"
              aria-label="Configuración"
            >
              <Settings className="w-4 h-4" strokeWidth={2} />
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                isDark
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
              data-testid="open-history-button"
              aria-label="Historial"
            >
              <History className="w-4 h-4" strokeWidth={2} />
            </button>
            <button
              onClick={handleLogout}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                isDark
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
              data-testid="client-logout-button"
              aria-label="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      </header>

      {/* ========== MAIN ========== */}
      <main className="flex-1 flex flex-col px-4 pt-6 pb-6 max-w-xl w-full mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-4"
        >
          <h2 className={`font-heading text-2xl font-bold tracking-tight ${
            isDark ? "text-white" : "text-slate-900"
          }`}>
            Mis alertas
          </h2>
          <div className={`h-px mt-3 ${isDark ? "bg-slate-700" : "bg-slate-200"}`} />
        </motion.div>

        {/* Sponsor / Contactos */}
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <SponsorContacts isDark={isDark} />
        </motion.div>

        {/* ========== SOS BUTTON ========== */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="relative mb-6"
        >
          {/* Glow halo */}
          <div className="absolute inset-0 -z-0 flex items-center justify-center pointer-events-none">
            <div className="absolute w-[105%] h-[110%] rounded-3xl bg-rose-500/30 blur-2xl animate-pulse-slow" />
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.01 }}
            onClick={() => openDialog("panic")}
            disabled={sending}
            className="relative w-full h-44 rounded-3xl overflow-hidden flex items-center justify-center
                       bg-gradient-to-br from-rose-500 via-rose-600 to-red-700
                       shadow-[0_20px_60px_-15px_rgba(244,63,94,0.6)]
                       focus:outline-none focus:ring-4 focus:ring-rose-300
                       disabled:opacity-60 disabled:cursor-not-allowed"
            data-testid="panic-button-panic"
          >
            {/* Inner glossy shine */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/20 pointer-events-none" />
            {/* Sweeping light ring */}
            <span className="absolute inset-4 rounded-2xl ring-1 ring-white/25 pointer-events-none" />
            {/* Pulse ripples */}
            <span className="absolute inset-0 rounded-3xl ripple-ring pointer-events-none" />
            <span className="absolute inset-0 rounded-3xl ripple-ring ripple-ring-delay-1 pointer-events-none" />
            {/* SOS chip */}
            <div className="relative bg-white rounded-2xl px-7 py-3 shadow-lg">
              <span className="font-display text-5xl font-black text-rose-600 tracking-widest leading-none">SOS</span>
            </div>
          </motion.button>
        </motion.div>

        {/* ========== GRID 2x2 ========== */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {["fire", "medical", "on_way", "here"].map((k, i) => {
            const { label, Icon, accent: a } = ALERT_TYPES[k];
            const ac = ACCENT_CLASSES[a];
            const grad = TILE_GRADIENTS[a];
            return (
              <motion.button
                key={k}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.1 + i * 0.06 }}
                whileTap={{ scale: 0.96 }}
                whileHover={{ y: -2 }}
                onClick={() => openDialog(k)}
                disabled={sending}
                className={`relative rounded-2xl h-36 flex flex-col items-center justify-center gap-3
                           overflow-hidden border transition-all disabled:opacity-60
                           bg-gradient-to-br ${isDark ? grad.dark : grad.light}
                           ${isDark ? "border-slate-700/60" : "border-white/80"}
                           shadow-[0_8px_24px_-12px_rgba(0,0,0,0.2)]
                           hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.3)]
                           focus:outline-none focus:ring-2 focus:ring-offset-2 ${ac.ring}`}
                data-testid={`alert-btn-${k}`}
              >
                <span className="absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-transparent pointer-events-none" />
                <Icon className={`w-11 h-11 ${ac.icon} drop-shadow-sm`} strokeWidth={1.8} />
                <span className={`font-heading text-sm font-bold tracking-wider ${
                  isDark ? "text-white" : "text-slate-800"
                }`}>
                  {label}
                </span>
              </motion.button>
            );
          })}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className={`text-xs text-center leading-relaxed px-4 ${
            isDark ? "text-slate-400" : "text-slate-500"
          }`}
        >
          Todas las alertas envían tu ubicación automáticamente. Puedes agregar foto, audio y mensaje.
        </motion.p>
      </main>

      {/* ========== FOOTER ========== */}
      <footer className={`px-4 py-3 border-t text-center ${
        isDark ? "border-slate-800 bg-slate-900/40" : "border-slate-200 bg-white/40"
      }`}>
        <p className={`text-[0.65rem] font-mono-tactical tracking-wider ${
          isDark ? "text-slate-500" : "text-slate-500"
        }`}>
          ÑACURUTU · Vigilancia 24/7
        </p>
        <div className="flex justify-center mt-1">
          <VersionBadge compact />
        </div>
      </footer>

      {/* ================================ */}
      {/* UNIFIED ALERT DIALOG */}
      {/* ================================ */}
      <Dialog open={!!activeType} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent
          className={`rounded-2xl max-w-md border ${
            isDark
              ? "bg-slate-900 border-slate-700 text-slate-100"
              : "bg-white border-slate-200 text-slate-900"
          }`}
          data-testid="alert-send-dialog"
          onPointerDown={() => { if (isPanic && !paused) { /* no pausar tap casual */ } }}
        >
          {activeCfg && (
            <>
              <DialogHeader>
                <DialogTitle className={`font-heading tracking-tight flex items-center gap-2 ${
                  isDark ? "text-white" : "text-slate-900"
                }`}>
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

      <ClientSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

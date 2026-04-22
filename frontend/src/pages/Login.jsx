import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { OwlLogo } from "../components/OwlLogo";
import { Loader2, ShieldAlert, Download, Smartphone, ShieldCheck } from "lucide-react";
import { isNative } from "../lib/nativePush";
import { IS_ADMIN_BUILD } from "../lib/buildMode";
import { openApkDownload } from "../lib/apkDownload";
import VersionBadge from "../components/VersionBadge";

const APK_URL = "/boton-panico/downloads/nacurutu-latest.apk";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clientFromWeb, setClientFromWeb] = useState(false);
  const [versionMismatch, setVersionMismatch] = useState(false);

  if (user && user !== false) {
    if (user.role === "client") return <Navigate to="/client" replace />;
    return <Navigate to="/admin/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setClientFromWeb(false);
    setVersionMismatch(false);
    setLoading(true);
    try {
      const u = await login(email, password);
      // Si este es el build de la APK admin y el usuario es cliente → bloqueo
      if (IS_ADMIN_BUILD && u.role === "client") {
        setError("Esta es la app de administrador. Instalá 'ÑACURUTU Seguridad' si sos cliente.");
        return;
      }
      if (u.role === "client") navigate("/client");
      else navigate("/admin/dashboard");
    } catch (err) {
      const detail = formatApiError(err.response?.data?.detail) || err.message;
      const status = err.response?.status;
      // 426 Upgrade Required
      if (status === 426) {
        setVersionMismatch(true);
      } else if (
        status === 403 &&
        typeof detail === "string" &&
        detail.toLowerCase().includes("app móvil")
      ) {
        setClientFromWeb(true);
      }
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`min-h-screen w-full flex items-center justify-center px-4 relative overflow-hidden ${
        IS_ADMIN_BUILD
          ? "bg-slate-950 text-slate-100"
          : "bg-slate-50"
      }`}
      data-testid="login-page"
      data-build-mode={IS_ADMIN_BUILD ? "admin" : "client"}
    >
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-[0.35] pointer-events-none"
        style={{
          backgroundImage: IS_ADMIN_BUILD
            ? "linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px)"
            : "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(ellipse at center, #000 40%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, #000 40%, transparent 80%)",
        }}
      />

      <div className="relative w-full max-w-md">
        {/* ADMIN banner — sólo visible en build admin */}
        {IS_ADMIN_BUILD && (
          <div
            className="mb-4 flex items-center gap-2 bg-rose-600/10 border border-rose-500/50 rounded-lg px-3 py-2"
            data-testid="admin-login-banner"
          >
            <ShieldCheck className="w-4 h-4 text-rose-400 flex-shrink-0" strokeWidth={2} />
            <div className="flex-1">
              <div className="text-[0.65rem] uppercase tracking-[0.2em] text-rose-400 font-bold">
                Modo Administrador
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Acceso restringido — personal autorizado
              </div>
            </div>
            <span className="text-[0.55rem] font-mono tracking-wider bg-rose-600 text-white px-2 py-0.5 rounded uppercase">
              ADMIN
            </span>
          </div>
        )}

        <div className={`flex items-center gap-2 mb-8 ${IS_ADMIN_BUILD ? "text-slate-400" : ""}`}>
          <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
          <span className="overline">
            {IS_ADMIN_BUILD ? "Command Center · v1.0" : "Sistema de Emergencia · v1.0"}
          </span>
        </div>

        <div className={`rounded-xl p-8 shadow-sm border ${
          IS_ADMIN_BUILD
            ? "bg-slate-900 border-slate-700"
            : "bg-white border-slate-200"
        }`}>
          <div className="flex items-center gap-4 mb-8">
            <OwlLogo size={56} />
            <div>
              <h1 className={`font-heading text-2xl font-bold tracking-tight leading-none ${
                IS_ADMIN_BUILD ? "text-white" : "text-slate-900"
              }`}>
                ÑACURUTU
              </h1>
              <p className={`overline mt-1 ${
                IS_ADMIN_BUILD ? "text-rose-400 font-bold" : ""
              }`}>
                {IS_ADMIN_BUILD ? "Seguridad · Panel Admin" : "Seguridad · Command Center"}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="identifier" className={`overline block mb-2 ${
                IS_ADMIN_BUILD ? "text-slate-400" : ""
              }`}>
                Usuario o correo
              </Label>
              <Input
                id="identifier"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario o tu@correo.com"
                required
                autoComplete="username"
                className={`h-11 rounded-md focus-visible:ring-rose-600 focus-visible:ring-offset-0 ${
                  IS_ADMIN_BUILD
                    ? "bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                    : "bg-slate-50 border-slate-200"
                }`}
                data-testid="login-email-input"
              />
            </div>
            <div>
              <Label htmlFor="password" className={`overline block mb-2 ${
                IS_ADMIN_BUILD ? "text-slate-400" : ""
              }`}>
                Clave
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className={`h-11 rounded-md focus-visible:ring-rose-600 focus-visible:ring-offset-0 ${
                  IS_ADMIN_BUILD
                    ? "bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                    : "bg-slate-50 border-slate-200"
                }`}
                data-testid="login-password-input"
              />
            </div>

            {versionMismatch ? (
              <div
                className="space-y-3 text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded-md p-4"
                data-testid="version-mismatch-block"
              >
                <div className="flex items-start gap-2">
                  <Download className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-700" strokeWidth={1.8} />
                  <div>
                    <div className="font-semibold mb-1">Actualizá tu app</div>
                    <div className="text-amber-800/90 text-xs leading-relaxed">{error}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openApkDownload(APK_URL)}
                  className="flex items-center justify-center gap-2 w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2.5 rounded-md transition-colors"
                  data-testid="login-update-apk-cta"
                >
                  <Download className="w-4 h-4" strokeWidth={2} />
                  Descargar nueva versión
                </button>
              </div>
            ) : clientFromWeb ? (
              <div
                className="space-y-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-4"
                data-testid="client-from-web-block"
              >
                <div className="flex items-start gap-2">
                  <Smartphone className="w-5 h-5 mt-0.5 flex-shrink-0 text-rose-600" strokeWidth={1.8} />
                  <div>
                    <div className="font-semibold mb-1">Sólo desde la app móvil</div>
                    <div className="text-rose-700/90 text-xs leading-relaxed">
                      Por seguridad, los clientes sólo pueden ingresar desde la
                      aplicación oficial ÑACURUTU Seguridad para Android.
                      Los administradores pueden ingresar desde cualquier dispositivo.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openApkDownload(APK_URL)}
                  className="flex items-center justify-center gap-2 w-full bg-rose-600 hover:bg-rose-500 text-white font-semibold py-2.5 rounded-md transition-colors"
                  data-testid="login-download-apk-cta"
                >
                  <Download className="w-4 h-4" strokeWidth={2} />
                  Descargar App Android
                </button>
              </div>
            ) : error && (
              <div
                className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-3"
                data-testid="login-error"
              >
                <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={1.8} />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-rose-600 hover:bg-rose-500 text-white font-semibold tracking-wide rounded-md transition-all duration-150 active:scale-[0.98] shadow-md"
              data-testid="login-submit-button"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Autenticando...
                </>
              ) : (
                "Ingresar"
              )}
            </Button>
          </form>
        </div>

        {/* Android App Download — mostrar SIEMPRE excepto dentro de la APK cliente
            (en la APK admin sí lo mostramos para que el admin pueda pasar el link a clientes) */}
        {(!isNative() || IS_ADMIN_BUILD) && (
          <button
            type="button"
            onClick={() => openApkDownload(APK_URL)}
            className="mt-5 w-full flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-rose-300 hover:shadow-md transition-all duration-150 group text-left"
            data-testid="download-android-app-button"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                <Smartphone className="w-5 h-5 text-emerald-600" strokeWidth={1.8} />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-slate-900 leading-tight">
                  Descargar App Android
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Instala el botón de pánico en tu móvil
                </div>
              </div>
            </div>
            <Download
              className="w-5 h-5 text-slate-400 group-hover:text-rose-600 transition-colors flex-shrink-0"
              strokeWidth={1.8}
            />
          </button>
        )}

        <p className={`text-center text-xs mt-6 font-mono-tactical ${
          IS_ADMIN_BUILD ? "text-slate-500" : "text-slate-400"
        }`}>
          {IS_ADMIN_BUILD
            ? "ÑACURUTU SEGURIDAD · PANEL ADMIN © 2026"
            : "ÑACURUTU SEGURIDAD © 2026 · Vigilancia 24/7"}
        </p>
        <div className="flex justify-center mt-2">
          <VersionBadge compact />
        </div>
      </div>
    </div>
  );
}

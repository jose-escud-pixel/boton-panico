import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { OwlLogo } from "../components/OwlLogo";
import { Download, Loader2, ShieldAlert, Smartphone } from "lucide-react";
import { openApkDownload } from "../lib/apkDownload";

const UI_VERSION = process.env.REACT_APP_UI_VERSION || "1.0";
const CLIENT_APK_URL = "/boton-panico/downloads/nacurutu-latest.apk";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (user && user !== false) {
    if (user.role === "client") return <Navigate to="/client" replace />;
    return <Navigate to="/admin/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const u = await login(email, password);
      if (u.role === "client") navigate("/client");
      else navigate("/admin/dashboard");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4 relative overflow-hidden bg-slate-50"
      data-testid="login-page"
    >
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-[0.35] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(ellipse at center, #000 40%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, #000 40%, transparent 80%)",
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
          <span className="overline" data-testid="login-ui-version">
            Sistema de Emergencia · v{UI_VERSION}
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
          <div className="flex items-center gap-4 mb-8">
            <OwlLogo size={56} />
            <div>
              <h1 className="font-heading text-2xl font-bold tracking-tight leading-none text-slate-900">
                ÑACURUTU
              </h1>
              <p className="overline mt-1">Seguridad · Command Center</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="email" className="overline block mb-2">Usuario o correo</Label>
              <Input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ej. monitoreo o nombre@empresa.com"
                required
                autoComplete="username"
                className="bg-slate-50 border-slate-200 h-11 rounded-md focus-visible:ring-rose-600 focus-visible:ring-offset-0"
                data-testid="login-email-input"
              />
            </div>
            <div>
              <Label htmlFor="password" className="overline block mb-2">Clave</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="bg-slate-50 border-slate-200 h-11 rounded-md focus-visible:ring-rose-600 focus-visible:ring-offset-0"
                data-testid="login-password-input"
              />
            </div>

            {error && (
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

          <div className="mt-6 pt-6 border-t border-slate-200">
            <Button
              type="button"
              onClick={() => openApkDownload(CLIENT_APK_URL)}
              className="group relative w-full min-h-[4.5rem] overflow-hidden rounded-xl bg-gradient-to-br from-rose-500 via-red-600 to-orange-500 text-white shadow-[0_16px_35px_-16px_rgba(225,29,72,0.85)] hover:from-rose-500 hover:via-red-500 hover:to-amber-500 border border-rose-300/40 transition-all duration-200 active:scale-[0.98]"
              data-testid="download-client-apk-login"
            >
              <span className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-black/15 pointer-events-none" />
              <span className="absolute -right-8 -top-10 w-28 h-28 rounded-full bg-white/20 blur-xl pointer-events-none transition-transform duration-300 group-hover:scale-125" />
              <span className="relative flex items-center gap-3 text-left">
                <span className="w-11 h-11 rounded-lg bg-white/20 border border-white/30 flex items-center justify-center shadow-inner">
                  <Download className="w-6 h-6" strokeWidth={2.2} />
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="font-heading text-lg font-black tracking-tight">
                    Descargar App Android
                  </span>
                  <span className="text-xs font-medium text-white/85">
                    APK oficial para clientes
                  </span>
                </span>
              </span>
            </Button>
            <div className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-100 rounded-md py-2">
              <Smartphone className="w-4 h-4" strokeWidth={1.8} />
              <span>Instalación directa para celulares Android</span>
            </div>
          </div>
        </div>

        <p className="text-center text-slate-400 text-xs mt-6 font-mono-tactical">
          ÑACURUTU SEGURIDAD © 2026 · Vigilancia 24/7
        </p>
      </div>
    </div>
  );
}

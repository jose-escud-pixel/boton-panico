import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { OwlLogo } from "../components/OwlLogo";
import { Loader2, ShieldAlert } from "lucide-react";

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
      className="min-h-screen w-full flex items-center justify-center px-4 relative overflow-hidden"
      data-testid="login-page"
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(9,9,11,0.95) 0%, rgba(9,9,11,0.85) 100%), url('https://images.unsplash.com/photo-1761078739436-ccee01f3d89c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzN8MHwxfHNlYXJjaHwxfHxkYXJrJTIwYWJzdHJhY3QlMjB0ZXh0dXJlJTIwYmFja2dyb3VuZHxlbnwwfHx8fDE3NzY2MjAxOTJ8MA&ixlib=rb-4.1.0&q=85')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Grid pattern overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Top badge */}
        <div className="flex items-center gap-2 mb-8">
          <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
          <span className="overline">Sistema de Emergencia · v1.0</span>
        </div>

        <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800 rounded-md p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex items-center gap-4 mb-8">
            <OwlLogo size={56} />
            <div>
              <h1 className="font-heading text-2xl font-bold tracking-tight leading-none">
                ÑACURUTU
              </h1>
              <p className="overline mt-1">Seguridad · Command Center</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="email" className="overline block mb-2">
                Correo
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                autoComplete="email"
                className="bg-zinc-950/50 border-zinc-800 h-11 rounded-sm focus-visible:ring-rose-600 focus-visible:ring-offset-0"
                data-testid="login-email-input"
              />
            </div>
            <div>
              <Label htmlFor="password" className="overline block mb-2">
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
                className="bg-zinc-950/50 border-zinc-800 h-11 rounded-sm focus-visible:ring-rose-600 focus-visible:ring-offset-0"
                data-testid="login-password-input"
              />
            </div>

            {error && (
              <div
                className="flex items-start gap-2 text-sm text-rose-400 bg-rose-950/30 border border-rose-900/50 rounded-sm p-3"
                data-testid="login-error"
              >
                <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-rose-600 hover:bg-rose-500 text-white font-semibold tracking-wide rounded-sm transition-all duration-150 active:scale-[0.98] shadow-[0_0_32px_rgba(225,29,72,0.25)]"
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

          <div className="mt-8 pt-6 border-t border-zinc-800/70">
            <p className="overline mb-3">Credenciales de prueba</p>
            <div className="space-y-1.5 text-xs text-zinc-500 font-mono-tactical">
              <div><span className="text-zinc-400">Admin:</span> jose@aranduinformatica.net</div>
              <div><span className="text-zinc-400">Cliente:</span> jose.escudero@aranduinformatica.net</div>
              <div><span className="text-zinc-400">Clave:</span> 12345678</div>
            </div>
          </div>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6 font-mono-tactical">
          ÑACURUTU SEGURIDAD © 2026 · Vigilancia Nocturna
        </p>
      </div>
    </div>
  );
}

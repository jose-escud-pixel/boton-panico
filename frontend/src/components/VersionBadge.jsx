import React, { useState } from "react";
import { APP_VERSION, APP_BUILD, fetchRemoteVersion } from "../lib/appVersion";
import { isNative } from "../lib/nativePush";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Pequeño badge con la versión actual de la app.
 * Muestra: v1.0.0 · build 42
 *
 * Click → chequea manualmente si hay una versión más nueva en el servidor
 * (útil para debugging o para forzar el check cuando el banner automático
 * no aparece).
 */
export default function VersionBadge({ className = "", compact = false }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null); // "up-to-date" | "newer-available" | "error"
  const [remoteData, setRemoteData] = useState(null);

  const check = async () => {
    setChecking(true);
    setResult(null);
    try {
      const data = await fetchRemoteVersion();
      if (!data) {
        setResult("error");
      } else {
        setRemoteData(data);
        const remoteCode = parseInt(data.versionCode, 10) || 0;
        if (remoteCode > APP_BUILD) setResult("newer-available");
        else setResult("up-to-date");
      }
    } catch {
      setResult("error");
    } finally {
      setChecking(false);
      setTimeout(() => setResult(null), 6000);
    }
  };

  const platform = isNative() ? "📱 App" : "🌐 Web";

  return (
    <div className={`inline-flex flex-col items-start gap-1 ${className}`} data-testid="version-badge">
      <button
        type="button"
        onClick={check}
        disabled={checking}
        className="inline-flex items-center gap-1.5 text-[10px] font-mono tracking-wider text-slate-500 hover:text-rose-600 transition-colors disabled:opacity-50"
        title="Click para buscar actualizaciones"
      >
        <RefreshCw className={`w-3 h-3 ${checking ? "animate-spin" : ""}`} strokeWidth={2} />
        {compact ? `v${APP_VERSION} · b${APP_BUILD}` : `${platform} · v${APP_VERSION} · build ${APP_BUILD}`}
      </button>
      {result === "up-to-date" && (
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-mono">
          <CheckCircle2 className="w-3 h-3" strokeWidth={2} />
          Al día {remoteData?.versionCode ? `(remote: b${remoteData.versionCode})` : ""}
        </span>
      )}
      {result === "newer-available" && (
        <span className="inline-flex items-center gap-1 text-[10px] text-rose-600 font-mono">
          <AlertCircle className="w-3 h-3" strokeWidth={2} />
          Nueva: v{remoteData?.version} (b{remoteData?.versionCode})
        </span>
      )}
      {result === "error" && (
        <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-mono">
          <AlertCircle className="w-3 h-3" strokeWidth={2} />
          No se pudo verificar
        </span>
      )}
    </div>
  );
}

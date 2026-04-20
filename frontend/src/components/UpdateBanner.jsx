import React, { useEffect, useState } from "react";
import { Download, X, Sparkles } from "lucide-react";
import { APP_VERSION, APP_BUILD, APK_URL, fetchRemoteVersion } from "../lib/appVersion";
import { isNative } from "../lib/nativePush";

/**
 * Banner que detecta si hay una nueva versión de la APK disponible.
 * Sólo se muestra en la app nativa (Capacitor), nunca en web
 * (los usuarios web siempre tienen la última versión).
 *
 * Criterio: versionCode (entero auto-incremental). Si el remote tiene un
 * versionCode mayor que APP_BUILD embebido, aparece el banner.
 */
export default function UpdateBanner() {
  const [remote, setRemote] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;
    (async () => {
      const data = await fetchRemoteVersion();
      if (cancelled || !data) return;
      const remoteCode = parseInt(data.versionCode, 10) || 0;
      if (remoteCode > APP_BUILD) {
        setRemote(data);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!isNative() || !remote || dismissed) return null;

  const apkUrl = remote.apk_url || APK_URL;
  const absoluteUrl = apkUrl.startsWith("http")
    ? apkUrl
    : `https://www.aranduinformatica.net${apkUrl}`;

  const handleUpdate = () => {
    try {
      window.open(absoluteUrl, "_system");
    } catch {
      window.location.href = absoluteUrl;
    }
  };

  const displayVersion = remote.version || `build ${remote.versionCode}`;
  const currentLabel = `actual: ${APP_VERSION} (build ${APP_BUILD})`;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 bg-rose-600 text-white shadow-lg"
      data-testid="update-banner"
    >
      <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 py-3">
        <Sparkles className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-tight">
            Nueva versión {displayVersion} disponible
          </div>
          <div className="text-xs text-rose-100 mt-0.5 truncate">
            {remote.changelog || currentLabel}
          </div>
        </div>
        <button
          onClick={handleUpdate}
          className="flex items-center gap-1.5 bg-white text-rose-700 text-xs font-bold px-3 py-1.5 rounded-md hover:bg-rose-50 transition-colors"
          data-testid="update-banner-download-button"
        >
          <Download className="w-3.5 h-3.5" strokeWidth={2.5} />
          ACTUALIZAR
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-rose-100 hover:text-white p-1"
          aria-label="Cerrar"
          data-testid="update-banner-dismiss-button"
        >
          <X className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

/**
 * Helper unificado para disparar descargas de APK desde cualquier contexto
 * (web normal o app Capacitor).
 *
 * Dentro de una APK de Capacitor, `<a href="..." download>` y
 * `window.open(url, "_system")` NO funcionan:
 *   - `_system` es sintaxis Cordova (ignorada por Capacitor).
 *   - El href va al WebView que no descarga binarios correctamente.
 *
 * En native usamos `@capacitor/browser` (Chrome Custom Tab) que SÍ maneja la
 * descarga del APK y dispara el prompt de instalación del OS.
 */
import { isNative } from "./nativePush";

const ORIGIN_FALLBACK = "https://www.aranduinformatica.net";

function toAbsolute(url) {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  // Si la URL es relativa, la resolvemos contra el origin de la página
  // (en Capacitor con server.url remoto, `location.origin` ya apunta al dominio correcto).
  const origin = typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : ORIGIN_FALLBACK;
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Abre la URL del APK de la forma correcta según plataforma.
 * @param {string} url - URL relativa o absoluta del APK
 */
export async function openApkDownload(url) {
  const absoluteUrl = toAbsolute(url);

  if (isNative()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: absoluteUrl });
      return;
    } catch (e) {
      console.error("Browser.open failed, fallback to window.open", e);
    }
  }

  // Web o fallback si Browser plugin no disponible
  try {
    const w = window.open(absoluteUrl, "_blank");
    if (!w) window.location.href = absoluteUrl;
  } catch {
    window.location.href = absoluteUrl;
  }
}

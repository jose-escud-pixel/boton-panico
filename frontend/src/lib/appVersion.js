/**
 * Versión actual de la app embebida en el bundle.
 *
 * APP_VERSION (string) — nombre visible de la versión, ej: "1.0.0".
 *   Se muestra en la UI. Bumpealo a mano cuando quieras cambiar el nombre.
 *
 * APP_BUILD (integer) — número de build. Se AUTO-INCREMENTA en cada ejecución de
 *   build-android-apk.sh. Es el valor que realmente dispara el banner de
 *   actualización: si el remote tiene un APP_BUILD mayor, se muestra el banner.
 *   NO lo edites a mano; el script lo maneja.
 */
export const APP_VERSION = "1.0.0";
export const APP_BUILD = 27;

/**
 * URL del archivo version.json que publica el servidor.
 * Debe devolver: { "version": "1.0.1", "versionCode": 5, "apk_url": "...", "changelog": "..." }
 */
export const VERSION_JSON_URL = "/boton-panico/downloads/version.json";

/** URL pública del APK más reciente. */
export const APK_URL = "/boton-panico/downloads/nacurutu-latest.apk";

/** Compara dos versiones semver. Retorna 1 si a>b, -1 si a<b, 0 si iguales. */
export function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/** Fetch de version.json del servidor. Retorna null si falla. */
export async function fetchRemoteVersion() {
  try {
    const res = await fetch(`${VERSION_JSON_URL}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.version) return null;
    return data;
  } catch {
    return null;
  }
}

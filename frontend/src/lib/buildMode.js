/**
 * Detección de "modo admin" en tiempo de EJECUCIÓN.
 *
 * IMPORTANTE (decisión de diseño):
 * - NO usamos localStorage / sessionStorage para persistir el flag, porque
 *   admin y cliente APK comparten el MISMO origen (www.aranduinformatica.net).
 *   Si uno persistiera, el otro lo leería y se contaminaría.
 * - Dependemos 100% del query param `?admin=1` en el URL inicial.
 * - Capacitor recarga `server.url` al abrir la app cada vez, así que el
 *   admin APK siempre ve el param. El cliente APK nunca lo ve.
 * - El main web (`/boton-panico`) por defecto es cliente-looking (sin banner
 *   admin). Si el admin entra desde allí, puede loguear igual y termina en
 *   `/admin/dashboard`; sólo el estilo del Login es distinto.
 *
 * Para testear manualmente desde cualquier navegador:
 *   https://www.aranduinformatica.net/boton-panico/?admin=1 → admin-looking
 *   https://www.aranduinformatica.net/boton-panico/        → client-looking
 */

function detectMode() {
  if (typeof window === "undefined") return "client";
  try {
    const url = new URL(window.location.href);
    const isAdmin = url.searchParams.get("admin") === "1";
    // Limpiamos la URL para que el usuario no vea `?admin=1` en la barra
    // (evita que comparta links con el flag visible). No afecta la detección
    // porque ya leímos el valor.
    if (isAdmin) {
      url.searchParams.delete("admin");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }
    return isAdmin ? "admin" : "client";
  } catch {
    return "client";
  }
}

const runtimeMode = detectMode();
const envMode = process.env.REACT_APP_BUILD_MODE; // sólo para dev/local

export const BUILD_MODE = runtimeMode === "admin" ? "admin" : (envMode || "client");
export const IS_ADMIN_BUILD = BUILD_MODE === "admin";

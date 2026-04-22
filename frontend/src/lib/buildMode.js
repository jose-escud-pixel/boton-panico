/**
 * Detección de "modo admin" en tiempo de EJECUCIÓN.
 *
 * IMPORTANTE: no podemos confiar solo en REACT_APP_BUILD_MODE porque el APK
 * carga el bundle desde `server.url` (remoto), así que la variable de build
 * es la del último `yarn build` hecho en el servidor — no la del APK.
 *
 * Estrategia:
 *  1) La APK admin tiene `server.url = https://.../boton-panico/?admin=1`
 *     → al primer load detectamos el query param y lo guardamos en localStorage.
 *  2) En loads posteriores (navegación React Router puede limpiar la query),
 *     leemos de localStorage.
 *  3) Fallback a la env var para compilaciones locales/test.
 */

const STORAGE_KEY = "nacurutu.build_mode";

function detectAndPersist() {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("admin") === "1") {
      window.localStorage.setItem(STORAGE_KEY, "admin");
      return "admin";
    }
    // Si la URL explícitamente pide modo cliente, limpiamos (útil para testing)
    if (params.get("client") === "1") {
      window.localStorage.setItem(STORAGE_KEY, "client");
      return "client";
    }
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

const runtimeMode = detectAndPersist();
const envMode = process.env.REACT_APP_BUILD_MODE;

export const BUILD_MODE = runtimeMode || envMode || "client";
export const IS_ADMIN_BUILD = BUILD_MODE === "admin";

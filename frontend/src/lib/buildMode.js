/**
 * Modo de compilación (cliente vs admin). BAKED IN al bundle JS en build time.
 *
 * - Web pública / APK cliente: `REACT_APP_BUILD_MODE=client` → bundle cliente.
 * - APK admin:                 `REACT_APP_BUILD_MODE=admin`  → bundle admin.
 *
 * No hay detección en runtime, ni query params, ni localStorage. Cada bundle
 * es completamente independiente y no puede contaminarse con el otro.
 */
export const BUILD_MODE = process.env.REACT_APP_BUILD_MODE || "client";
export const IS_ADMIN_BUILD = BUILD_MODE === "admin";

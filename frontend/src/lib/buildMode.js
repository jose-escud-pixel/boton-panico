/**
 * Modo de la app: "client" (default) o "admin".
 *
 * Se setea con la variable de entorno REACT_APP_BUILD_MODE durante el
 * yarn build. Cuando es "admin":
 * - Login redirige siempre a /admin/dashboard (nunca a /client)
 * - Si el usuario logueado es cliente → mensaje "usá la otra app"
 * - Se oculta el botón de descarga del cliente en el Login
 */
export const BUILD_MODE = process.env.REACT_APP_BUILD_MODE || "client";
export const IS_ADMIN_BUILD = BUILD_MODE === "admin";

/**
 * useAutoRefresh — desactivado globalmente.
 *
 * El hook existe para mantener compatibilidad de imports en todas las páginas
 * que lo llaman, pero NO programa ningún intervalo.
 *
 * El refresco ocurre por:
 *   - Eventos Socket.IO (alert:new, alert:updated, ticket:new, ticket:updated)
 *   - Acciones directas: crear, responder, cambiar estado → load() post-mutación
 *   - Botón manual "Actualizar" en cada módulo
 */
// eslint-disable-next-line no-unused-vars
export function useAutoRefresh(_callback, _intervalMs, _enabled) {
  // no-op — desactivado igual que en Arandu v2.8.82+
}

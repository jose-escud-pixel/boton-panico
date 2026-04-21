# ÑACURUTU SEGURIDAD — Panic Button Multi-Tenant System

## Original Problem
Full-stack multi-tenant panic button system with Admin Panel (real-time alerts, dashboard analytics, user/org management, Leaflet map) + Client Web App (PWA-like, mobile-first, giant red panic button with silent and normal alerts including text/image/audio/geolocation).

## User Personas
- **Super Admin**: manages all organizations, users, alerts, system settings
- **Admin** (per organization): manages own org's users and alerts
- **Client**: end user who sends emergency alerts

## Architecture
- Backend: FastAPI + Motor (MongoDB async) + Socket.IO wrapped as ASGI, port 8001 with /api prefix
- Frontend: React 19 + React Router, Tailwind + Shadcn UI, react-leaflet, recharts, socket.io-client
- Auth: JWT (bcrypt) + cookies + Bearer fallback in localStorage
- Storage: Base64 data URLs in MongoDB for images/audio

## Implemented (2026-04-19)
- ✅ JWT auth (login/me/logout/refresh) with seed (super_admin + client + default org)
- ✅ Organizations CRUD (with logo upload as base64)
- ✅ Users CRUD with granular permissions (create/edit/delete/view) and role-based access
- ✅ Alerts: create (silent/normal), list with filters (status/type/user/date), detail with history, status updates (pending/in_process/completed)
- ✅ Dashboard stats: today/week/month/total, by_type, by_status, by_organization, daily last 7 days
- ✅ Real-time alerts via Socket.IO (mounted at /api/socket.io)
- ✅ Leaflet map with CartoDB Dark tiles, markers per alert
- ✅ Charts: daily bar + type pie (Recharts)
- ✅ Client PanicApp: giant SOS button (silent 1-tap), normal alert dialog with text/image/audio recording, geolocation, history view
- ✅ Multi-tenant isolation enforced at query level
- ✅ Dark tactical theme (Cabinet Grotesk + IBM Plex Sans + Anton)

## Test Credentials
- Super Admin: jose@aranduinformatica.net / 12345678 → /admin/dashboard
- Client: jose.escudero@aranduinformatica.net / 12345678 → /client

## P1 Backlog
- DELETE /api/alerts/{id} for super_admin cleanup
- Brute-force lockout on /api/auth/login (5 fail = 15min)
- Role escalation guard in PUT /api/users/{id}
- Cascade delete for organizations (or block when users/alerts exist)
- PWA manifest + service worker for install-to-home-screen

## P2 Backlog
- Push notifications (web push) for admins when alerts arrive
- Alert comments/notes thread
- Export alerts to CSV
- Dark/light theme toggle
- Emergency contacts per user (call/SMS fallback via Twilio)
- Object Storage migration for images/audio (scalability)

## Next Steps
- User validation of flows
- PWA installability if desired

## Update 2026-04-19 (iteración 2)
- ✅ Tema claro completo (admin + cliente)
- ✅ Nuevos tipos de alerta: panic, fire, medical, on_way, here (+ legacy silent/normal)
- ✅ Ubicación obligatoria en POST /api/alerts
- ✅ Cliente: dialog unificado para todos los tipos con mensaje/foto/audio opcionales
- ✅ Cliente: countdown de 5s sólo en Pánico con auto-envío, cancelable, pausable al interactuar
- ✅ Admin: sirena sintética (Web Audio API) + voz TTS española al recibir alerta
- ✅ Admin: sirena se detiene automáticamente cuando todas las alertas pendientes pasan a in_process/completed
- ✅ Admin: botón "Silenciar sirena" en sidebar
- ✅ Admin: notificaciones nativas del navegador (Notification API) — requiere permiso del usuario
- ✅ Fix: mapa en dialog de detalle con altura fija 200px (no se desborda)
- ✅ PWA manifest para instalación en celular

## Update 2026-04-19 (iteración 3 — Native Android + Download)
- ✅ Integración Capacitor para envolver frontend como APK nativo Android
- ✅ Firebase Cloud Messaging (FCM) vía firebase-admin para push nativo
- ✅ Script `deploy/build-android-apk.sh` para compilar APK en servidor del usuario
- ✅ Configuración Apache VirtualHost + systemd para subpath `/boton-panico`
- ✅ Botón "Descargar App Android" en Login (apunta a `/boton-panico/downloads/nacurutu-latest.apk`)

## Update 2026-04-20 (iteración 4 — Branding + Actualización + Geolocation Fix)
- ✅ Branding limpio: título de pestaña "ÑACURUTU Seguridad" (reemplaza "Emergent | Fullstack App")
- ✅ Eliminado badge "Made with Emergent" y tracking PostHog del build
- ✅ Fix crítico de geolocalización en APK Android: uso del plugin `@capacitor/geolocation` (antes fallaba con `navigator.geolocation` en WebView con server remoto)
- ✅ Solicitud proactiva de permiso de ubicación al abrir la app nativa (evita el error al presionar pánico)
- ✅ Sistema de actualización OTA: banner rojo en app nativa con botón "ACTUALIZAR" cuando hay nueva versión
- ✅ `lib/appVersion.js` con constante `APP_VERSION` + helper comparador semver
- ✅ `version.json` generado automáticamente por `build-android-apk.sh`
- ✅ Script de build publica APK automáticamente en `/var/www/boton-panico/downloads/`
- ✅ Botón "Descargar App Android" oculto cuando la app se ejecuta en Capacitor (ya estás dentro)
- ✅ Apache config: Alias `/boton-panico/downloads` con `ForceType application/vnd.android.package-archive` y `Content-Disposition: attachment` para forzar descarga como APK (fix: se bajaba como .html)
- ✅ Documentación: `/app/deploy/ACTUALIZAR_APP.md`

## Update 2026-04-20 (iteración 5 — Sirena Persistente + Fix Banner OTA + Manifest)
- ✅ Fix crítico AndroidManifest.xml: script de build inyecta automáticamente permisos de ubicación, cámara, audio, notificaciones, vibración, foreground service, wake lock (resuelve error "Missing the following permissions")
- ✅ Sirena persistente con voz repetida: la voz TTS ahora se repite cada 8s mientras haya alertas pendientes, priorizando el tipo más crítico (panic > fire > medical > otros)
- ✅ La sirena Web Audio se reafirma automáticamente en cada ciclo (por si el browser la corta)
- ✅ Banner de actualización ahora usa `versionCode` (entero auto-incremental) como criterio, NO `APP_VERSION` (string manual) — cada build nuevo dispara banner automáticamente
- ✅ `APP_BUILD` embebido en el bundle JS vía sed antes de `yarn build` (no requiere intervención manual)
- ✅ Script reordenado: counter + APP_BUILD update → yarn build → cap sync → gradle versionCode/versionName

## Update 2026-04-20 (iteración 6 — Sirena robusta + Version Badge)
- ✅ Fix crítico: al cargar la página del admin (o recargar), si hay alertas pendientes la sirena + voz arrancan automáticamente (antes quedaba silencio)
- ✅ Page Visibility API: cuando el admin vuelve a la pestaña, si había pendientes y la sirena se silenció por autoplay policy, se reanuda
- ✅ First-interaction listener: primer click/tecla del admin hace resume del AudioContext → garantiza que la sirena pueda sonar pase lo que pase
- ✅ `sirenManager.resume()` llamado en cada tick del loop (contra autoplay policy)
- ✅ `window.speechSynthesis.resume()` llamado en cada tick (contra bug de Chrome que para TTS tras 15s)
- ✅ Nuevo `VersionBadge` component visible en Login, Admin sidebar y Client PanicApp footer
- ✅ Badge muestra plataforma + versión + build (ej: "📱 App · v1.0.0 · build 42")
- ✅ Click en badge → chequea manualmente si hay nueva versión → muestra "Al día" / "Nueva disponible" / "No se pudo verificar"

## Update 2026-04-20 (iteración 8 — Rediseño UI Cliente + Dark/Light Mode + Framer Motion)
- ✅ **Rediseño completo de la app cliente** inspirado en mockup de usuario
- ✅ Dark / Light mode con toggle en header, persistido en localStorage vía ThemeContext
- ✅ Framer Motion instalado para animaciones entrada + hover + tap
- ✅ Botón SOS rediseñado: gradiente rose-to-red, chip blanco con "SOS", glow pulsante
- ✅ Grid 2x2 con gradientes por tipo (orange / emerald / sky / violet)
- ✅ Tiles con glassmorphism, stagger entrance animation, hover lift
- ✅ "UTILIDADES" (icono Wrench) reemplaza "EN CAMINO" en UI cliente (backend type `on_way`)
- ✅ "Mis alertas" reemplaza "Mis alarmas"
- ✅ "PÁNICO" en botón grande ahora es solo "SOS"
- ✅ Bandera 🇵🇾 en header, botones redondos para theme/settings/history/logout
- ✅ Dialog de envío adaptado a dark mode
- ✅ Animación `pulse-slow` custom para el halo glow del SOS
- ✅ Texto footer actualizado: "Todas las alertas envían tu ubicación automáticamente..."

## Update 2026-04-21 (iteración 9 — Fase 1: Dark Admin + Archivar + Role Protection)
- ✅ **Dark/Light mode en Admin** (toggle en sidebar, persiste en localStorage)
- ✅ Botón "Archivar completadas" (soft-delete con flag `archived: true`)
- ✅ Botón "Ver archivadas" para ver el historial de alertas archivadas
- ✅ Endpoint `POST /api/alerts/archive?only_completed=true` (solo admins/super_admin)
- ✅ `GET /api/alerts?archived=true` para listar archivadas
- ✅ Filtro por defecto excluye archivadas (clientes solo ven activas)
- ✅ Evento Socket.io `alerts:archived` para actualizar dashboards en tiempo real
- ✅ **Protección crítica de rol propio**:
  - `PUT /api/users/{id}`: no puedes cambiar tu propio rol (403)
  - `DELETE /api/users/{id}`: no puedes eliminarte a ti mismo (400)
  - No puedes editar usuarios con rol igual o superior al tuyo (403)
  - No puedes asignar un rol superior o igual al tuyo a otros usuarios (403)
  - Admin no puede mover usuario a otra organización
- ✅ UI Users.jsx: iconos de editar/eliminar deshabilitados + tooltips para "TÚ" y "Sin permiso"
- ✅ Dialog Editar Usuario: Select de rol deshabilitado si es el usuario propio, con label "(No puedes modificar tu propio rol)"
- ✅ "UTILIDADES" reemplaza "EN CAMINO" también en admin (consistencia con cliente)

## Update 2026-04-21 (iteración 10 — Fase 2: Control de acceso + Clientes solo en app)
- ✅ **Clientes SOLO desde la app nativa Android**: header `X-App-Platform: native` requerido
- ✅ Desde web reciben 403 con CTA para descargar APK (botón grande rojo)
- ✅ Admins/Super_admins pueden ingresar desde cualquier dispositivo (web o app)
- ✅ Nuevos campos user: `status` (active/disabled), `access_type` (permanent/annual/custom), `access_start`, `access_end`
- ✅ Login endpoint valida: status + ventana de fechas → 403 con mensaje explicativo ("Cuenta desactivada", "Tu acceso expiró el YYYY-MM-DD")
- ✅ UI Admin Users form: nuevo bloque "Control de acceso" con Estado, Tipo de acceso, Desde/Hasta (se muestran solo si Tipo ≠ Permanente)
- ✅ Badges en tabla de usuarios: DESACTIVADO (gris) y tipo de acceso no-permanente (ámbar con tooltip de fechas)
- ✅ `api.js` setea `X-App-Platform` automáticamente en todas las requests usando `Capacitor.isNativePlatform()`
- ✅ Login.jsx detecta el 403 específico y muestra banner con botón "Descargar App Android"

## Update 2026-04-21 (iteración 11 — Strict Version + Fase 3 Chips + Fase 4 Username)
- ✅ **Versión estricta del APK**: backend valida `X-App-Build` contra `versionCode` de `version.json`. Si difiere → 426 Upgrade Required con mensaje "Versión desactualizada". El `UpdateBanner` sigue funcionando para auto-detección de nuevas versiones.
- ✅ `_get_required_app_build()` con cache 30s para performance. Lee desde `VERSION_JSON_PATH` (default `/var/www/boton-panico/downloads/version.json`). Si no existe → skip (dev mode).
- ✅ Endpoint público `GET /api/app/version` para consultar requisito.
- ✅ `api.js` envía `X-App-Build` en TODAS las requests desde `APP_BUILD` constant.
- ✅ Login.jsx detecta 426 y muestra banner ámbar con botón "Descargar nueva versión".
- ✅ **Fase 3 — Búsqueda por chips**: Nuevo componente `ChipFilter` reemplaza filtros en /admin/alerts.
  - Sintaxis: `status:pending`, `type:panic`, `user:jose`, `org:ñacurutu`, texto libre
  - Enter → crea chip, Backspace vacío → borra último, X → quita uno
  - Colores por tipo de chip, botón Info con ayuda inline
  - Chips se muestran como badges coloreados dentro del input
  - Múltiples chips combinan como AND
- ✅ **Fase 4 — Username login**: Campo `username` opcional y único en users.
  - `LoginRequest` acepta `identifier` (username o email) o `email` (legacy)
  - Backend busca por username primero (si no tiene `@`), luego email
  - UI Login: label "Usuario o correo", input type="text"
  - UI Users form: campo Usuario al lado del Email con placeholder "ej: jperez"
  - Validación de unicidad en create + update
  - Username vacío en edición → se limpia (null)
  - Retrocompat: `email` sigue funcionando como antes

## Update 2026-04-21 (iteración 12 — Quitar version strict + Device Lock + Fase 5 + Users v2)

### Cambios en backend
- ✅ **Versión estricta DESHABILITADA**: el login ya no devuelve 426 por mismatch de build. El UpdateBanner sigue funcionando para auto-detectar actualizaciones, pero el usuario puede loguearse igual.
- ✅ Nuevos campos User: `first_name`, `last_name`, `phone`, `device_id`, `device_brand`, `device_model`, `device_platform`, `device_os_version`, `device_app_build`, `device_bound_at`, `device_last_seen`.
- ✅ Nuevo modelo `DeviceBind` para el payload de captura.
- ✅ Nuevo endpoint `POST /api/app/device-bind`: primera vez bindea; subsiguientes, actualiza; device distinto → 423 Locked.
- ✅ Nuevo endpoint `POST /api/users/{id}/unbind-device`: admin/super_admin desvincula.
- ✅ Login valida `X-Device-Id` vs `device_id` guardado → 423 Locked si difiere (cliente cambió celular).
- ✅ `create_user` y `update_user` ahora soportan todos los campos nuevos.

### Frontend (client / APK)
- ✅ `lib/deviceBind.js`: usa `@capacitor/device` para leer `deviceId`, `manufacturer`, `model`, `platform`, `osVersion`. Persiste en localStorage.
- ✅ `api.js`: envía `X-Device-Id` en todas las requests automáticamente.
- ✅ `PanicApp.jsx`: al abrir la app, llama `bindDeviceToBackend()`. Si 423 → logout + toast.

### Frontend (admin)
- ✅ **Fase 5 — OrgContext + Org Switcher**: super_admin tiene `<select>` en sidebar ("Todas las organizaciones" + cada org). El filtro se aplica en Alerts.jsx (backend query param) y Users.jsx (client-side filter).
- ✅ **Panel Usuarios v2**:
  - ChipFilter arriba con sintaxis `role:client status:active access:custom device:yes org:xxx`
  - Columnas: Nombre (+ apellido + username + badges), Contacto (email + tel), Rol, Organización, Dispositivo (marca + modelo + plataforma + build + device_id corto), Acciones
  - Botón 🔓 Unbind device (solo si el usuario tiene device vinculado y el admin tiene permiso)
  - Campos en dialog de edit: Nombre display, Nombre, Apellido, Teléfono (+ los anteriores)
- ✅ Dark mode aplicado a toda la tabla y chips

### Testing curl
- Build mismatch → 200 (ya no bloquea) ✅
- Device bind inicial → OK ✅
- Login mismo device → OK ✅
- Login device distinto → 423 ✅
- Admin unbind → OK → nuevo device funciona ✅

## Pendiente (próxima iteración)
- P1: SMS fallback vía Twilio si el push falla
- P2: Múltiples logos por organización (comisión/junta/vecinos)
- P2: Responsive mejorado del Admin Dashboard en móvil
- P2: Instrucciones compilación iOS (requiere cuenta Apple Developer del usuario)
- P2: Endpoint admin `POST /api/app/release` para bumpear+buildear+publicar APK desde UI

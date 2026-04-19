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

## Pendiente (próxima iteración)
- Web Push real (SW + VAPID + pywebpush) para notificaciones con la pestaña cerrada
- Múltiples logos por organización (comisión/junta/vecinos)
- Notificación nativa con sonido customizado en background

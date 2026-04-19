# 🔔 Web Push — Guía de despliegue ÑACURUTU

Esta iteración agrega **Web Push nativo** (las alertas suenan en el celular/escritorio del admin **aunque tenga la pestaña cerrada o el teléfono bloqueado**).

---

## ✨ Qué se agregó

### Backend
- Nuevo módulo `backend/push.py`: auto-genera claves VAPID al iniciar (en `backend/.vapid/`)
- 3 endpoints nuevos bajo `/api/push`:
  - `GET /api/push/vapid-public-key` (público)
  - `POST /api/push/subscribe` (auth)
  - `POST /api/push/unsubscribe` (auth)
- Al crear alerta → ahora envía Web Push a todos los admins suscritos
- Nueva colección MongoDB: `push_subscriptions` (índice único por `endpoint`)

### Frontend
- Nuevo service worker: `frontend/public/service-worker.js` (maneja evento `push`)
- Nueva librería: `frontend/src/lib/webPush.js` (registra SW + suscribe)
- Botón **🔔 Activar push** en sidebar del admin
- Al entrar como admin: si ya concedió permiso previamente, auto-resuscribe silenciosamente

### Dependencias nuevas
- Backend: `pywebpush==2.0.1` (trae `py-vapid`, `http-ece`, `cryptography`)

---

## 🚀 Pasos en tu servidor

```bash
# 1) Pull del código (o push desde Emergent)
cd /var/www/boton-panico
sudo git pull

# 2) Instalar nueva dependencia Python
cd backend
sudo ./venv/bin/pip install -r requirements.txt

# 3) Reiniciar backend (auto-genera claves VAPID la primera vez)
sudo systemctl restart boton-panico-backend

# Verificar que se generaron:
ls -la backend/.vapid/
# Esperado: priv.pem  pub.b64

# 4) Rebuild del frontend (para incluir el service-worker.js)
cd ../frontend
sudo yarn build

# 5) Verificar que el SW se sirve correctamente:
curl -I https://www.aranduinformatica.net/boton-panico/service-worker.js
# Esperado: HTTP/2 200 + Content-Type: application/javascript

# 6) Verificar endpoint VAPID:
curl https://www.aranduinformatica.net/boton-panico/api/push/vapid-public-key
# Esperado: {"publicKey":"B..."}  (~87 caracteres)
```

---

## 📲 Cómo activar push en tu dispositivo

### En escritorio (Chrome/Edge/Firefox):
1. Entrá como admin: `https://www.aranduinformatica.net/boton-panico`
2. En el sidebar, hacé click en **🔔 Activar push**
3. El navegador te pregunta → **"Permitir"**
4. Verás el indicador verde **"● Push activo"**
5. **Cerrá la pestaña** → la PC va a seguir recibiendo notificaciones

### En celular (obligatorio **instalar como app** primero):
1. Entrá a `https://www.aranduinformatica.net/boton-panico` desde Chrome (Android) o Safari (iOS 16.4+)
2. **Menú → "Agregar a pantalla principal" / "Instalar app"**
3. Cerrá el navegador. Abrí la app instalada.
4. Logueate como admin.
5. Sidebar → **🔔 Activar push** → Permitir
6. Cerrá la app completamente.
7. Cuando llegue una alerta → notificación del SO con vibración y sonido, incluso con el teléfono bloqueado ✅

> **iOS**: Apple recién habilitó Web Push en iOS 16.4+. Requiere tener la PWA instalada (no funciona en Safari normal).

---

## 🔐 Sobre las claves VAPID

- Se generan **una sola vez** al primer arranque del backend
- Se guardan en `backend/.vapid/priv.pem` y `backend/.vapid/pub.b64`
- **Están en `.gitignore`** — no se suben al repo (cada instalación tiene sus propias claves)
- Si las borrás por accidente → se regeneran, pero los dispositivos ya suscritos quedarán inválidos y deberán suscribirse de nuevo

### Respaldarlas (recomendado):

```bash
sudo cp -r /var/www/boton-panico/backend/.vapid /root/.vapid_backup_$(date +%F)
```

---

## ✅ Checklist de validación

- [ ] `curl .../api/push/vapid-public-key` devuelve una clave
- [ ] `curl -I .../boton-panico/service-worker.js` responde 200
- [ ] En el admin: botón **"Activar push"** visible
- [ ] Al activarlo: indicador **"Push activo"** verde
- [ ] DevTools → Application → Service Workers → muestra `service-worker.js` activo
- [ ] DevTools → Application → Push Messaging → hay una subscription
- [ ] Enviar alerta desde otro dispositivo → llega notificación del SO aun con la pestaña cerrada

---

## 🛟 Troubleshooting

| Síntoma | Solución |
|---|---|
| Botón "Activar push" queda en **"Notif. bloqueadas"** | Configuración del navegador → Sitio → `www.aranduinformatica.net` → permitir Notificaciones |
| Service Worker no se registra | Verificar HTTPS (SW requiere contexto seguro). Revisá que `https://.../boton-panico/service-worker.js` devuelva 200 |
| Push llega pero sin sonido en iOS | iOS sólo suena si la PWA está **instalada** (no desde Safari web) |
| "Push failed 410" en logs del backend | Subscription muerta — el backend la borra automáticamente |
| Clave pública VAPID cambió | En consola navegador: `navigator.serviceWorker.getRegistration().then(r=>r.pushManager.getSubscription().then(s=>s.unsubscribe()))` → luego reactivar push |

---

## 📱 Guía rápida de testing (para vos)

**Test 1 — Flujo básico web desktop:**
1. PC #1: login como cliente → tap PÁNICO → esperá countdown → envía
2. PC #2: login como admin → activar push → cerrar pestaña
3. PC #1: mandá otra alerta
4. PC #2: notificación nativa del SO debería aparecer 🎉

**Test 2 — Celular (PWA):**
1. Celular: abrir en Chrome → Instalar app
2. Login como admin → Activar push → permitir
3. Cerrar la app por completo (desde multitarea)
4. Desde otro dispositivo/cliente mandá pánico
5. Celular suena + vibra aunque esté bloqueado 📳

**Test 3 — Auto-silencio:**
1. Admin: recibir 3 alertas → sirena sonando
2. Cambiar 1 a "En proceso" → sirena sigue sonando
3. Cambiar las otras 2 → **sirena se corta automáticamente**

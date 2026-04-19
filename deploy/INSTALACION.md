# 🦉 Guía de instalación — ÑACURUTU SEGURIDAD (Botón de Pánico)

Esta guía despliega la app en tu servidor Apache como **`/boton-panico`** junto a tus otras apps.

**Stack final:**
- Frontend compilado en `/var/www/boton-panico/frontend/build` servido por Apache
- Backend FastAPI + Socket.IO en `127.0.0.1:8005`, proxy reverso desde Apache
- MongoDB local en puerto 27017 (base: `boton_panico_db`)

---

## 1️⃣ Requisitos del sistema

```bash
# En tu servidor (una sola vez si no los tienes)
sudo apt update
sudo apt install -y python3.11-venv nodejs npm mongodb

# Módulos Apache necesarios
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite ssl headers
sudo systemctl restart apache2
```

> **Importante:** `proxy_wstunnel` es **obligatorio** para que funcionen las alertas en tiempo real (Socket.IO por WebSocket).

---

## 2️⃣ Traer el código al servidor

```bash
cd /var/www
sudo git clone <URL-de-tu-repo-boton-panico> boton-panico
# o si ya lo tienes:
cd /var/www/boton-panico && sudo git pull
sudo chown -R www-data:www-data /var/www/boton-panico
```

---

## 3️⃣ Configurar el backend

```bash
cd /var/www/boton-panico/backend

# Crear entorno virtual
sudo -u www-data python3 -m venv venv
sudo -u www-data ./venv/bin/pip install --upgrade pip
sudo -u www-data ./venv/bin/pip install -r requirements.txt

# Configurar variables de entorno
sudo cp .env.production.example .env
sudo nano .env
```

Dentro de `.env` ajusta:
- `MONGO_URL="mongodb://localhost:27017"` (tu Mongo local)
- `DB_NAME="boton_panico_db"`
- `JWT_SECRET=...` → generar con: `python3 -c "import secrets; print(secrets.token_hex(32))"`
- `CORS_ORIGINS="https://www.aranduinformatica.net"`
- `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`
- `CLIENT_USER_EMAIL` / `CLIENT_USER_PASSWORD`

```bash
sudo chown www-data:www-data .env
sudo chmod 600 .env
```

---

## 4️⃣ Registrar el backend como servicio systemd

```bash
# Copiar la unidad
sudo cp /var/www/boton-panico/deploy/boton-panico.service \
        /etc/systemd/system/

# Crear carpeta de logs
sudo mkdir -p /var/log/boton-panico
sudo chown www-data:www-data /var/log/boton-panico

# Activar
sudo systemctl daemon-reload
sudo systemctl enable --now boton-panico

# Verificar
sudo systemctl status boton-panico
sudo tail -f /var/log/boton-panico/backend.err.log

# Probar endpoint (debería responder con 401 — sin token — es correcto)
curl http://127.0.0.1:8005/api/auth/me
```

### Manejo del servicio (SERVICE_NAME=`boton-panico`)

```bash
sudo systemctl start boton-panico
sudo systemctl stop boton-panico
sudo systemctl restart boton-panico
sudo systemctl status boton-panico
sudo journalctl -u boton-panico -f
```

---

## 5️⃣ Compilar el frontend

```bash
cd /var/www/boton-panico/frontend

# Instalar deps con yarn (NO npm)
sudo -u www-data yarn install

# Configurar env de producción
sudo cp .env.production.example .env.production
sudo nano .env.production
```

Contenido de `.env.production`:
```
REACT_APP_BACKEND_URL=https://www.aranduinformatica.net
REACT_APP_BASE_PATH=/boton-panico
PUBLIC_URL=/boton-panico
GENERATE_SOURCEMAP=false
```

```bash
# Build
sudo -u www-data yarn build

# Ajustar permisos del build
sudo chown -R www-data:www-data build
```

---

## 6️⃣ Configurar Apache

Abre tu VirtualHost:

```bash
sudo nano /etc/apache2/sites-available/000-default-le-ssl.conf
```

### A) Dentro de `<Directory /var/www/arandujar/frontend/build>` agregar UNA línea

Junto a las demás `RewriteCond !^/...`:

```apache
RewriteCond %{REQUEST_URI} !^/boton-panico
```

### B) Pegar el bloque completo de `/var/www/boton-panico/deploy/apache-boton-panico.conf`

Copia el contenido de ese archivo y pégalo **dentro** de `<VirtualHost *:443>`, por ejemplo después del bloque de PDS y **antes** del bloque `ProxyPass /api http://127.0.0.1:8002/api` (que es el backend principal).

### C) Validar y recargar

```bash
sudo apache2ctl configtest
sudo systemctl reload apache2
```

---

## 7️⃣ Verificar

Abre en tu navegador:

- **App cliente:** https://www.aranduinformatica.net/boton-panico
  - Login con: `jose.escudero@aranduinformatica.net` / `12345678`
  - Deberías ver el **botón SOS rojo**
- **Panel admin:** https://www.aranduinformatica.net/boton-panico (redirige)
  - Login con: `jose@aranduinformatica.net` / `12345678`
  - Verás el dashboard con el indicador **"Tiempo real activo"** en verde

### Checks rápidos

```bash
# Backend respondiendo
curl https://www.aranduinformatica.net/boton-panico/api/auth/me
# → {"detail":"Not authenticated"}  ✔ correcto

# Socket.IO respondiendo por HTTP polling
curl "https://www.aranduinformatica.net/boton-panico/api/socket.io/?EIO=4&transport=polling"
# → 0{"sid":"..."}  ✔ correcto

# Ver logs del backend
sudo journalctl -u boton-panico-backend -f
```

---

## 🔄 Actualizar la app después

```bash
cd /var/www/boton-panico
sudo git pull

# Backend
cd backend
sudo -u www-data ./venv/bin/pip install -r requirements.txt
sudo systemctl restart boton-panico

# Frontend
cd ../frontend
sudo -u www-data yarn install
sudo -u www-data yarn build
# (Apache sirve archivos estáticos, no hace falta reiniciarlo)
```

---

## 🛟 Troubleshooting

**"Tiempo real activo" no aparece (socket no conecta)**
- Verifica: `sudo a2enmod proxy_wstunnel && sudo systemctl restart apache2`
- Mira en consola del navegador (F12) si hay errores 404/502 sobre `/socket.io`

**Login falla con CORS**
- Verifica que `CORS_ORIGINS` en `.env` sea exactamente `https://www.aranduinformatica.net` (sin `/` al final)

**Assets 404 (CSS/JS no cargan)**
- Asegúrate de haber seteado `PUBLIC_URL=/boton-panico` **antes** de `yarn build`
- Rebuild: `cd frontend && sudo -u www-data yarn build`

**Backend no arranca**
- `sudo journalctl -u boton-panico -n 100`
- Verifica Mongo: `sudo systemctl status mongod`

**Rutas admin (ej. /boton-panico/admin/alerts) dan 404 al refrescar**
- Verifica que el bloque `RewriteRule . /boton-panico/index.html [L]` esté dentro de `<Directory>`

---

## 🔐 Post-instalación (recomendado)

1. **Cambia las contraseñas iniciales** entrando al admin y editando los usuarios
2. **Cambia el `JWT_SECRET`** en `.env` y reinicia el backend
3. **Hacer backup de Mongo** con cron diario:
   ```bash
   mongodump --db boton_panico_db --out /backup/boton-panico/$(date +%F)
   ```

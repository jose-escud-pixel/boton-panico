# 🦉 Guía de instalación — ÑACURUTU SEGURIDAD (Botón de Pánico)

Despliegue en tu servidor Apache bajo **`https://www.aranduinformatica.net/boton-panico`**, compatible con tu `arandu-manager.sh` v5.

**Datos clave del deploy:**
| Componente | Valor |
|---|---|
| Path del proyecto | `/var/www/boton-panico` |
| Repo GitHub | `jose-escud-pixel/boton-panico` |
| Servicio systemd | **`boton-panico-backend`** (convención de tu script) |
| Puerto backend | `8005` (interno, proxy desde Apache) |
| Base de datos | MongoDB local → `boton_panico_db` |
| URL pública | `https://www.aranduinformatica.net/boton-panico` |

---

## 📋 Fase 0 — Prerequisitos (UNA sola vez en el servidor)

```bash
# Módulos Apache necesarios (proxy_wstunnel es CLAVE para Socket.IO)
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite ssl headers
sudo systemctl restart apache2

# Verificar que tengas instalados python3, nodejs, yarn, mongodb
python3 --version
node --version
yarn --version
sudo systemctl status mongod    # o: mongodb
```

Si falta alguno:
```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nodejs npm
sudo npm install -g yarn
sudo apt install -y mongodb      # o mongodb-org según tu distro
sudo systemctl enable --now mongod
```

---

## 📥 Fase 1 — Clone inicial desde GitHub

```bash
cd /var/www
sudo git clone https://github.com/jose-escud-pixel/boton-panico.git boton-panico
cd boton-panico
ls -la
# Debes ver: backend/  frontend/  deploy/  README.md
```

> 💡 Tu `arandu-manager.sh` **sólo actualiza** (git fetch + reset), no hace clone inicial. Por eso este paso es manual.

---

## ⚙️ Fase 2 — Preparar el backend

### 2.1) Crear venv e instalar dependencias

```bash
cd /var/www/boton-panico/backend
sudo python3 -m venv venv
sudo ./venv/bin/pip install --upgrade pip
sudo ./venv/bin/pip install -r requirements.txt
```

### 2.2) Crear archivo `.env` de producción

```bash
sudo cp .env.production.example .env
sudo nano .env
```

Pega este contenido (ajustando los valores marcados):

```env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="boton_panico_db"
CORS_ORIGINS="https://www.aranduinformatica.net"

# 🔑 Generá un JWT_SECRET nuevo con:
#   python3 -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET="PEGA_AQUI_UN_HEX_ALEATORIO_DE_64_CARACTERES"

# 👤 Credenciales del super admin inicial (cambialas después del primer login)
SUPER_ADMIN_EMAIL="jose@aranduinformatica.net"
SUPER_ADMIN_PASSWORD="CAMBIAME_12345678"

# 👤 Usuario cliente de prueba (podés eliminarlo después)
CLIENT_USER_EMAIL="jose.escudero@aranduinformatica.net"
CLIENT_USER_PASSWORD="CAMBIAME_12345678"
```

Proteger permisos:
```bash
sudo chmod 600 .env
```

---

## 🎨 Fase 3 — Preparar el frontend

### 3.1) Instalar dependencias

```bash
cd /var/www/boton-panico/frontend
sudo yarn install
```

### 3.2) Crear archivo `.env.production`

```bash
sudo cp .env.production.example .env.production
sudo nano .env.production
```

Contenido (estos valores son los correctos, no los cambies):

```env
REACT_APP_BACKEND_URL=https://www.aranduinformatica.net
REACT_APP_BASE_PATH=/boton-panico
PUBLIC_URL=/boton-panico
GENERATE_SOURCEMAP=false
```

### 3.3) Compilar

```bash
sudo yarn build
ls -la build/index.html   # Verifica que exista
```

---

## 🛠️ Fase 4 — Registrar el servicio systemd

```bash
# Copiar el unit file del repo
sudo cp /var/www/boton-panico/deploy/boton-panico-backend.service \
        /etc/systemd/system/

# Crear carpeta de logs
sudo mkdir -p /var/log/boton-panico

# Activar y arrancar
sudo systemctl daemon-reload
sudo systemctl enable boton-panico-backend
sudo systemctl start boton-panico-backend

# Verificar
sudo systemctl status boton-panico-backend --no-pager
sudo journalctl -u boton-panico-backend -n 30 --no-pager

# Test local del backend
curl http://127.0.0.1:8005/api/auth/me
# Esperado: {"detail":"Not authenticated"}  ✔ correcto
```

Ahora podés manejarlo desde tu `arandu-manager.sh` → opción **2) Administrar servicio** → selecciona `boton-panico` ✅

---

## 🌐 Fase 5 — Configurar Apache

### 5.1) Editar tu VirtualHost

```bash
sudo nano /etc/apache2/sites-available/000-default-le-ssl.conf
```

### 5.2) Agregar UNA línea en el bloque de Arandú&JAR

Dentro de `<Directory /var/www/arandujar/frontend/build>`, junto a las demás `RewriteCond !^/...`:

```apache
RewriteCond %{REQUEST_URI} !^/boton-panico
```

### 5.3) Agregar el bloque completo del botón de pánico

Abrí en otra terminal (o copiá el contenido de `/var/www/boton-panico/deploy/apache-boton-panico.conf`) y pegá **dentro** del `<VirtualHost *:443>`, idealmente **después del bloque de PDS** y **antes** del `ProxyPass /api http://127.0.0.1:8002/api` final.

El bloque a pegar:

```apache
# ========================================================
# === BOTON DE PANICO - ÑACURUTU SEGURIDAD (puerto 8005) ===
# ========================================================

# WebSocket upgrade para Socket.IO (DEBE ir antes de ProxyPass)
RewriteEngine On
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteRule ^/boton-panico/api/socket\.io/(.*) ws://127.0.0.1:8005/api/socket.io/$1 [P,L]

# Proxy HTTP para Socket.IO polling y REST API
ProxyPass        /boton-panico/api  http://127.0.0.1:8005/api
ProxyPassReverse /boton-panico/api  http://127.0.0.1:8005/api

# Archivos estáticos del frontend
Alias /boton-panico /var/www/boton-panico/frontend/build

<Directory /var/www/boton-panico/frontend/build>
    Options -Indexes +FollowSymLinks
    AllowOverride All
    Require all granted

    RewriteEngine On
    RewriteBase /boton-panico/
    RewriteRule ^index\.html$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /boton-panico/index.html [L]
</Directory>
```

### 5.4) Validar y recargar

```bash
sudo apache2ctl configtest
# → Syntax OK

sudo systemctl reload apache2
```

---

## 🔎 Fase 6 — Verificación final

### Desde el navegador:

1. Abrí **https://www.aranduinformatica.net/boton-panico**
2. Deberías ver la pantalla de login con el búho 🦉
3. **Login como super admin:** el que definiste en `SUPER_ADMIN_EMAIL` → te lleva al **Panel de Control**
4. **Login como cliente:** `CLIENT_USER_EMAIL` → te lleva al **botón SOS rojo**

### Desde la terminal:

```bash
# API responde
curl https://www.aranduinformatica.net/boton-panico/api/auth/me
# → {"detail":"Not authenticated"}  ✔

# Socket.IO responde
curl "https://www.aranduinformatica.net/boton-panico/api/socket.io/?EIO=4&transport=polling"
# → 0{"sid":"..."}  ✔

# Logs del backend en vivo
sudo journalctl -u boton-panico-backend -f
```

### En el panel admin, arriba a la izquierda:

Debe aparecer el indicador verde **● Tiempo real activo** → significa que el WebSocket está funcionando.

---

## 🔁 Fase 7 — Actualizaciones futuras (con `arandu-manager.sh`)

A partir de ahora, para actualizar ejecutás:

```bash
sudo arandu-manager.sh
# Menú:
#   3) Update NORMAL (seguro)
#   → Seleccioná /var/www/boton-panico
#   → Branch: main (enter)
#   El script: git pull + pip install + yarn build + systemctl restart boton-panico-backend
```

O manualmente:
```bash
cd /var/www/boton-panico
sudo git pull
cd backend && sudo ./venv/bin/pip install -r requirements.txt
cd ../frontend && sudo yarn install && sudo yarn build
sudo systemctl restart boton-panico-backend
```

---

## 🛟 Troubleshooting

| Síntoma | Solución |
|---|---|
| **Login dice "Network Error"** | Verificá CORS_ORIGINS en `.env` = `https://www.aranduinformatica.net` (sin slash final) |
| **Assets (CSS/JS) dan 404** | Rebuild con `PUBLIC_URL=/boton-panico` seteado en `.env.production`, luego `yarn build` |
| **"Tiempo real activo" NO aparece** | Verificá `sudo a2enmod proxy_wstunnel && sudo systemctl restart apache2` |
| **Refrescar en `/boton-panico/admin/alerts` da 404** | Revisá que `RewriteRule . /boton-panico/index.html [L]` esté dentro del `<Directory>` |
| **Backend no arranca** | `sudo journalctl -u boton-panico-backend -n 100` + verificá que Mongo corra |
| **Apache error 502** | El servicio no está escuchando en 8005 → `sudo systemctl status boton-panico-backend` |
| **"Cambios locales detectados"** al usar arandu-manager | Usar opción **6) Update DESTRUCTIVO** (hace backup antes) |

---

## 🔐 Recomendaciones post-instalación

1. **Cambiá las contraseñas iniciales** desde el panel admin → Usuarios
2. **Renová el JWT_SECRET** en `.env` una vez validado todo y reiniciá
3. **Backup diario de Mongo** con cron:
   ```bash
   sudo crontab -e
   # Agregar:
   0 3 * * * mongodump --db boton_panico_db --out /backup/boton-panico/$(date +\%F) --quiet
   ```
4. **Logs** — rotate en `/etc/logrotate.d/boton-panico`:
   ```
   /var/log/boton-panico/*.log {
       daily
       rotate 14
       compress
       missingok
       notifempty
       copytruncate
   }
   ```

---

## 📂 Resumen de archivos y rutas

```
/var/www/boton-panico/
├── backend/
│   ├── venv/                    # entorno Python (no en git)
│   ├── .env                     # config producción (NO en git)
│   ├── .env.production.example  # plantilla
│   ├── server.py
│   ├── auth.py
│   ├── models.py
│   ├── seed.py
│   └── requirements.txt
├── frontend/
│   ├── node_modules/            # deps yarn (no en git)
│   ├── build/                   # compilado (sirve Apache)
│   ├── .env.production          # config build (NO en git)
│   ├── .env.production.example  # plantilla
│   ├── package.json
│   └── src/
└── deploy/
    ├── INSTALACION.md                 # este archivo
    ├── apache-boton-panico.conf       # bloque Apache
    └── boton-panico-backend.service   # unit systemd

/etc/systemd/system/boton-panico-backend.service   # copia del anterior
/var/log/boton-panico/                             # logs
/etc/apache2/sites-available/000-default-le-ssl.conf  # editado
```

---

## ✅ Checklist rápido

- [ ] `a2enmod proxy_wstunnel` ejecutado
- [ ] Repo clonado en `/var/www/boton-panico`
- [ ] Backend `.env` creado con JWT_SECRET único
- [ ] Backend venv + `pip install -r requirements.txt`
- [ ] Frontend `.env.production` creado
- [ ] Frontend `yarn install && yarn build`
- [ ] `boton-panico-backend.service` copiado a `/etc/systemd/system/`
- [ ] `systemctl enable --now boton-panico-backend` y activo
- [ ] Apache: línea `RewriteCond !^/boton-panico` agregada en bloque ArandúJAR
- [ ] Apache: bloque botón de pánico pegado
- [ ] `apache2ctl configtest` pasa
- [ ] `systemctl reload apache2` ejecutado
- [ ] https://www.aranduinformatica.net/boton-panico carga login
- [ ] Login como admin funciona + "Tiempo real activo" verde
- [ ] Login como cliente funciona + botón SOS visible

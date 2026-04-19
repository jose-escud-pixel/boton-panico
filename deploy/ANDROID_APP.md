# 🦉 ÑACURUTU Seguridad — App Android (Capacitor)

Esta guía genera la **APK instalable** para Android que los clientes y admins pueden usar desde el celular, con **notificaciones push nativas en background** vía Firebase Cloud Messaging (FCM).

---

## 📋 Lo que ya está hecho

| Pieza | Estado |
|---|---|
| Backend con endpoint `/api/push/fcm-register` | ✅ |
| Firebase Admin SDK integrado en backend | ✅ |
| Service Account JSON instalado | ✅ |
| Librería `nativePush.js` en frontend | ✅ |
| `capacitor.config.json` configurado | ✅ |
| `google-services.json` listo para copiar | ✅ |
| Admin web: push removido (queda sirena + voz) | ✅ |
| Script de build de APK | ✅ |

---

## 🚀 Compilar la APK en tu servidor

### 1) Hacer `git pull` en el servidor

```bash
cd /var/www/boton-panico
sudo git pull
sudo chown -R www-data:www-data /var/www/boton-panico
```

### 2) Copiar archivos de Firebase al servidor

**⚠️ IMPORTANTE:** El `service-account.json` es **SECRETO** y NO va al repo de GitHub. Lo subís manualmente al servidor:

**Opción A — via scp (desde tu PC local donde descargaste los JSON):**
```bash
# Desde tu PC local
scp /ruta/a/nacurutu-seguridad-firebase-adminsdk-*.json \
    root@tecnico:/var/www/boton-panico/backend/.firebase/service-account.json
```

**Opción B — crear el archivo directamente en el servidor con nano:**
```bash
sudo mkdir -p /var/www/boton-panico/backend/.firebase
sudo nano /var/www/boton-panico/backend/.firebase/service-account.json
# Pegá el contenido completo del JSON que descargaste de Firebase
sudo chmod 600 /var/www/boton-panico/backend/.firebase/service-account.json
```

El `google-services.json` (para Android) sí viene en el repo bajo `firebase-credentials/`:

```bash
# Copiar al lugar que espera el script de build:
sudo cp /var/www/boton-panico/firebase-credentials/google-services.json \
        /var/www/boton-panico/frontend/google-services.json
```

### 3) Reiniciar backend

```bash
cd /var/www/boton-panico/backend
sudo ./venv/bin/pip install -r requirements.txt
sudo systemctl restart boton-panico-backend

# Verificar que Firebase se inicialice sin error:
sudo journalctl -u boton-panico-backend -n 30 | grep -i firebase
# Esperado: "Firebase Admin SDK initialized"
```

### 4) Ejecutar el script de build

```bash
sudo bash /var/www/boton-panico/deploy/build-android-apk.sh
```

**Lo que hace el script** (la primera vez tarda ~10 min porque descarga Android SDK):
1. Verifica/instala Java 17 (OpenJDK)
2. Descarga Android SDK cmdline-tools a `/opt/android-sdk/` (~500 MB)
3. Acepta licencias + instala `platform-tools` + `android-34` + `build-tools 34.0.0`
4. Compila el frontend React con `yarn build`
5. Genera proyecto Android con `npx cap add android`
6. Copia `google-services.json` al módulo Android
7. Aplica el plugin Google Services a `build.gradle`
8. Compila `assembleDebug`
9. Deja la APK en `/root/apks/nacurutu-seguridad-YYYYMMDD-HHMM.apk`

**Segundas corridas**: sólo 2-3 min (SDK ya instalado, sólo cambia el código).

### 5) Descargar la APK a tu celular

**Opción A — vía WhatsApp / Telegram:**
```bash
# Copiá la APK a un lugar servible
sudo cp /root/apks/nacurutu-seguridad-*.apk /var/www/html/
# Luego descargá desde: http://IP-servidor/nacurutu-seguridad-XXX.apk
```

**Opción B — Apache (más prolijo):**

Agregar al VirtualHost un alias para servir APKs:

```apache
Alias /downloads /var/www/downloads
<Directory /var/www/downloads>
    Options -Indexes +FollowSymLinks
    AllowOverride None
    Require all granted
    <FilesMatch "\.apk$">
        Header set Content-Type "application/vnd.android.package-archive"
    </FilesMatch>
</Directory>
```

```bash
sudo mkdir -p /var/www/downloads
sudo cp /root/apks/nacurutu-seguridad-*.apk /var/www/downloads/nacurutu-latest.apk
sudo systemctl reload apache2
# Descargá desde: https://www.aranduinformatica.net/downloads/nacurutu-latest.apk
```

---

## 📱 Instalar en el celular

### Android
1. Abrí el enlace/APK en el celular
2. Saldrá "Esta app es de fuentes desconocidas". Tocá **"Configuración"** → habilitá "Permitir instalaciones de esta fuente"
3. Instalar → abrir **"ÑACURUTU Seguridad"**
4. Login con tus credenciales (mismas que el web)
5. Te pedirá permisos:
   - ✅ Ubicación (obligatorio — sin esto no se pueden enviar alertas)
   - ✅ Notificaciones (obligatorio para recibir alertas como admin)
   - ✅ Micrófono y Cámara (opcional — para grabar audio y foto en alertas)

### iOS (futuro, requiere Apple Developer)
Todavía no compilamos el IPA. Cuando tengas Apple Developer:
```bash
cd /var/www/boton-panico/frontend
yarn cap add ios
# ... requiere Mac + Xcode para compilar
```

El código ya está preparado (tenemos `GoogleService-Info.plist` y `@capacitor/ios` instalado).

---

## 🧪 Testing completo

### Test 1 — Cliente envía, admin recibe (con app cerrada)

1. **Celular A** (cliente Android, app cerrada o en background):
   - Abrir app → login `jose.escudero@aranduinformatica.net / 12345678`
   - Permitir ubicación + notificaciones
2. **Celular B** (admin):
   - Abrir app → login `jose@aranduinformatica.net / 12345678`
   - Permitir notificaciones
   - **Cerrar app completamente**
3. **Celular A**: tap PÁNICO → esperá countdown 5s → envía
4. **Celular B**: debería sonar + vibrar + mostrar notificación del SO **aunque la app esté cerrada** ✅

### Test 2 — Admin auto-silencia cuando cambia estado

1. Admin en PC web (no app) → abrir `/boton-panico`
2. Cliente envía PÁNICO desde la app
3. Admin PC: suena sirena + voz "Pánico"
4. Admin cambia estado a "En proceso" → sirena se corta 🤫

---

## 🔐 Seguridad post-deploy

1. **Cambiar contraseñas iniciales** desde admin → Usuarios
2. **Restringir el API key de Firebase** (solo para Android):
   - https://console.cloud.google.com/apis/credentials
   - Seleccionar el API key → Restricciones de aplicación → Apps Android
   - Agregar: paquete `net.aranduinformatica.nacurutu` + huella SHA-1 (del keystore debug: `~/.android/debug.keystore`)
3. **NO commitear** `/backend/.firebase/service-account.json` al repo (ya está en `.gitignore`)

---

## 🛟 Troubleshooting

| Síntoma | Solución |
|---|---|
| "Firebase init failed" en logs backend | Verificar que `backend/.firebase/service-account.json` exista y tenga permisos 600 |
| Gradle build falla por OOM | `echo 'org.gradle.jvmargs=-Xmx2g' >> android/gradle.properties` |
| FCM send failed: "SenderId mismatch" | El `google-services.json` no coincide con el service account. Regenerá en Firebase |
| App crashea al abrir | Revisar `adb logcat` buscando el paquete `net.aranduinformatica.nacurutu` |
| APK instalada pero sin push | Verificar que el celular tenga Google Play Services (no funciona en celulares chinos sin GMS) |
| Backend crashea al iniciar | Si no tenés Firebase configurado, el código degrada sin error; si crashea revisá `journalctl` |

---

## 📦 Versión release (firmada) para producción

La APK debug tiene el keystore de Android Studio por defecto. Para una release signed:

```bash
cd /var/www/boton-panico/frontend/android
# Generar keystore (una sola vez, GUARDALO SEGURO)
keytool -genkey -v -keystore nacurutu-release.keystore -alias nacurutu -keyalg RSA -keysize 2048 -validity 10000
# Config en ~/.gradle/gradle.properties:
# NACURUTU_STORE_FILE=/var/www/boton-panico/frontend/android/nacurutu-release.keystore
# NACURUTU_KEY_ALIAS=nacurutu
# NACURUTU_STORE_PASSWORD=***
# NACURUTU_KEY_PASSWORD=***
# Luego editar app/build.gradle con signingConfigs y ejecutar:
./gradlew assembleRelease
```

Para subir a Google Play necesitás este release firmado + cuenta de Google Play Developer ($25 único).

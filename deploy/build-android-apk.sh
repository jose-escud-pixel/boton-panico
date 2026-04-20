#!/bin/bash
# ============================================================
# ÑACURUTU SEGURIDAD — Script de construcción de APK Android
# Genera: /var/www/boton-panico/frontend/android/app/build/outputs/apk/debug/app-debug.apk
# ============================================================
# Uso:
#   sudo bash /var/www/boton-panico/deploy/build-android-apk.sh
# ============================================================

set -e

# ---------- Configuración ----------
PROJECT_ROOT="/var/www/boton-panico"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
ANDROID_DIR="$FRONTEND_DIR/android"
GOOGLE_SERVICES_SRC="$FRONTEND_DIR/google-services.json"   # debe existir acá
APK_OUT_DIR="/root/apks"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}==>${NC} $*"; }
warn() { echo -e "${YELLOW}!!!${NC} $*"; }
err() { echo -e "${RED}ERROR:${NC} $*" >&2; }

# ---------- Paso 1: Verificar dependencias del sistema ----------
log "Paso 1 — Verificando herramientas..."

command -v node >/dev/null 2>&1 || { err "node no instalado. apt install nodejs"; exit 1; }
command -v yarn >/dev/null 2>&1 || { err "yarn no instalado. npm i -g yarn"; exit 1; }

if ! command -v java >/dev/null 2>&1; then
    warn "Java no instalado. Instalando OpenJDK 17..."
    apt update
    apt install -y openjdk-17-jdk
fi

JAVA_VER=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}' | cut -d'.' -f1)
if [ "$JAVA_VER" -lt 17 ]; then
    err "Se requiere Java 17+. Tenés versión $JAVA_VER"
    err "Instalá con: apt install openjdk-17-jdk && update-alternatives --config java"
    exit 1
fi

export JAVA_HOME=$(readlink -f /usr/bin/java | sed 's:/bin/java::')
log "JAVA_HOME=$JAVA_HOME"

# ---------- Paso 2: Instalar Android SDK cmdline-tools (si no existe) ----------
ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"

if [ ! -d "$ANDROID_HOME/cmdline-tools/latest" ]; then
    log "Paso 2 — Instalando Android SDK cmdline-tools en $ANDROID_HOME..."
    mkdir -p "$ANDROID_HOME/cmdline-tools"
    cd /tmp
    rm -rf cmdline-tools-tmp
    wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O cmdline-tools.zip
    unzip -q cmdline-tools.zip -d cmdline-tools-tmp
    mv cmdline-tools-tmp/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"
    rm -rf cmdline-tools.zip cmdline-tools-tmp

    export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

    yes | sdkmanager --licenses > /dev/null 2>&1 || true
    sdkmanager --install "platforms;android-34" "platform-tools" "build-tools;34.0.0" > /dev/null
else
    log "Paso 2 — Android SDK ya instalado en $ANDROID_HOME"
fi

export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

# ---------- Paso 3: Verificar que esté google-services.json ----------
if [ ! -f "$GOOGLE_SERVICES_SRC" ]; then
    err "Falta $GOOGLE_SERVICES_SRC"
    err "Copiar el google-services.json de Firebase a $FRONTEND_DIR/"
    exit 1
fi
log "Paso 3 — google-services.json OK"

# ---------- Paso 3b: Auto-increment versionCode + sync APP_BUILD en el bundle JS ----------
# IMPORTANTE: debe correr ANTES de yarn build para que el bundle embebido
# tenga el APP_BUILD correcto (el que luego se comparará contra version.json).
VERSION_CODE_FILE="$PROJECT_ROOT/.apk-version-code"
if [ ! -f "$VERSION_CODE_FILE" ]; then
    echo "1" > "$VERSION_CODE_FILE"
fi

CURRENT_CODE=$(cat "$VERSION_CODE_FILE")
NEW_CODE=$((CURRENT_CODE + 1))
echo "$NEW_CODE" > "$VERSION_CODE_FILE"

APP_VERSION_NAME=$(grep -E "APP_VERSION\s*=" "$FRONTEND_DIR/src/lib/appVersion.js" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
APP_VERSION_NAME="${APP_VERSION_NAME:-1.0.0}"

log "Paso 3b — versionCode: $CURRENT_CODE → $NEW_CODE, versionName: $APP_VERSION_NAME"

# Escribir el nuevo APP_BUILD en appVersion.js para que el bundle JS lo tenga
APP_VERSION_JS="$FRONTEND_DIR/src/lib/appVersion.js"
sed -i -E "s/export const APP_BUILD = [0-9]+;/export const APP_BUILD = $NEW_CODE;/" "$APP_VERSION_JS"

if ! grep -q "APP_BUILD = $NEW_CODE;" "$APP_VERSION_JS"; then
    warn "No se pudo actualizar APP_BUILD en $APP_VERSION_JS"
fi

# ---------- Paso 4: Build del frontend React ----------
log "Paso 4 — Compilando frontend React..."
cd "$FRONTEND_DIR"
yarn install
yarn build

# ---------- Paso 5: Generar el proyecto Android con Capacitor (si no existe) ----------
if [ ! -d "$ANDROID_DIR" ]; then
    log "Paso 5 — Generando proyecto Android con Capacitor..."
    yarn cap add android
    yarn cap sync android
else
    log "Paso 5 — Sincronizando Capacitor..."
    yarn cap sync android
fi

# ---------- Paso 6: Copiar google-services.json ----------
log "Paso 6 — Copiando google-services.json al módulo Android..."
cp "$GOOGLE_SERVICES_SRC" "$ANDROID_DIR/app/google-services.json"

# ---------- Paso 7: Aplicar plugin Google Services al build.gradle ----------
BUILD_GRADLE_APP="$ANDROID_DIR/app/build.gradle"
BUILD_GRADLE_ROOT="$ANDROID_DIR/build.gradle"

# Añadir classpath de Google Services al build.gradle raíz si no está
if ! grep -q "google-services" "$BUILD_GRADLE_ROOT"; then
    log "Paso 7a — Agregando plugin Google Services al build.gradle raíz"
    sed -i '/dependencies {/a\        classpath '\''com.google.gms:google-services:4.4.2'\''' "$BUILD_GRADLE_ROOT"
fi

# Aplicar plugin en app/build.gradle al final si no está
if ! grep -q "google-services" "$BUILD_GRADLE_APP"; then
    log "Paso 7b — Aplicando plugin Google Services al app/build.gradle"
    echo "" >> "$BUILD_GRADLE_APP"
    echo "apply plugin: 'com.google.gms.google-services'" >> "$BUILD_GRADLE_APP"
fi

# ---------- Paso 7c: Aplicar versionCode + versionName al gradle ----------
# El valor de NEW_CODE y APP_VERSION_NAME ya se calcularon en Paso 3b.
log "Paso 7c — Aplicando versionCode=$NEW_CODE al app/build.gradle"

# Reemplazar versionCode y versionName en app/build.gradle
sed -i -E "s/versionCode[[:space:]]+[0-9]+/versionCode $NEW_CODE/" "$BUILD_GRADLE_APP"
sed -i -E "s/versionName[[:space:]]+\"[^\"]*\"/versionName \"$APP_VERSION_NAME\"/" "$BUILD_GRADLE_APP"

# Verificación
if ! grep -q "versionCode $NEW_CODE" "$BUILD_GRADLE_APP"; then
    warn "No se pudo actualizar versionCode en $BUILD_GRADLE_APP — seguimos igual."
fi

# ---------- Paso 7d: Asegurar permisos en AndroidManifest.xml ----------
# Capacitor NO agrega retroactivamente permisos si el proyecto Android ya existía.
# Este paso garantiza que estén TODOS los permisos críticos de la app.
MANIFEST="$ANDROID_DIR/app/src/main/AndroidManifest.xml"
if [ ! -f "$MANIFEST" ]; then
    err "No se encontró $MANIFEST"
    exit 1
fi

PERMS_NEEDED=(
    "android.permission.INTERNET"
    "android.permission.ACCESS_NETWORK_STATE"
    "android.permission.ACCESS_FINE_LOCATION"
    "android.permission.ACCESS_COARSE_LOCATION"
    "android.permission.POST_NOTIFICATIONS"
    "android.permission.VIBRATE"
    "android.permission.RECORD_AUDIO"
    "android.permission.CAMERA"
    "android.permission.READ_EXTERNAL_STORAGE"
    "android.permission.WAKE_LOCK"
    "android.permission.FOREGROUND_SERVICE"
    "android.permission.FOREGROUND_SERVICE_SPECIAL_USE"
)

log "Paso 7d — Verificando permisos en AndroidManifest.xml..."
ADDED_COUNT=0
for PERM in "${PERMS_NEEDED[@]}"; do
    if ! grep -q "\"$PERM\"" "$MANIFEST"; then
        # Insertar ANTES de </manifest>
        sed -i "/<\/manifest>/i\    <uses-permission android:name=\"$PERM\" />" "$MANIFEST"
        log "   + Agregado: $PERM"
        ADDED_COUNT=$((ADDED_COUNT + 1))
    fi
done
if [ "$ADDED_COUNT" -eq 0 ]; then
    log "   Todos los permisos ya estaban presentes."
else
    log "   $ADDED_COUNT permiso(s) agregado(s) al manifest."
fi

# ---------- Paso 7e: Instalar plugin nativo PowerButtonPanic ----------
log "Paso 7e — Instalando plugin nativo PowerButtonPanic..."
JAVA_PKG_DIR="$ANDROID_DIR/app/src/main/java/net/aranduinformatica/nacurutu"
PLUGIN_SRC_DIR="$PROJECT_ROOT/deploy/android-plugin"

if [ ! -d "$JAVA_PKG_DIR" ]; then
    err "No existe $JAVA_PKG_DIR (¿cambió el appId?). Saltando instalación del plugin."
else
    cp "$PLUGIN_SRC_DIR/PowerButtonPlugin.java" "$JAVA_PKG_DIR/PowerButtonPlugin.java"
    cp "$PLUGIN_SRC_DIR/PowerButtonService.java" "$JAVA_PKG_DIR/PowerButtonService.java"
    log "   + Copiado PowerButtonPlugin.java"
    log "   + Copiado PowerButtonService.java"

    # Registrar plugin en MainActivity.java
    MAIN_ACTIVITY="$JAVA_PKG_DIR/MainActivity.java"
    if [ -f "$MAIN_ACTIVITY" ] && ! grep -q "PowerButtonPlugin.class" "$MAIN_ACTIVITY"; then
        # Insertar registerPlugin ANTES del super.onCreate
        if grep -q "super.onCreate" "$MAIN_ACTIVITY"; then
            sed -i '/super\.onCreate/i\        registerPlugin(PowerButtonPlugin.class);' "$MAIN_ACTIVITY"
            log "   + Plugin registrado en MainActivity.java"
        else
            # MainActivity minimal (no tiene onCreate override) — añadir método
            sed -i '/public class MainActivity/a\    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        registerPlugin(PowerButtonPlugin.class);\n        super.onCreate(savedInstanceState);\n    }' "$MAIN_ACTIVITY"
            log "   + onCreate agregado a MainActivity.java"
        fi
    fi

    # Registrar <service> en AndroidManifest.xml dentro de <application>
    if ! grep -q "PowerButtonService" "$MANIFEST"; then
        SERVICE_BLOCK='        <service\n            android:name=".PowerButtonService"\n            android:enabled="true"\n            android:exported="false"\n            android:foregroundServiceType="specialUse">\n            <property\n                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"\n                android:value="Vigilancia del boton de panico para emergencias personales" \/>\n        <\/service>'
        sed -i "/<\/application>/i\\$SERVICE_BLOCK" "$MANIFEST"
        log "   + <service> PowerButtonService agregado al manifest"
    fi

    # Agregar intent-filter para scheme nacurutu:// dentro del MainActivity activity
    if ! grep -q "android:scheme=\"nacurutu\"" "$MANIFEST"; then
        INTENT_BLOCK='            <intent-filter>\n                <action android:name="android.intent.action.VIEW" \/>\n                <category android:name="android.intent.category.DEFAULT" \/>\n                <category android:name="android.intent.category.BROWSABLE" \/>\n                <data android:scheme="nacurutu" \/>\n            <\/intent-filter>'
        # Insertar antes del cierre del <activity> principal (después del intent-filter LAUNCHER)
        sed -i "/<\/activity>/i\\$INTENT_BLOCK" "$MANIFEST"
        log "   + intent-filter nacurutu:// agregado al manifest"
    fi
fi

# ---------- Paso 8: Build APK debug ----------
log "Paso 8 — Compilando APK..."
cd "$ANDROID_DIR"
chmod +x ./gradlew
./gradlew assembleDebug

APK_BUILT="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK_BUILT" ]; then
    err "Falló el build. APK no encontrada en $APK_BUILT"
    exit 1
fi

mkdir -p "$APK_OUT_DIR"
APK_OUT="$APK_OUT_DIR/nacurutu-seguridad-$(date +%Y%m%d-%H%M).apk"
cp "$APK_BUILT" "$APK_OUT"
SIZE=$(du -h "$APK_OUT" | cut -f1)

# ---------- Paso 9: Publicar en Apache (/var/www/boton-panico/downloads) ----------
DOWNLOADS_DIR="$PROJECT_ROOT/downloads"
mkdir -p "$DOWNLOADS_DIR"
cp "$APK_BUILT" "$DOWNLOADS_DIR/nacurutu-latest.apk"
chmod 644 "$DOWNLOADS_DIR/nacurutu-latest.apk"

# Leer APP_VERSION desde el código fuente del frontend
APP_VERSION=$(grep -E "APP_VERSION\s*=" "$FRONTEND_DIR/src/lib/appVersion.js" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
APP_VERSION="${APP_VERSION:-1.0.0}"

# Generar version.json para el banner de actualización
cat > "$DOWNLOADS_DIR/version.json" <<EOF
{
  "version": "$APP_VERSION",
  "versionCode": $NEW_CODE,
  "apk_url": "/boton-panico/downloads/nacurutu-latest.apk",
  "changelog": "Build $(date '+%Y-%m-%d %H:%M')",
  "build_timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}
EOF
chmod 644 "$DOWNLOADS_DIR/version.json"

log ""
log "============================================"
log "  ✅ APK GENERADA EXITOSAMENTE"
log "============================================"
log "  Archivo: $APK_OUT"
log "  Tamaño: $SIZE"
log "  Versión: $APP_VERSION (versionCode: $NEW_CODE)"
log ""
log "  📤 Publicado en Apache:"
log "     $DOWNLOADS_DIR/nacurutu-latest.apk"
log "     $DOWNLOADS_DIR/version.json"
log ""
log "  Descarga pública:"
log "     https://www.aranduinformatica.net/boton-panico/downloads/nacurutu-latest.apk"
log ""
log "  Para instalar en tu celular:"
log "  1) Activá 'Instalar apps de fuentes desconocidas' en Android"
log "  2) Entrá desde el celular a la URL de descarga pública"
log "  3) Abrí 'ÑACURUTU Seguridad' → login → permitir notificaciones + ubicación"
log "============================================"

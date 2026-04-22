#!/bin/bash
# ============================================================
# ÑACURUTU SEGURIDAD — Script de construcción de APK Android
# ============================================================
# Uso:
#   sudo bash deploy/build-android-apk.sh           # APK Cliente (default)
#   sudo bash deploy/build-android-apk.sh --admin   # APK Admin
# ============================================================

set -e

# ---------- Parseo de argumentos ----------
BUILD_MODE="client"
for arg in "$@"; do
    case "$arg" in
        --admin) BUILD_MODE="admin" ;;
        --client) BUILD_MODE="client" ;;
    esac
done

# ---------- Configuración ----------
PROJECT_ROOT="/var/www/boton-panico"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
ANDROID_DIR="$FRONTEND_DIR/android"
GOOGLE_SERVICES_SRC="$FRONTEND_DIR/google-services.json"   # debe existir acá
APK_OUT_DIR="/root/apks"

# Si es admin, cambia el config de Capacitor y el sufijo de archivos
if [ "$BUILD_MODE" = "admin" ]; then
    CAPACITOR_CONFIG="$FRONTEND_DIR/capacitor.admin.config.json"
    APK_FILENAME="nacurutu-admin-latest.apk"
    VERSION_JSON_FILENAME="version-admin.json"
    APP_DISPLAY_NAME="ÑACURUTU Seguridad Admin"
    APP_ID="net.aranduinformatica.nacurutu.admin"
else
    CAPACITOR_CONFIG="$FRONTEND_DIR/capacitor.config.json"
    APK_FILENAME="nacurutu-latest.apk"
    VERSION_JSON_FILENAME="version.json"
    APP_DISPLAY_NAME="ÑACURUTU Seguridad"
    APP_ID="net.aranduinformatica.nacurutu"
fi

# Contador GLOBAL (compartido entre cliente y admin) para evitar regresiones
# accidentales de versionCode. Android rechaza instalar un APK con versionCode
# menor al ya instalado — así que siempre subimos, pase lo que pase.
VERSION_CODE_FILE="$PROJECT_ROOT/.apk-version-code"
# Archivos legacy (deprecados, sólo se leen para sincronizar al máximo)
LEGACY_ADMIN_VC="$PROJECT_ROOT/.apk-version-code-admin"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}==>${NC} $*"; }
warn() { echo -e "${YELLOW}!!!${NC} $*"; }
err() { echo -e "${RED}ERROR:${NC} $*" >&2; }

log "${BLUE}BUILD MODE: $BUILD_MODE${NC}  →  $APP_DISPLAY_NAME"

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
#
# Usamos un contador GLOBAL y además nos sincronizamos con el MAYOR versionCode
# publicado (entre counter, legacy admin counter, version.json del cliente y del
# admin). Android rechaza APKs con versionCode menor al ya instalado, así que
# nunca bajamos — siempre subimos desde el máximo conocido.
if [ ! -f "$VERSION_CODE_FILE" ]; then
    echo "0" > "$VERSION_CODE_FILE"
fi

# Recolectar todos los versionCode posibles y quedarnos con el máximo
MAX_SEEN=$(cat "$VERSION_CODE_FILE" 2>/dev/null || echo 0)
if [ -f "$LEGACY_ADMIN_VC" ]; then
    L=$(cat "$LEGACY_ADMIN_VC" 2>/dev/null || echo 0)
    [ "$L" -gt "$MAX_SEEN" ] && MAX_SEEN=$L
fi
for VJ in "$PROJECT_ROOT/downloads/version.json" "$PROJECT_ROOT/downloads/version-admin.json"; do
    if [ -f "$VJ" ]; then
        VC=$(python3 -c "import json; print(json.load(open('$VJ')).get('versionCode', 0))" 2>/dev/null || echo 0)
        [ "$VC" -gt "$MAX_SEEN" ] && MAX_SEEN=$VC
    fi
done

CURRENT_CODE=$MAX_SEEN
NEW_CODE=$((CURRENT_CODE + 1))
echo "$NEW_CODE" > "$VERSION_CODE_FILE"

APP_VERSION_NAME=$(grep -E "APP_VERSION\s*=" "$FRONTEND_DIR/src/lib/appVersion.js" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
APP_VERSION_NAME="${APP_VERSION_NAME:-1.0.0}"

log "Paso 3b — versionCode sincronizado al máximo conocido: $CURRENT_CODE → $NEW_CODE (versionName: $APP_VERSION_NAME)"

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
# ---------- Paso 4: Build del frontend React ----------
log "Paso 4 — Compilando frontend React (mode=$BUILD_MODE)..."
cd "$FRONTEND_DIR"
yarn install

# Copiar el config de Capacitor correcto según el modo a la ubicación estándar
# que yarn cap espera (capacitor.config.json en la raíz del frontend).
# Hacemos backup del original antes.
if [ "$BUILD_MODE" = "admin" ]; then
    cp "$FRONTEND_DIR/capacitor.config.json" "$FRONTEND_DIR/capacitor.config.json.backup" 2>/dev/null || true
    cp "$FRONTEND_DIR/capacitor.admin.config.json" "$FRONTEND_DIR/capacitor.config.json"
    log "   → capacitor.config.json sobrescrito con versión admin"
fi

REACT_APP_BUILD_MODE=$BUILD_MODE yarn build

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

# ---------- Paso 6b: Parchar package_name del google-services.json ----------
# El archivo original de Firebase tiene registrado net.aranduinformatica.nacurutu.
# Cuando compilamos admin (applicationId = ...nacurutu.admin), el plugin
# google-services falla con "No matching client found for package name".
# Solución: reescribir el package_name de todos los clients al APP_ID actual.
# Como ambas APKs viven en el mismo proyecto Firebase (mismo sender_id, api_key),
# FCM sigue funcionando perfectamente para las dos.
log "Paso 6b — Reescribiendo package_name en google-services.json → $APP_ID"
python3 <<PYEOF
import json, sys
path = "$ANDROID_DIR/app/google-services.json"
try:
    with open(path) as f:
        d = json.load(f)
    changed = 0
    for c in d.get("client", []):
        ci = c.get("client_info", {}).get("android_client_info", {})
        if ci.get("package_name") != "$APP_ID":
            ci["package_name"] = "$APP_ID"
            changed += 1
    with open(path, "w") as f:
        json.dump(d, f, indent=2)
    print(f"   → {changed} client(s) parchados a $APP_ID")
except Exception as e:
    print(f"ERROR parchando google-services.json: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF

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

# ---------- Paso 7c.2: Aplicar applicationId + app_name según modo ----------
# CRUCIAL: sin esto, cliente y admin APK comparten el mismo package ID y
# Android los trata como "actualización" en vez de apps distintas.
# Reemplazamos applicationId en app/build.gradle y app_name en strings.xml.
log "Paso 7c.2 — applicationId=$APP_ID, app_name=\"$APP_DISPLAY_NAME\""
sed -i -E "s/applicationId[[:space:]]+\"[^\"]*\"/applicationId \"$APP_ID\"/" "$BUILD_GRADLE_APP"
if ! grep -q "applicationId \"$APP_ID\"" "$BUILD_GRADLE_APP"; then
    warn "No se pudo actualizar applicationId en $BUILD_GRADLE_APP"
fi

STRINGS_XML="$ANDROID_DIR/app/src/main/res/values/strings.xml"
if [ -f "$STRINGS_XML" ]; then
    # Escapar caracteres que pueden romper sed (principalmente / y &)
    SAFE_NAME=$(echo "$APP_DISPLAY_NAME" | sed -e 's/[\/&]/\\&/g')
    sed -i -E "s|<string name=\"app_name\">[^<]*</string>|<string name=\"app_name\">$SAFE_NAME</string>|" "$STRINGS_XML"
    sed -i -E "s|<string name=\"title_activity_main\">[^<]*</string>|<string name=\"title_activity_main\">$SAFE_NAME</string>|" "$STRINGS_XML"
    if ! grep -q ">$APP_DISPLAY_NAME<" "$STRINGS_XML"; then
        warn "No se pudo actualizar app_name en $STRINGS_XML"
    fi
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
    "android.permission.SYSTEM_ALERT_WINDOW"
    "android.permission.USE_FULL_SCREEN_INTENT"
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

    # Registrar plugin en MainActivity.java — sobrescribir con versión conocida
    # (evita errores de sed si el archivo original era de una sola línea).
    MAIN_ACTIVITY="$JAVA_PKG_DIR/MainActivity.java"
    if [ -f "$PLUGIN_SRC_DIR/MainActivity.java" ]; then
        cp "$PLUGIN_SRC_DIR/MainActivity.java" "$MAIN_ACTIVITY"
        log "   + MainActivity.java reemplazado (con registerPlugin)"
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

# ---------- Paso 7f: Copiar siren.ogg a res/raw (sólo build admin) ----------
if [ "$BUILD_MODE" = "admin" ]; then
    SIREN_SRC="$PROJECT_ROOT/deploy/assets/siren.ogg"
    RES_RAW_DIR="$ANDROID_DIR/app/src/main/res/raw"
    if [ -f "$SIREN_SRC" ]; then
        mkdir -p "$RES_RAW_DIR"
        cp "$SIREN_SRC" "$RES_RAW_DIR/siren.ogg"
        log "Paso 7f — siren.ogg copiada a res/raw (modo admin)"
    else
        warn "Paso 7f — No se encontró $SIREN_SRC. El push admin no tendrá sonido custom."
    fi
fi

# ---------- Paso 7g: Copiar icono custom del launcher (sólo build admin) ----------
# El icono por default de Capacitor es igual al del cliente. En modo admin
# sobreescribimos los 5 tamaños de mipmap con el icono del búho con badge ADMIN
# (fuente: deploy/assets/icons/ic_launcher_*.png).
if [ "$BUILD_MODE" = "admin" ]; then
    ICONS_SRC="$PROJECT_ROOT/deploy/assets/icons"
    RES_DIR="$ANDROID_DIR/app/src/main/res"
    if [ -d "$ICONS_SRC" ]; then
        log "Paso 7g — Copiando iconos launcher custom (modo admin)..."
        COPIED=0
        for DPI in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
            MIPMAP_DIR="$RES_DIR/mipmap-$DPI"
            mkdir -p "$MIPMAP_DIR"
            if [ -f "$ICONS_SRC/ic_launcher_$DPI.png" ]; then
                cp "$ICONS_SRC/ic_launcher_$DPI.png" "$MIPMAP_DIR/ic_launcher.png"
                COPIED=$((COPIED+1))
            fi
            if [ -f "$ICONS_SRC/ic_launcher_round_$DPI.png" ]; then
                cp "$ICONS_SRC/ic_launcher_round_$DPI.png" "$MIPMAP_DIR/ic_launcher_round.png"
            fi
            if [ -f "$ICONS_SRC/ic_launcher_foreground_$DPI.png" ]; then
                cp "$ICONS_SRC/ic_launcher_foreground_$DPI.png" "$MIPMAP_DIR/ic_launcher_foreground.png"
            fi
        done
        log "   $COPIED densidad(es) de icono admin copiadas"
    else
        warn "Paso 7g — No se encontró $ICONS_SRC. Se usa el icono default."
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
APK_OUT="$APK_OUT_DIR/${BUILD_MODE}-$(date +%Y%m%d-%H%M).apk"
cp "$APK_BUILT" "$APK_OUT"
SIZE=$(du -h "$APK_OUT" | cut -f1)

# ---------- Paso 9: Publicar en Apache (/var/www/boton-panico/downloads) ----------
DOWNLOADS_DIR="$PROJECT_ROOT/downloads"
mkdir -p "$DOWNLOADS_DIR"
cp "$APK_BUILT" "$DOWNLOADS_DIR/$APK_FILENAME"
chmod 644 "$DOWNLOADS_DIR/$APK_FILENAME"

# Leer APP_VERSION desde el código fuente del frontend
APP_VERSION=$(grep -E "APP_VERSION\s*=" "$FRONTEND_DIR/src/lib/appVersion.js" | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
APP_VERSION="${APP_VERSION:-1.0.0}"

# Generar version.json (o version-admin.json)
cat > "$DOWNLOADS_DIR/$VERSION_JSON_FILENAME" <<EOF
{
  "version": "$APP_VERSION",
  "versionCode": $NEW_CODE,
  "apk_url": "/boton-panico/downloads/$APK_FILENAME",
  "build_mode": "$BUILD_MODE",
  "changelog": "Build $(date '+%Y-%m-%d %H:%M')",
  "build_timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}
EOF
chmod 644 "$DOWNLOADS_DIR/$VERSION_JSON_FILENAME"

# Restaurar capacitor.config.json original si habíamos buildeado admin
if [ "$BUILD_MODE" = "admin" ] && [ -f "$FRONTEND_DIR/capacitor.config.json.backup" ]; then
    mv "$FRONTEND_DIR/capacitor.config.json.backup" "$FRONTEND_DIR/capacitor.config.json"
    log "   → capacitor.config.json restaurado"
fi

log ""
log "============================================"
log "  ✅ APK ${BUILD_MODE^^} GENERADA EXITOSAMENTE"
log "============================================"
log "  Archivo: $APK_OUT"
log "  Tamaño: $SIZE"
log "  Versión: $APP_VERSION (versionCode: $NEW_CODE)"
log ""
log "  📤 Publicado en Apache:"
log "     $DOWNLOADS_DIR/$APK_FILENAME"
log "     $DOWNLOADS_DIR/$VERSION_JSON_FILENAME"
log ""
log "  Descarga pública:"
log "     https://www.aranduinformatica.net/boton-panico/downloads/$APK_FILENAME"
log ""
if [ "$BUILD_MODE" = "admin" ]; then
log "  🛡️ Modo ADMIN — para operadores de ÑACURUTU"
log "  Para compilar también la APK Cliente: sudo bash deploy/build-android-apk.sh"
else
log "  🚨 Modo CLIENTE — para usuarios finales con botón SOS"
log "  Para compilar también la APK Admin: sudo bash deploy/build-android-apk.sh --admin"
fi
log "============================================"

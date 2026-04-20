# 🔄 Cómo actualizar la App Android (ÑACURUTU Seguridad)

Este documento explica el flujo completo para publicar una nueva versión de la aplicación Android.

---

## 🧠 Arquitectura de actualización

La app nativa (Capacitor) **verifica automáticamente** si hay una nueva versión cada vez que el usuario abre la pantalla principal. El mecanismo es:

1. La app embebida tiene una constante `APP_VERSION` (en `frontend/src/lib/appVersion.js`).
2. Al abrir la app, se hace fetch a `https://www.aranduinformatica.net/boton-panico/downloads/version.json`.
3. Si la versión remota es **mayor** que la embebida → aparece un banner rojo arriba con botón **ACTUALIZAR**.
4. Al presionar, se abre el navegador externo, baja el APK y Android dispara el instalador.

> **Usuarios web**: nunca ven el banner. Siempre tienen la última versión al recargar la página.

---

## 📦 Paso a paso para publicar una actualización

### 1. Bumpeá la versión en el código

Editá **`/var/www/boton-panico/frontend/src/lib/appVersion.js`**:

```js
export const APP_VERSION = "1.0.1";  // 👈 subí este número
```

Reglas de versionado (semver):

- `1.0.0 → 1.0.1` → patch (bugfix)
- `1.0.0 → 1.1.0` → minor (nueva feature)
- `1.0.0 → 2.0.0` → major (cambio grande / breaking)

### 2. Corré el script de build

```bash
sudo bash /var/www/boton-panico/deploy/build-android-apk.sh
```

El script ahora **automáticamente**:

- Compila React + sincroniza Capacitor
- Genera la APK
- La copia a `/var/www/boton-panico/downloads/nacurutu-latest.apk`
- Genera `/var/www/boton-panico/downloads/version.json` con la versión, URL y timestamp
- Guarda backup timestampado en `/root/apks/`

### 3. Verificá que la descarga funcione

```bash
curl -I https://www.aranduinformatica.net/boton-panico/downloads/nacurutu-latest.apk
curl -s https://www.aranduinformatica.net/boton-panico/downloads/version.json | jq
```

Deberías ver en el JSON la nueva versión.

### 4. ¡Listo!

Los usuarios que ya tienen instalada la app verán automáticamente el banner rojo al abrirla. Al presionar **ACTUALIZAR**, Android descarga el APK y pregunta si quieren actualizar.

---

## 📝 Editar el changelog (opcional)

Si querés mostrar un mensaje personalizado en el banner, editá `version.json` manualmente **después** de correr el script:

```bash
sudo nano /var/www/boton-panico/downloads/version.json
```

Ejemplo:

```json
{
  "version": "1.0.1",
  "apk_url": "/boton-panico/downloads/nacurutu-latest.apk",
  "changelog": "Arreglo de ubicación en pánico + notificaciones push mejoradas",
  "build_timestamp": "2026-04-20T00:30:00Z"
}
```

El campo `changelog` aparece en el banner debajo del nombre de la versión.

---

## 🛡️ Notas importantes

- **Android pide permiso de "Instalar apps desconocidas"** la primera vez. El usuario tiene que aceptarlo → luego no vuelve a preguntar.
- **`versionCode` se auto-incrementa en cada build** — el script lee el contador desde `/var/www/boton-panico/.apk-version-code` y lo suma +1. Esto garantiza que Android SIEMPRE considere el APK nuevo como "más reciente" que el instalado, evitando errores tipo *"la aplicación ya está instalada con la misma versión"*.
- **`versionName`** se sincroniza automáticamente desde `APP_VERSION` de `appVersion.js`. Si bumpeás a `1.0.2` ahí, el APK muestra 1.0.2 en la config de Android.
- **Si querés resetear el contador** (por ejemplo después de una instalación limpia sin historial), editá `/var/www/boton-panico/.apk-version-code` y poné un número. El próximo build partirá de ese +1.
- **Para release (Play Store o distribución firmada)**, se requiere una keystore persistente. Se puede agregar al script más adelante.

---

## 🐛 Troubleshooting

| Síntoma | Causa probable | Solución |
|---------|---------------|----------|
| El banner nunca aparece | `version.json` no se sirve | Curlear la URL y verificar `Content-Type: application/json` |
| Banner aparece pero nunca se actualiza | La versión embebida ya coincide | Bumpeá `APP_VERSION` y reconstruí |
| El APK baja pero Android rechaza instalar | Certificado incompatible con versión anterior | Desinstalá la app vieja primero, o usá la misma keystore |
| Descarga se guarda como `.html` | Apache no tiene Alias correcto para `/downloads` | Revisá `apache-boton-panico.conf` — el Alias debe ir ANTES del Alias de React |

/**
 * voicePanic.js
 * Helpers para la función "Escucha de voz" (MicListenerService).
 *
 * Flujo:
 *   1. Usuario activa la escucha desde Configuración → MicListenerPlugin.start(keyword)
 *   2. El servicio Android escucha el micrófono en ciclos cortos con SpeechRecognizer
 *   3. Al detectar la palabra clave dispara nacurutu://panic?source=voice
 *   4. La app lo captura via App.getLaunchUrl() o appUrlOpen y envía el pánico
 *
 * Sin wake word propio — usa el SpeechRecognizer del sistema (Google).
 */

const KEYWORD_KEY = "nacurutu_voice_keyword";

/** Palabra clave guardada por el usuario. Default: "icaro". */
export function getVoiceKeyword() {
  try {
    return localStorage.getItem(KEYWORD_KEY) || "icaro";
  } catch {
    return "icaro";
  }
}

/** Guarda la palabra clave elegida. */
export function setVoiceKeyword(keyword) {
  try {
    const clean = (keyword || "icaro").toLowerCase().trim();
    localStorage.setItem(KEYWORD_KEY, clean);
  } catch {}
}

// ── MicListenerPlugin bridge ──────────────────────────────────────────────────

async function getMicListenerPlugin() {
  const { registerPlugin } = await import("@capacitor/core");
  return registerPlugin("MicListener");
}

/**
 * Inicia el servicio de escucha en ciclos cortos.
 * @param {string} [kw] - Palabra clave (usa la guardada si se omite)
 * @returns {Promise<boolean>}
 */
export async function startMicListener(kw) {
  try {
    // El permiso RECORD_AUDIO es solicitado nativamente por MicListenerPlugin.java
    // usando el sistema de permisos de Capacitor → diálogo nativo de Android.
    const MicListener = await getMicListenerPlugin();
    await MicListener.start({ keyword: kw || getVoiceKeyword() });
    return true;
  } catch (e) {
    console.error("MicListener.start:", e);
    return false;
  }
}

/**
 * Detiene el servicio de escucha.
 * @returns {Promise<boolean>}
 */
export async function stopMicListener() {
  try {
    const MicListener = await getMicListenerPlugin();
    await MicListener.stop();
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifica si el servicio de escucha está corriendo.
 * @returns {Promise<boolean>}
 */
export async function isMicListenerRunning() {
  try {
    const MicListener = await getMicListenerPlugin();
    const res = await MicListener.isRunning();
    return res.running === true;
  } catch {
    return false;
  }
}

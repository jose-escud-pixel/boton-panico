/**
 * Utility to announce new alerts with browser TTS (Spanish).
 * Usage: speakAlertType("panic") → dice "Pánico"
 */

const PHRASES = {
  panic: "Pánico",
  fire: "Fuego",
  medical: "Asistencia",
  on_way: "En camino",
  here: "Estoy aquí",
  silent: "Alerta silenciosa",
  normal: "Alerta nueva",
};

let audioContext = null;

/** Beep corto antes del texto (0.2s, 880Hz) para llamar la atención */
function playBeep() {
  try {
    if (!audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioContext = new Ctx();
    }
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(audioContext.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.25);
    osc.stop(audioContext.currentTime + 0.25);
  } catch {}
}

export function speakAlertType(type) {
  playBeep();
  try {
    if (!("speechSynthesis" in window)) return;
    const phrase = PHRASES[type] || "Nueva alerta";
    // Beep primero, luego texto (esperar 300ms)
    setTimeout(() => {
      try {
        const utter = new SpeechSynthesisUtterance(phrase);
        utter.lang = "es-ES";
        utter.rate = 1.0;
        utter.pitch = 1.0;
        utter.volume = 1.0;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
      } catch {}
    }, 300);
  } catch {}
}

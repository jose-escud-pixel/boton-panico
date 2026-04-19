/**
 * SirenManager - sirena sintética con Web Audio API.
 * Se inicia con start() y suena continuamente hasta stop().
 * Usa oscilador sawtooth + LFO para efecto de sirena.
 */

class SirenManager {
  constructor() {
    this.playing = false;
    this.ctx = null;
    this.nodes = null;
  }

  _ensureCtx() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  isPlaying() {
    return this.playing;
  }

  start() {
    if (this.playing) return;
    const ctx = this._ensureCtx();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 750;

      const gain = ctx.createGain();
      gain.gain.value = 0.10;

      // LFO para barrido tipo sirena
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 1.1;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 260;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      osc.connect(gain).connect(ctx.destination);
      osc.start();
      lfo.start();

      this.nodes = { osc, gain, lfo };
      this.playing = true;
    } catch (e) {
      console.error("SirenManager start failed", e);
    }
  }

  stop() {
    if (!this.playing || !this.nodes) return;
    try {
      const now = this.ctx.currentTime;
      this.nodes.gain.gain.setValueAtTime(this.nodes.gain.gain.value, now);
      this.nodes.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      setTimeout(() => {
        try {
          this.nodes?.osc?.stop();
          this.nodes?.lfo?.stop();
        } catch {}
        this.nodes = null;
        this.playing = false;
      }, 180);
    } catch {
      this.nodes = null;
      this.playing = false;
    }
  }
}

export const sirenManager = new SirenManager();

/** Dice una frase en español TTS */
export function speak(phrase) {
  try {
    if (!("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(phrase);
    utter.lang = "es-ES";
    utter.rate = 1.0;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  } catch {}
}

/**
 * Univers sonore tactique — 100 % synthétisé via Web Audio (aucun fichier).
 * Bips de saisie, alarmes sismiques, balayage système, séquence d'init.
 */
class AudioService {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  /** Doit être appelé sur une interaction utilisateur (politique autoplay). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.18;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.18;
  }

  isMuted() {
    return this.muted;
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    when = 0,
    peak = 1,
  ) {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  /** Bip discret de saisie / clic UI. */
  blip() {
    this.tone(880, 0.06, 'square', 0, 0.4);
  }

  /** Toggle de calque : double bip ascendant. */
  toggle() {
    this.tone(660, 0.05, 'triangle', 0, 0.5);
    this.tone(990, 0.06, 'triangle', 0.05, 0.5);
  }

  /** Confirmation de sélection. */
  select() {
    this.tone(523, 0.05, 'sine', 0, 0.5);
    this.tone(784, 0.08, 'sine', 0.04, 0.5);
  }

  /** Balayage système (changement de mode rendu / NVG). */
  sweep() {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t0);
    osc.frequency.exponentialRampToValueAtTime(1400, t0 + 0.35);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 0.42);
  }

  /** Alarme de séisme majeur (magnitude élevée). */
  alarm() {
    this.tone(440, 0.18, 'sawtooth', 0, 0.7);
    this.tone(330, 0.18, 'sawtooth', 0.2, 0.7);
    this.tone(440, 0.18, 'sawtooth', 0.4, 0.7);
  }

  /** Séquence d'initialisation : fréquences ascendantes. */
  boot() {
    const notes = [261, 329, 392, 523, 659];
    notes.forEach((f, i) => this.tone(f, 0.18, 'triangle', i * 0.12, 0.5));
  }
}

export const audio = new AudioService();
